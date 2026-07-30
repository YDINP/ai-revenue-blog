// /generate 의 "핫 키워드" 후보 수집
//
// 소스:
//   🌱 시드      — 레포 scripts/category-seeds.json 중 "아직 안 쓴" 키워드
//                  (slug 는 영문이라 한글 키워드가 매칭되지 않으므로 RSS 글 제목으로 판정)
//   📰 뉴스      — Google + Bing 두 엔진. 검색어는 고정값이 아니라 시드 키워드 풀에서
//                  매번 새로 뽑고(카테고리 분산 + 내 인기글 파생) → 새로고침마다 다른 결과
//   💻 Hacker News — 시드의 영문 searchTerms 에서 만든 필터로 관련 글만
//   📈 내 인기글 — 유입 있는 글의 후속편 후보
//
// 실데이터 확인: GITHUB_TOKEN=$(gh auth token) node scripts/check-hot-keywords.mjs [mg|pc]

import { communityHot, toQuery } from './_community.js';
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
  return rssItems(xml).map((i) => i.title);
}

// 제목 + 발행일 (발행일로 오래된 기사를 걸러낸다 — 빙은 2018년 기사도 올려보냄)
function rssItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => {
      const block = m[1];
      const t = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      const d = block.match(/<pubDate>([^<]+)<\/pubDate>/);
      const date = d ? new Date(d[1]) : null;
      return {
        title: t ? decodeEntities(t[1]).trim() : '',
        at: date && !isNaN(date) ? date.getTime() : null,
      };
    })
    .filter((i) => i.title);
}

// 뉴스로 쓸 수 없는 잡음
//  - 커밋/PR 제목 (빙이 코드 저장소 페이지를 물어옴)
//  - 홍보·이벤트, 커머스 스팸("추천 순위", "최저가", 디시 등 어그리게이터)
//  - 연예 가십 (검색어가 '금연·건강'이어도 연예 기사가 상위에 옴)
const JUNK_RE = new RegExp(
  [
    '^(refactor|feat|fix|chore|docs|test)[:(]',
    '#\\d{2,}',
    '이벤트|증정|할인쿠폰|당첨|사은품|프로모션|출시 기념',
    '추천 순위|최저가|구매 가이드|디시|쿠팡|파트너스',
    '순간포착|헬스톡|연예|배우|가수|아이돌|예능|열애|결혼설|이혼|출연',
    // 연예인 근황·인증샷류 (검색어가 '오운완' 같은 커뮤니티 밈일 때 상위에 올라옴)
    '셀카|인증샷|복근|몸매|화보|근황|♥|일상 공개',
    // 사건사고·정치 — 검색어와 무관하게 뉴스 상단에 자주 올라온다
    '살해|성폭행|음주운전|사망|숨진|체포|구속|피의자|유기한|친모|계부|징역|검찰|의원|대통령',
  ].join('|'),
  'i'
);

const FRESH_MS = 30 * 86400000;   // 30일 이내 기사만

// 검색어와 실제로 관련 있는지 판정.
// 아무 토큰이나 걸리면 통과시키면 '관리·습관' 같은 흔한 말 때문에 무관한 기사가 들어온다
// (예: 검색어 "건강 관리" → "청주시 물 관리 전략"). 검색어의 핵심어(첫 토큰)가 있거나
// 토큰 2개 이상이 겹칠 때만 통과시킨다.
function relevant(title, query) {
  const tokens = String(query)
    .split(/\s+/)
    .map((t) => t.replace(/[^가-힣a-zA-Z0-9]/g, ''))
    .filter((t) => t.length >= 2);
  if (!tokens.length) return true;
  const t = title.toLowerCase();
  const has = (tok) => t.includes(tok.toLowerCase());
  return has(tokens[0]) || tokens.filter(has).length >= 2;
}

function usableNews(item, query) {
  if (!item.title || item.title.length < 8) return false;
  if (!/[가-힣]/.test(item.title)) return false;
  if (JUNK_RE.test(item.title)) return false;
  if (item.at && Date.now() - item.at > FRESH_MS) return false;   // 옛 기사 제외
  if (!relevant(item.title, query)) return false;
  return true;
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ── 이미 쓴 글의 제목 (RSS. 실패 시 slug 로 폴백) ──
async function publishedTitles(blog) {
  try {
    // rssPath 는 블로그마다 다르다 — Astro 는 /rss.xml, WordPress(뭉게)는 /feed/ 다.
    // 고정 /rss.xml 로 부르면 뭉게에서 404 → 이미 쓴 주제를 못 걸러 중복 글이 나온다.
    const titles = rssTitles(await fetchText(`${blog.site}${blog.rssPath || '/rss.xml'}`));
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
    return tokens.filter((tok) => t.includes(tok.toLowerCase())).length >= need;
  });
}

// ── 🌱 미사용 시드 (카테고리 라운드로빈) ──
function unusedSeeds(seeds, titles, limit = 4) {
  const byCat = {};
  for (const cat of seeds?.categories || []) {
    for (const kw of shuffle(cat.keywords || [])) {
      if (alreadyCovered(kw, titles)) continue;
      (byCat[cat.name] ||= []).push({ kw, category: cat.name });
    }
  }
  const out = [];
  for (let i = 0; out.length < limit; i++) {
    let added = false;
    for (const c of shuffle(Object.keys(byCat))) {
      if (byCat[c][i]) { out.push(byCat[c][i]); added = true; }
      if (out.length >= limit) break;
    }
    if (!added) break;
  }
  return out;
}

// ── 뉴스 검색어 생성 ──
// 1순위: 커뮤니티에서 "지금" 화제인 키워드 (긱뉴스·HN·뽐뿌)
// 2순위: 시드 키워드 풀 (커뮤니티가 조용하거나 실패했을 때)
// + 실제 유입되는 인기글에서 파생한 쿼리 1개
function buildQueries(community, seeds, myTitles, count = 4) {
  const queries = [];

  // 키워드에 게시판 문맥어를 얹어 검색 (예: "울트라" → "울트라 스마트폰")
  community.keywords.slice(0, count - 1).forEach((k) => queries.push(toQuery(k)));

  if (queries.length < count - 1) {
    const cats = shuffle((seeds?.categories || []).filter((c) => (c.keywords || []).length));
    for (const c of cats) {
      if (queries.length >= count - 1) break;
      // "AI 코딩 도구 추천" → "AI 코딩 도구" (검색어로는 추천/팁 같은 꼬리말이 방해)
      const q = shuffle(c.keywords)[0].replace(/\s*(추천|팁|가이드|방법|비교|후기|정리|입문)$/, '').trim();
      if (q.length >= 2) queries.push(q);
    }
  }

  const mine = myTitles[0];
  if (mine) {
    const q = mine
      .replace(/^\d{4}년?\s*/, '')
      .split(/[:：·|(]/)[0]
      .split(/\s+/)
      .slice(0, 3)
      .join(' ')
      .trim();
    if (q.length >= 3) queries.push(q);
  }
  return [...new Set(queries)].slice(0, count);
}

// ── 📰 뉴스 (Google + Bing) ──
// 구글 뉴스 제목은 " - 매체명" 이 붙고, 매체명이 두 번 반복되기도 한다.
function cleanHeadline(t) {
  let s = String(t).trim();
  const m = s.match(/\s+-\s+([^-]{2,20})$/);
  if (!m) return s;
  const source = m[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\s+-\\s+${source}$`);
  while (re.test(s)) s = s.replace(re, '').trim();
  return s;
}

const normTitle = (s) => String(s).toLowerCase().replace(/[^가-힣a-z0-9]/g, '');

function dedupe(items, keyOf = (x) => x.headline) {
  const seen = [];
  return items.filter((it) => {
    const n = normTitle(keyOf(it));
    if (!n) return false;
    if (seen.some((s) => s.includes(n.slice(0, 12)) || n.includes(s.slice(0, 12)))) return false;
    seen.push(n);
    return true;
  });
}

async function googleNews(q) {
  const xml = await fetchText(
    `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&hl=ko&gl=KR&ceid=KR:ko`
  );
  // 매체명을 먼저 떼고 검사한다. 원본 제목은 "<영문 기사> - 아주경제" 처럼 매체명만 한글이라
  // 한글 검사를 통과해버린다 (그 뒤 매체명을 떼면 영문 기사만 남음)
  return rssItems(xml)
    .map((i) => ({ ...i, title: cleanHeadline(i.title) }))
    .filter((i) => usableNews(i, q))
    .slice(0, 2)
    .map((i) => ({ headline: i.title, query: q, engine: 'google' }));
}

async function bingNews(q) {
  // qft=interval="8" = 최근 7일 (없으면 몇 년 전 기사도 섞여 나옴)
  const xml = await fetchText(
    `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=RSS&setmkt=ko-KR&qft=interval%3d%228%22`
  );
  // 매체명을 먼저 떼고 검사한다. 원본 제목은 "<영문 기사> - 아주경제" 처럼 매체명만 한글이라
  // 한글 검사를 통과해버린다 (그 뒤 매체명을 떼면 영문 기사만 남음)
  return rssItems(xml)
    .map((i) => ({ ...i, title: cleanHeadline(i.title) }))
    .filter((i) => usableNews(i, q))
    .slice(0, 2)
    .map((i) => ({ headline: i.title, query: q, engine: 'bing' }));
}

async function topicNews(queries, limit = 4) {
  const jobs = [];
  queries.forEach((q) => {
    jobs.push(googleNews(q).catch(() => []));
    jobs.push(bingNews(q).catch(() => []));
  });
  const all = (await Promise.all(jobs)).flat();
  const clean = all.filter((r) => r.headline && r.headline !== r.query);
  const byQuery = {};
  dedupe(clean).forEach((r) => { (byQuery[r.query] ||= []).push(r); });
  const out = [];
  for (let i = 0; out.length < limit; i++) {
    let added = false;
    for (const q of Object.keys(byQuery)) {
      if (byQuery[q][i]) { out.push(byQuery[q][i]); added = true; }
      if (out.length >= limit) break;
    }
    if (!added) break;
  }
  return out;
}

// ── 💻 Hacker News — 필터는 시드의 영문 searchTerms 에서 생성 ──
const HN_STOPWORDS = new Set([
  'tips', 'guide', 'beginner', 'best', 'top', 'how', 'the', 'and', 'for', 'with',
  'comparison', 'tutorial', 'trends', 'routine', 'travel', 'meal',
]);

function hnFilterFromSeeds(seeds) {
  const terms = new Set();
  for (const cat of seeds?.categories || []) {
    for (const st of cat.searchTerms || []) {
      for (const w of String(st).split(/\s+/)) {
        const t = w.replace(/[^a-zA-Z0-9]/g, '');
        if (t.length >= 3 && !HN_STOPWORDS.has(t.toLowerCase())) terms.add(t.toLowerCase());
      }
    }
  }
  return terms.size ? [...terms] : null;
}

async function hackerNews(filterTerms) {
  if (!filterTerms?.length) return [];
  try {
    const r = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page', {
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return [];
    const j = await r.json();
    const re = new RegExp(`\\b(${filterTerms.join('|')})`, 'i');
    return (j.hits || [])
      .filter((h) => h.title && re.test(h.title))
      .slice(0, 2)
      .map((h) => ({ headline: h.title.trim(), points: h.points }));
  } catch {
    return [];
  }
}

// ── 📈 내 블로그 인기글 ──
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
      // source 가 비어 있는 옛 행을 'blog'(삭제된 소스)로 가정하면 전부 버려진다 → 그대로 비교
      .filter((p) => p.source === blog.source)
      .map((p) =>
        p.title && p.title !== 'null' ? String(p.title).split(' | ')[0].split(' - ')[0].trim() : ''
      )
      .filter((t) => t.length > 6)
      .slice(0, 3);
  } catch {
    return [];
  }
}

// 후보 목록 (최대 12) — { label, topic, category, src }
export async function hotKeywords(blog) {
  // 시드를 먼저 읽어 도메인 어휘를 만들고, 그것으로 커뮤니티 잡담을 걸러낸다
  const [seeds, titles, mine] = await Promise.all([
    getFileJson(blog, 'scripts/category-seeds.json').catch(() => null),
    publishedTitles(blog),
    myTopPosts(blog),
  ]);
  const community = await communityHot(blog, seeds).catch(() => ({ keywords: [], posts: [] }));

  const queries = buildQueries(community, seeds, mine);
  const hnTerms = seeds ? hnFilterFromSeeds(seeds) : null;

  // Hacker News 는 기술 블로그에만 (라이프스타일 블로그엔 코딩 글이 섞여 무의미)
  const [news, hn] = await Promise.all([
    topicNews(queries.length ? queries : blog.newsQueries || []),
    blog.useHackerNews ? hackerNews(hnTerms) : [],
  ]);

  const out = [];

  // 🔥 커뮤니티에서 지금 화제인 글 (검색어의 출처이기도 함)
  community.posts.forEach((p) =>
    out.push({
      label: `🔥 ${p}`,
      topic: `${p} — 커뮤니티에서 화제인 이슈, 배경과 실무 관점 정리`,
      category: 'auto',
      src: 'community',
    })
  );
  news.forEach((n) =>
    out.push({
      label: `📰 ${n.headline}`,
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
  unusedSeeds(seeds, titles, 3).forEach((s) =>
    out.push({ label: `🌱 ${s.kw}`, topic: s.kw, category: s.category, src: 'seed' })
  );
  mine.slice(0, 2).forEach((t) =>
    out.push({
      label: `📈 ${t} — 후속편`,
      topic: `${t} 후속편 (심화·최신 업데이트)`,
      category: 'auto',
      src: 'mine',
    })
  );
  return out.slice(0, 12);
}
