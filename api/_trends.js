// /generate 의 "핫 키워드" 후보 수집
//
// 소스 3종:
//   🌱 시드      — 각 레포 scripts/category-seeds.json 중 "아직 안 쓴" 키워드
//                  (기존 글 제목과 대조. slug 는 영문이라 한글 키워드가 매칭되지 않으므로
//                   RSS 피드의 제목으로 판정한다)
//   📰 뉴스      — 블로그 주제 쿼리로 Google 뉴스 검색 (실시간 급상승 검색어는 연예·스포츠
//                  위주라 블로그와 무관해 사용하지 않음)
//   📈 내 인기글 — 유입 있는 글의 후속편 후보

import { getFileJson, listPosts } from './_github.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './_shared.js';

const decodeEntities = (s) =>
  String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

async function fetchText(url, ms = 6000) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function rssTitles(xml) {
  return [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)]
    .map((m) => decodeEntities(m[1]).trim())
    .filter(Boolean);
}

// ── 이미 쓴 글의 제목 (RSS. 실패 시 slug 로 폴백) ──
async function publishedTitles(blog) {
  try {
    const xml = await fetchText(`${blog.site}/rss.xml`);
    const titles = rssTitles(xml);
    if (titles.length) return titles;
  } catch { /* 폴백 */ }
  try {
    const posts = await listPosts(blog, 60);
    return posts.map((p) => p.slug.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' '));
  } catch {
    return [];
  }
}

// 키워드가 기존 글에서 이미 다뤄졌는지 — 의미 토큰(2자 이상)의 과반이 한 제목에 등장하면 사용됨
function alreadyCovered(keyword, titles) {
  const tokens = keyword
    .split(/\s+/)
    .map((t) => t.replace(/[^가-힣a-zA-Z0-9]/g, ''))
    .filter((t) => t.length >= 2);
  if (!tokens.length) return false;
  const need = Math.max(1, Math.ceil(tokens.length * 0.6));
  return titles.some((title) => {
    const t = title.toLowerCase();
    const hit = tokens.filter((tok) => t.includes(tok.toLowerCase())).length;
    return hit >= need;
  });
}

// ── 🌱 미사용 시드 ──
async function unusedSeeds(blog) {
  try {
    const [seeds, titles] = await Promise.all([
      getFileJson(blog, 'scripts/category-seeds.json'),
      publishedTitles(blog),
    ]);
    const byCat = {};
    for (const cat of seeds?.categories || []) {
      for (const kw of cat.keywords || []) {
        if (alreadyCovered(kw, titles)) continue;
        (byCat[cat.name] ||= []).push({ kw, category: cat.name });
      }
    }
    // 카테고리 라운드로빈으로 고르게
    const mixed = [];
    for (let i = 0; mixed.length < 6; i++) {
      const cats = Object.keys(byCat);
      if (!cats.length) break;
      let added = false;
      for (const c of cats) {
        if (byCat[c][i]) { mixed.push(byCat[c][i]); added = true; }
        if (mixed.length >= 6) break;
      }
      if (!added) break;
    }
    return mixed;
  } catch {
    return [];
  }
}

// ── 📰 블로그 주제 기반 최신 뉴스 (Google News RSS) ──
// 구글 뉴스 제목은 " - 매체명" 이 붙는데, 매체명이 두 번 반복되는 경우가 있어
// 같은 매체명이면 반복해서 떼어낸다. (예: "… 마무리 - 머니투데이 - 머니투데이")
function cleanHeadline(t) {
  let s = String(t).trim();
  const m = s.match(/\s+-\s+([^-]{2,20})$/);
  if (!m) return s;
  const source = m[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\s+-\\s+${source}$`);
  while (re.test(s)) s = s.replace(re, '').trim();
  return s;
}

async function topicNews(blog) {
  const queries = blog.newsQueries || [];
  const results = await Promise.all(
    queries.map(async (q) => {
      try {
        const xml = await fetchText(
          `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&hl=ko&gl=KR&ceid=KR:ko`
        );
        const t = rssTitles(xml)[0];
        return t ? { headline: cleanHeadline(t), query: q } : null;
      } catch {
        return null;
      }
    })
  );
  return results
    .filter(Boolean)
    .filter((r) => r.headline.length >= 8 && /[가-힣]/.test(r.headline))
    .slice(0, 3);
}

// ── 📈 내 블로그 인기글 → 후속편 ──
async function myTopPosts(blog) {
  if (!blog.source) return [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_top_pages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_limit: 30 }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : [])
      .filter((p) => (p.source || 'blog') === blog.source)
      .map((p) =>
        p.title && p.title !== 'null'
          ? String(p.title).split(' | ')[0].split(' - ')[0].trim()
          : ''
      )
      .filter((t) => t.length > 6)
      .slice(0, 2);
  } catch {
    return [];
  }
}

// 후보 목록 (최대 10) — { label, topic, category, src }
export async function hotKeywords(blog) {
  const [seeds, news, mine] = await Promise.all([
    unusedSeeds(blog),
    topicNews(blog),
    myTopPosts(blog),
  ]);

  const out = [];
  seeds.forEach((s) =>
    out.push({ label: `🌱 ${s.kw}`, topic: s.kw, category: s.category, src: 'seed' })
  );
  news.forEach((n) =>
    out.push({
      label: `📰 ${n.headline}`,
      // 뉴스 헤드라인 그대로가 아니라 "이 이슈를 다루는 글"로 주제화
      topic: `${n.headline} — 최신 이슈 해설 및 실무 관점 정리 (${n.query})`,
      category: 'auto',
      src: 'news',
    })
  );
  mine.forEach((t) =>
    out.push({
      label: `📈 ${t} — 후속편`,
      topic: `${t} 후속편 (심화·최신 업데이트)`,
      category: 'auto',
      src: 'mine',
    })
  );
  return out.slice(0, 10);
}
