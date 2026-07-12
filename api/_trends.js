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

// ── 📰 블로그 주제 기반 최신 뉴스 (Google + Bing 두 엔진) ──
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

// 제목 유사도 — 엔진이 달라도 같은 사건은 중복 제거
const normTitle = (s) =>
  String(s).toLowerCase().replace(/[^가-힣a-z0-9]/g, '');

function dedupe(items, keyOf = (x) => x.headline) {
  const seen = [];
  return items.filter((it) => {
    const n = normTitle(keyOf(it));
    if (!n) return false;
    const dup = seen.some((s) => s.includes(n.slice(0, 12)) || n.includes(s.slice(0, 12)));
    if (dup) return false;
    seen.push(n);
    return true;
  });
}

async function googleNews(q) {
  const xml = await fetchText(
    `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&hl=ko&gl=KR&ceid=KR:ko`
  );
  return rssTitles(xml).slice(0, 2).map((t) => ({ headline: cleanHeadline(t), query: q, engine: 'google' }));
}

async function bingNews(q) {
  const xml = await fetchText(
    `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=RSS&setmkt=ko-KR`
  );
  // 첫 title 은 쿼리 에코라 제외
  return rssTitles(xml).slice(0, 2).map((t) => ({ headline: cleanHeadline(t), query: q, engine: 'bing' }));
}

async function topicNews(blog) {
  const queries = blog.newsQueries || [];
  const jobs = [];
  queries.forEach((q) => {
    jobs.push(googleNews(q).catch(() => []));
    jobs.push(bingNews(q).catch(() => []));
  });
  const all = (await Promise.all(jobs)).flat();
  const clean = all.filter(
    (r) => r.headline && r.headline.length >= 8 && /[가-힣]/.test(r.headline) && r.headline !== r.query
  );
  // 쿼리별로 고르게 (한 주제가 목록을 독점하지 않도록)
  const byQuery = {};
  dedupe(clean).forEach((r) => { (byQuery[r.query] ||= []).push(r); });
  const out = [];
  for (let i = 0; out.length < 4; i++) {
    let added = false;
    for (const q of Object.keys(byQuery)) {
      if (byQuery[q][i]) { out.push(byQuery[q][i]); added = true; }
      if (out.length >= 4) break;
    }
    if (!added) break;
  }
  return out;
}

// ── 💻 Hacker News 상위 — 기술 블로그용 (해외 개발자 커뮤니티 화제) ──
async function hackerNews(blog) {
  if (!blog.hnKeywords?.length) return [];
  try {
    const r = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page', {
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const j = await r.json();
    const re = new RegExp(blog.hnKeywords.join('|'), 'i');
    return (j.hits || [])
      .filter((h) => h.title && re.test(h.title))
      .slice(0, 2)
      .map((h) => ({ headline: h.title.trim(), points: h.points }));
  } catch {
    return [];
  }
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

// 후보 목록 (최대 12) — { label, topic, category, src }
export async function hotKeywords(blog) {
  const [seeds, news, hn, mine] = await Promise.all([
    unusedSeeds(blog),
    topicNews(blog),
    hackerNews(blog),
    myTopPosts(blog),
  ]);

  const out = [];
  seeds.slice(0, 4).forEach((s) =>
    out.push({ label: `🌱 ${s.kw}`, topic: s.kw, category: s.category, src: 'seed' })
  );
  news.forEach((n) =>
    out.push({
      label: `📰 ${n.headline}`,
      // 헤드라인 그대로가 아니라 "이 이슈를 다루는 글"로 주제화
      topic: `${n.headline} — 최신 이슈 해설 및 실무 관점 정리 (${n.query})`,
      category: 'auto',
      src: 'news',
    })
  );
  hn.forEach((h) =>
    out.push({
      label: `💻 ${h.headline}`,
      topic: `${h.headline} — 해외 개발자 커뮤니티 화제(Hacker News ${h.points}점), 한국 독자 관점 해설`,
      category: 'auto',
      src: 'hn',
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
  return out.slice(0, 12);
}
