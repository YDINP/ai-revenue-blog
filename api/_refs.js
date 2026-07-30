// 유입 경로 분류 — 자체 트래커 referrer / GA4 source·medium 을 같은 라벨 체계로 묶는다
//
// 왜 한 파일인가: 뭉게는 GA4(sessionSourceMedium), TF/LF/VIP 는 자체 트래커(referrer+UA)로
// 유입을 재는데 라벨이 다르면 리포트에서 두 수치를 나란히 못 놓는다. 분류 규칙을 한 곳에
// 두고 입력만 다르게 받는다. '…검색' 으로 끝나는 라벨은 isSearch() 로 한 번에 합산된다.

// ── 자체 트래커(referrer 호스트) ──
const REF_RULES = [
  [/google\./i, '구글 검색'],
  [/naver\./i, '네이버 검색'],
  [/daum\.|search\.daum/i, '다음 검색'],
  [/bing\.|duckduckgo|yahoo/i, '기타 검색'],
  [/facebook|instagram|threads|twitter|x\.com|t\.co|linkedin|reddit/i, 'SNS'],
  [/kakao|band\.us/i, '카카오/밴드'],
];

// 빈 referrer 를 user_agent 로 재분류 — 메신저/SNS 인앱브라우저는 referrer 를 안 넘겨
// 전부 '직접'으로 뭉치므로 UA 시그니처로 인앱 채널을 분리한다.
export function classifyInAppRef(ua) {
  const u = String(ua || '');
  if (/KAKAOTALK/i.test(u)) return '카카오톡 인앱';
  if (/Instagram/i.test(u)) return 'Instagram 인앱';
  if (/FBAN|FBAV|FB_IAB/i.test(u)) return 'Facebook 인앱';
  if (/Line\//i.test(u)) return 'LINE 인앱';
  if (/NAVER\(inapp/i.test(u)) return 'Naver 앱';
  if (/DaumApps|DaumDevice/i.test(u)) return 'Daum 앱';
  if (/BAND\//i.test(u)) return 'Band 인앱';
  if (/Threads/i.test(u)) return 'Threads 인앱';
  // 참조 없음 + 알려진 인앱 아님 → WebView 시그니처면 '앱 내(무참조)', 아니면 '직접/북마크'
  if (/;\s?wv\)/.test(u) || (/(iPhone|iPad)/.test(u) && /Mobile\//.test(u) && !/Safari/.test(u))) return '앱 내(무참조)';
  return '직접/북마크';
}

// 분류 우선순위: UTM > referrer 호스트 > (빈 referrer)UA 인앱감지 > 직접
export function classifyRef(referrer, ua, utm) {
  if (utm) {
    const s = String(utm).toLowerCase();
    if (/google/.test(s)) return '구글 검색';
    if (/naver/.test(s)) return '네이버 검색';
    if (/daum/.test(s)) return '다음 검색';
    if (/bing|yahoo|duckduckgo/.test(s)) return '기타 검색';
    if (/kakao|band/.test(s)) return '카카오/밴드';
    if (/facebook|instagram|threads|twitter|line|linkedin|reddit/.test(s)) return 'SNS';
    return `기타(${utm})`;
  }
  const r = String(referrer || '').trim();
  if (!r || r === 'direct') return classifyInAppRef(ua);
  for (const [re, label] of REF_RULES) if (re.test(r)) return label;
  try {
    const host = new URL(r).hostname.replace(/^www\./, '');
    if (/^mungge\.com$/.test(host)) return '사이트 내 이동';
    // 구 도메인은 이제 mungge 로 301 된다 — 여기서 잡히면 아직 옛 링크가 돌고 있다는 뜻
    if (/(ai-revenue-blog|life-revenue-blog)\.vercel\.app/.test(host)) return '구 블로그(301)';
    return `기타(${host})`;
  } catch {
    return '기타';
  }
}

// ── GA4 sessionSourceMedium ──
//
// ⚠️ GA4 는 네이버를 검색엔진으로 인식하지 않는다. 실제 값이
// 'm.search.naver.com / referral' 로 들어와 기본 채널그룹에선 Referral 로 빠지므로,
// sessionDefaultChannelGroup 의 'Organic Search' 만 세면 검색 유입이 크게 과소집계된다.
// → 검색 판정은 이 함수(소스 호스트 기준)로 한다.
export function classifyGa4Source(key) {
  const raw = String(key || '').trim();
  if (!raw || raw === '(not set)') return '미분류';
  const [srcRaw, medRaw] = raw.split('/').map((s) => (s || '').trim().toLowerCase());
  const src = srcRaw;
  const med = medRaw;

  if (src === '(direct)') return '직접/북마크';
  if (/^(m\.)?search\.naver\.com$/.test(src) || src === 'naver') return '네이버 검색';
  // 네이버 블로그·카페·포스트는 검색이 아니라 추천 링크다 — 섞으면 "검색이 되고 있다"로 오독된다
  if (/(blog|cafe|post|in|m)\.naver\.com$/.test(src)) return '네이버 블로그/카페';
  if (/(^|\.)google\./.test(src) || src === 'google') return med === 'cpc' ? '구글 광고' : '구글 검색';
  if (/daum/.test(src)) return '다음 검색';
  if (/bing|duckduckgo|yahoo|ecosia|brave/.test(src)) return '기타 검색';
  if (/chatgpt|openai|perplexity|copilot|claude\.ai|gemini/.test(src)) return 'AI 검색';
  if (/threads|instagram|facebook|t\.co|twitter|x\.com|linkedin|reddit|tiktok/.test(src)) return 'SNS';
  if (/kakao|band\.us/.test(src)) return '카카오/밴드';
  if (/mungge\.com$/.test(src)) return '사이트 내 이동';
  if (/(ai-revenue-blog|life-revenue-blog|virtual-in-playing)\.vercel\.app$/.test(src)) return '구 블로그(301)';
  if (med === 'organic') return '기타 검색';
  return `기타(${srcRaw || raw})`;
}

// GA4 기본 채널그룹 → 한글. 소스별 분류(classifyGa4Source)와 달리 "GA4 가 뭐라고 봤나"를
// 그대로 보여주는 용도라 번역만 한다.
const CHANNEL_KO = {
  'Organic Search': '자연 검색',
  'Paid Search': '유료 검색',
  'Direct': '직접',
  'Referral': '추천 링크',
  'Organic Social': '소셜',
  'Paid Social': '유료 소셜',
  'Email': '이메일',
  'Organic Video': '동영상',
  'Organic Shopping': '쇼핑',
  'Display': '디스플레이',
  'AI Assistant': 'AI 어시스턴트',
  'Unassigned': '미분류',
};
export const channelKo = (k) => CHANNEL_KO[k] || k;

// '…검색' 으로 끝나는 라벨 = 검색 유입 (자체 트래커·GA4 공통)
export const isSearch = (label) => /검색$/.test(label);
