// 커뮤니티 실시간 인기글 → 핫키워드 추출
//
// 뉴스 검색어를 시드(고정 풀)에서 뽑으면 "지금 화제"가 아니라 "우리가 쓰려던 주제"가 된다.
// 그래서 커뮤니티에서 지금 인기 있는 글의 제목을 모아 키워드를 추출하고, 그 키워드로
// 뉴스를 검색한다.
//
// 사용 가능한 소스 (2026-07 기준 실측):
//   ✅ 긱뉴스 news.hada.io (Atom)         — 개발/기술/스타트업
//   ✅ Hacker News (Algolia front_page)    — 해외 개발자 커뮤니티
//   ✅ 뽐뿌 rss.php?id=<board>             — money/health/ppomppu(핫딜)/computer/phone
//   ✅ 루리웹 bbs.ruliweb.com/news/rss     — 게임
//   ❌ 클리앙 403 · 루리웹 게시판 RSS 일부만 · 인벤/오늘의유머 빈 응답

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

async function fetchText(url, ms = 6000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

const decodeEntities = (s) =>
  String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

// RSS(item) + Atom(entry) 모두에서 제목 추출. 첫 title 은 피드 제목이라 제외
function feedTitles(xml) {
  const out = [];
  for (const m of xml.matchAll(/<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g)) {
    const t = m[1].match(/<title[^>]*>([\s\S]*?)<\/title>/);
    if (t) {
      const title = decodeEntities(t[1]).trim();
      if (title) out.push(title);
    }
  }
  return out;
}

// ── 소스별 수집 ──
async function geekNews() {
  return feedTitles(await fetchText('https://news.hada.io/rss/news')).slice(0, 30);
}

async function ppomppu(board) {
  return feedTitles(
    await fetchText(`http://www.ppomppu.co.kr/rss.php?id=${board}`)
  ).slice(0, 30);
}

async function hackerNewsTitles() {
  const r = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page', {
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.hits || []).map((h) => h.title).filter(Boolean).slice(0, 30);
}

async function ruliwebNews() {
  return feedTitles(await fetchText('https://bbs.ruliweb.com/news/rss')).slice(0, 30);
}

// blog.communities = ['geeknews','hn','ppomppu:<board>','ruliweb:news']
// 소스별로 나눠서 반환한다 — 합쳐서 빈도만 세면 글이 많은 개발 커뮤니티가 화제를 독점한다.
async function collectBySource(blog) {
  const srcs = blog.communities || [];
  const jobs = srcs.map((src) => {
    if (src === 'geeknews') return geekNews().catch(() => []);
    if (src === 'hn') return hackerNewsTitles().catch(() => []);
    if (src === 'ruliweb:news') return ruliwebNews().catch(() => []);
    const pp = src.match(/^ppomppu:(\w+)$/);
    if (pp) return ppomppu(pp[1]).catch(() => []);
    return Promise.resolve([]);
  });
  const lists = await Promise.all(jobs);
  return srcs.map((src, i) => ({ src, titles: lists[i] })).filter((g) => g.titles.length);
}

// ── 키워드 추출 ──
// 핫딜 제목의 [쇼핑몰]·(가격/무배), 말머리 등을 걷어내고 의미 토큰만 남긴다
function cleanTitle(t) {
  return String(t)
    .replace(/\[[^\]]*\]/g, ' ')      // [G마켓], [톡딜]
    .replace(/\([^)]*\)/g, ' ')       // (9,900원/무배)
    .replace(/\d[\d,.\-~]*원?/g, ' ') // 숫자·가격
    .replace(/[^가-힣a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 조사 제거 (형태소 분석기 없이 근사)
// ⚠️ 한 글자 조사(이/가/는/을…)를 떼면 명사가 망가진다: "네이버페이" → "네이버페".
//    그래서 두 글자 이상 조사만 뗀다.
const JOSA = /(으로|에서|에게|까지|부터|이라고|라고|이나|한테|보다)$/;

// 동사·형용사형은 검색어로 쓰면 엉뚱한 기사를 부른다
// ("만든" → "나를 웃게 만든 분", "가능한" → "원전, 가능한 만큼 다 지어야")
const VERBISH =
  /(하는|되는|있는|없는|만든|만드는|나온|나오는|보는|가는|오는|같은|다른|좋은|많은|한다|했다|입니다|인가요|일까요|어떤가요|안되시는분)$/;
// 짧은 한글 낱말이 관형형 어미로 끝나면 명사가 아니다 (가능한·다양한·간단한·필요한…)
const ADNOMINAL = /^[가-힣]{2,4}(한|된|할|될|던|는)$/;

const STOP = new Set([
  '오늘', '내일', '이번', '지금', '요즘', '진짜', '완전', '그냥', '어디', '무엇', '이거', '저거',
  '입니다', '있는', '없는', '하는', '되는', '했다', '한다', '관련', '정도', '경우', '문제', '이야기',
  '무배', '무료', '최저', '특가', '할인', '쿠폰', '배송', '행사', '판매', '구매', '가격', '세트',
  '사람', '생각', '얘기', '이유', '방법', '느낌', '기분', '사진', '영상',
  // 영문 불용어 — 빠지면 'of'·'an' 같은 게 검색어가 돼 엉뚱한 기사를 물어온다
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'you', 'your', 'how', 'why', 'new', 'show',
  'not', 'are', 'was', 'were', 'its', 'his', 'her', 'our', 'their', 'can', 'has', 'have', 'via',
  'about', 'into', 'over', 'out', 'off', 'all', 'any', 'but', 'more', 'most', 'than', 'then',
  'what', 'when', 'who', 'will', 'now', 'get', 'got', 'use', 'using', 'used', 'like', 'just',
]);

// 수량·단위 — 핫딜 제목의 "3kg", "355ml" 에서 숫자를 떼면 단위만 남아 'KG그룹'·'ML커먼스'
// 같은 무관한 기사를 검색하게 된다
const UNIT_RE =
  /^(kg|g|mg|ml|l|cm|mm|m|km|ea|gb|tb|mb|hz|w|kw|v|ah|mah|inch|in|oz|lb|pcs|set|개|팩|캔|병|매|장|봉|박스|입|년|월|일|시간|분|초)$/i;

// 정치·연예 등 블로그 주제로 부적합한 화제 (커뮤니티 특성상 상위에 자주 옴)
const OFFTOPIC =
  /(대통령|의원|정당|국힘|민주당|검찰|尹|이재명|한동훈|정청래|총선|대선|연예|배우|아이돌|가수|드라마|예능|열애|이혼|결혼설|축구|야구|프로야구)/;

function tokensOf(title) {
  const out = [];
  for (let tok of cleanTitle(title).split(' ')) {
    tok = tok.replace(JOSA, '');
    const key = tok.toLowerCase();
    if (!key || key.length > 12) continue;
    if (/^\d+$/.test(key) || UNIT_RE.test(key)) continue;
    if (STOP.has(key) || VERBISH.test(key) || ADNOMINAL.test(key)) continue;
    // 한글은 2자, 영문은 3자 이상 (2자 영문은 of·gn 처럼 의미 없는 조각이 대부분)
    if (/^[a-z0-9]+$/.test(key) ? key.length < 3 : key.length < 2) continue;
    out.push(key);
  }
  return out;
}

// titles: 커뮤니티 인기글 제목 / lexicon: 블로그 도메인 어휘(시드에서 생성)
//
// 커뮤니티에는 우리 주제와 무관한 글이 많아 도메인 어휘에 걸리는 제목에서만 키워드를 뽑는다.
// 또 단일 낱말은 너무 일반적이라("결제") 검색이 엉뚱한 데로 샌다 → 인접 두 낱말(구)을
// 우선 쓰고, 구가 없으면 도메인 어휘에 속한 낱말만 쓴다.
export function extractKeywords(titles, lexicon = null, limit = 5) {
  const inDomain = (toks, raw) => {
    if (!lexicon?.size) return true;
    const t = raw.toLowerCase();
    return toks.some((k) => lexicon.has(k)) || [...lexicon].some((w) => w.length >= 2 && t.includes(w));
  };

  const uni = new Map();
  const bi = new Map();

  for (const raw of titles) {
    if (OFFTOPIC.test(raw)) continue;
    const toks = tokensOf(raw);
    if (!toks.length || !inDomain(toks, raw)) continue;
    for (const key of new Set(toks)) uni.set(key, (uni.get(key) || 0) + 1);
    for (let i = 0; i + 1 < toks.length; i++) {
      const phrase = `${toks[i]} ${toks[i + 1]}`;
      bi.set(phrase, (bi.get(phrase) || 0) + 1);
    }
  }

  // 게시판 관용어 제외: 글 절반 이상에 나오면 "화제"가 아니라 그 게시판의 말버릇이다
  // (뽐뿌 health 의 '오운완'은 15개 중 12개 → 검색하면 연예인 운동 인증 기사만 나온다)
  const maxCount = Math.max(2, Math.floor(titles.length * 0.4));

  const pick = (map, min) =>
    [...map.entries()]
      .filter(([, n]) => n >= min && n <= maxCount)
      .sort((a, b) => b[1] - a[1])
      .map(([keyword, count]) => ({ keyword, count }));

  const out = pick(bi, 2);                       // 두 글 이상에서 반복된 구 = 화제
  if (out.length < limit) {
    // 낱말 단독은 검색어로 위험하다. 특히 영문 짧은 낱말('ant')은 전혀 다른 기사를 물어오므로
    // 도메인 어휘(시드)에 있는 것만 허용한다. 한글 낱말은 2자 이상이면 허용.
    const words = pick(uni, 2).filter((k) => {
      if (!lexicon?.size) return true;
      if (lexicon.has(k.keyword)) return true;
      return /[가-힣]/.test(k.keyword) && k.keyword.length >= 2;
    });
    for (const w of words) {
      if (out.length >= limit) break;
      if (!out.some((o) => o.keyword.includes(w.keyword))) out.push(w);
    }
  }
  return out.slice(0, limit);
}

// 시드 키워드에서 도메인 어휘 생성 (커뮤니티 잡담을 걸러내는 기준)
export function lexiconFromSeeds(seeds) {
  const lex = new Set();
  for (const cat of seeds?.categories || []) {
    for (const kw of cat.keywords || []) {
      for (const tok of tokensOf(kw)) lex.add(tok);
    }
    for (const st of cat.searchTerms || []) {
      for (const tok of tokensOf(st)) lex.add(tok);
    }
  }
  return lex;
}

// 커뮤니티 실시간 핫키워드 + 대표 인기글 제목
//
// 소스별로 키워드를 뽑고 번갈아 섞는다. 그냥 합치면 글이 많고 어휘가 반복되는 개발
// 커뮤니티(긱뉴스·HN)가 화제를 독점해, 같은 블로그의 기기 리뷰·게임 주제가 묻힌다.
export async function communityHot(blog, seeds = null, limit = 5) {
  const groups = await collectBySource(blog);
  if (!groups.length) return { keywords: [], posts: [] };
  const lexicon = seeds ? lexiconFromSeeds(seeds) : null;

  const perSource = groups.map((g) => ({
    src: g.src,
    titles: g.titles,
    // 게시판 자체가 이미 주제별(기기·게임·재테크)이라 도메인 어휘 게이트는
    // 잡담이 섞이는 종합 소스에만 적용한다
    keywords: extractKeywords(g.titles, TOPICAL.has(g.src) ? null : lexicon, 3),
  }));

  const keywords = [];
  const posts = [];
  for (let i = 0; keywords.length < limit; i++) {
    let added = false;
    for (const s of perSource) {
      const k = s.keywords[i];
      if (!k || keywords.some((x) => x.keyword === k.keyword)) continue;
      keywords.push({ ...k, src: s.src });
      added = true;
      if (i === 0) {
        const p = s.titles.find((t) => !OFFTOPIC.test(t) && t.toLowerCase().includes(k.keyword));
        if (p && !posts.includes(p)) posts.push(p);   // 소스마다 대표글 1개
      }
      if (keywords.length >= limit) break;
    }
    if (!added) break;
  }
  return { keywords, posts: posts.slice(0, 4) };
}

// 주제가 이미 고정된 게시판 (도메인 어휘 게이트 불필요)
const TOPICAL = new Set([
  'geeknews', 'ruliweb:news',
  'ppomppu:computer', 'ppomppu:phone', 'ppomppu:money', 'ppomppu:health', 'ppomppu:ppomppu',
]);

// 소스별 문맥어 — 키워드만으로 검색하면 범위가 흩어진다
// ("울트라" → 연예/스포츠 기사, "오운완" → 연예인 셀카). 게시판 주제를 검색어에 얹는다.
export const SOURCE_CONTEXT = {
  'ruliweb:news': '게임',
  'ppomppu:computer': 'PC',
  'ppomppu:phone': '스마트폰',
  'ppomppu:money': '재테크',
  'ppomppu:health': '건강',
  'ppomppu:ppomppu': '쇼핑',
  geeknews: '',
  hn: '',
};

// 커뮤니티 키워드 → 뉴스 검색어
export function toQuery(k) {
  const ctx = SOURCE_CONTEXT[k.src] || '';
  return ctx && !k.keyword.includes(ctx) ? `${k.keyword} ${ctx}` : k.keyword;
}
