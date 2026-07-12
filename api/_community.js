// 커뮤니티 실시간 인기글 → 핫키워드 추출
//
// 뉴스 검색어를 시드(고정 풀)에서 뽑으면 "지금 화제"가 아니라 "우리가 쓰려던 주제"가 된다.
// 그래서 커뮤니티에서 지금 인기 있는 글의 제목을 모아 키워드를 추출하고, 그 키워드로
// 뉴스를 검색한다.
//
// 사용 가능한 소스 (2026-07 기준 실측):
//   ✅ 긱뉴스 news.hada.io (Atom)        — 개발/기술/스타트업
//   ✅ Hacker News (Algolia front_page)   — 해외 개발자 커뮤니티
//   ✅ 뽐뿌 rss.php (EUC-KR 아님, UTF-8)  — 핫딜(소비·생활)/자유게시판
//   ❌ 클리앙 403 · 루리웹 RSS 아님(HTML) · 오늘의유머 빈 응답

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

// blog.communities = ['geeknews','hn','ppomppu:ppomppu','ppomppu:freeboard']
async function collectTitles(blog) {
  const jobs = (blog.communities || []).map((src) => {
    if (src === 'geeknews') return geekNews().catch(() => []);
    if (src === 'hn') return hackerNewsTitles().catch(() => []);
    const pp = src.match(/^ppomppu:(\w+)$/);
    if (pp) return ppomppu(pp[1]).catch(() => []);
    return Promise.resolve([]);
  });
  return (await Promise.all(jobs)).flat();
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

// 조사/접미 제거 (형태소 분석기 없이 근사)
const JOSA = /(으로|에서|에게|까지|부터|이라고|라고|이나|한테|의|가|이|은|는|을|를|에|도|와|과|로|만|랑|보다)$/;

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
    if (STOP.has(key)) continue;
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

  const pick = (map, min) =>
    [...map.entries()]
      .filter(([, n]) => n >= min)
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
export async function communityHot(blog, seeds = null) {
  const titles = await collectTitles(blog);
  if (!titles.length) return { keywords: [], posts: [] };
  const lexicon = seeds ? lexiconFromSeeds(seeds) : null;
  const keywords = extractKeywords(titles, lexicon);
  // 키워드만으론 맥락이 없어 해당 키워드가 등장한 인기글을 대표글로 함께 제시
  const posts = keywords
    .map((k) => titles.find((t) => !OFFTOPIC.test(t) && t.toLowerCase().includes(k.keyword)))
    .filter(Boolean)
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 3);
  return { keywords, posts };
}
