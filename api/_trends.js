// /generate 의 "핫 키워드" 후보 수집
// 3개 소스를 합친다:
//   1) Google 실시간 급상승 검색어(KR) — 지금 사람들이 찾는 것
//   2) 내 블로그 최근 인기 글 — 이미 유입되는 주제의 후속편
//   3) 카테고리 시드 중 아직 안 쓴 키워드 — 각 블로그 repo 의 scripts/category-seeds.json

import { getFileJson, listPosts } from './_github.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './_shared.js';

// ── 1) Google Trends (KR) ──
async function googleTrends() {
  try {
    const r = await fetch('https://trends.google.com/trending/rss?geo=KR', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>[\s\S]*?<title>([^<]+)<\/title>/g)].map((m) =>
      m[1].trim()
    );
    // 인물명 위주(2~4자 한글, 공백 없음)는 블로그 주제로 부적합 → 제외
    return items
      .filter((t) => t && !(/^[가-힣]{2,4}$/.test(t)))
      .slice(0, 6);
  } catch {
    return [];
  }
}

// ── 2) 내 블로그 최근 인기 글 (source 별) ──
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
      .map((p) => {
        const t = p.title && p.title !== 'null' ? String(p.title).split(' | ')[0].split(' - ')[0] : '';
        return t.trim();
      })
      .filter((t) => t && t.length > 6)
      .slice(0, 4);
  } catch {
    return [];
  }
}

// ── 3) 카테고리 시드 중 미사용 키워드 ──
async function unusedSeeds(blog) {
  try {
    const seeds = await getFileJson(blog, 'scripts/category-seeds.json');
    const posts = await listPosts(blog, 60);
    const usedText = posts.map((p) => p.slug).join(' ').toLowerCase();
    const out = [];
    for (const cat of seeds?.categories || []) {
      for (const kw of cat.keywords || []) {
        // slug 는 한글이 그대로 들어가므로 핵심어 포함 여부로 대략 판정
        const core = kw.split(/\s+/)[0].toLowerCase();
        if (core && usedText.includes(core)) continue;
        out.push({ kw, category: cat.name });
      }
    }
    // 카테고리별로 고르게 섞기
    const byCat = {};
    out.forEach((s) => { (byCat[s.category] ||= []).push(s); });
    const mixed = [];
    let i = 0;
    while (mixed.length < 8) {
      const cats = Object.keys(byCat);
      if (!cats.length) break;
      let added = false;
      for (const c of cats) {
        const item = byCat[c][i];
        if (item) { mixed.push(item); added = true; }
        if (mixed.length >= 8) break;
      }
      if (!added) break;
      i++;
    }
    return mixed;
  } catch {
    return [];
  }
}

// 후보 목록 (최대 10) — { label, topic, category, src }
export async function hotKeywords(blog) {
  const [trends, mine, seeds] = await Promise.all([
    googleTrends(),
    myTopPosts(blog),
    unusedSeeds(blog),
  ]);

  const out = [];
  seeds.slice(0, 5).forEach((s) =>
    out.push({ label: `🌱 ${s.kw}`, topic: s.kw, category: s.category, src: 'seed' })
  );
  trends.slice(0, 3).forEach((t) =>
    out.push({ label: `🔥 ${t}`, topic: t, category: 'auto', src: 'trend' })
  );
  mine.slice(0, 2).forEach((t) =>
    out.push({
      label: `📈 ${t} — 후속편`,
      topic: `${t} 후속편 (심화·최신 업데이트)`,
      category: 'auto',
      src: 'mine',
    })
  );
  return out.slice(0, 10);
}
