// Threads 초안 생성기 (GitHub Actions에서 실행)
//  - 블로그 RSS에서 최근 글을 골라 훅 생성(링크=글 URL) 또는 쿠팡 큐레이션(링크=lptag 검색URL)
//  - threads_queue 에 draft 로 저장(service_role) → /api/threads-notify 로 텔레그램 승인카드 발송
// hook-writer 규칙 내장: 첫 줄 훅 ≤10단어, 반말 스친체, 댓글 유도 CTA, 본문에 링크 금지.
//
// env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET,
//      INPUT_ACCOUNT_ID, INPUT_TOPIC, INPUT_COUNT, INPUT_LINKMODE(blog|coupang|mixed)

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const SITE = 'https://ai-revenue-blog.vercel.app';
// 프로젝트 공개 URL 고정. ⚠️ GH secret SUPABASE_URL은 죽은 옛 프로젝트(mkatz…)를
// 가리켜 신뢰 불가 → 라이브 프로젝트 URL 하드코딩(service_role 키가 이 프로젝트 소속).
const SB = 'https://xyprbsmagtlzebxyxsvj.supabase.co';
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TOPIC = {
  life: { site: 'https://life-revenue-blog.vercel.app', niche: '돈·건강·생활 꿀팁' },
  ai: { site: 'https://ai-revenue-blog.vercel.app', niche: '개발·AI·수익화·부업' },
  game: { site: 'https://gameflow-blog.vercel.app', niche: '게임 소개·추천' },
  coupang: { site: null, niche: '쿠팡 상품 큐레이션(가성비·꿀템)' },
};
const COUPANG_LPTAG = 'AF7838146';
const coupangUrl = (kw) => {
  const q = encodeURIComponent(kw);
  return `https://www.coupang.com/np/search?q=${q}&src=1139000&spec=10799999&addtag=200&ctag=${q}&lptag=${COUPANG_LPTAG}&pageType=SEARCH&pageValue=${q}`;
};

const HOOK_RULES = `너는 Threads(메타 스레드) 바이럴 카피라이터다. 아래 규칙을 반드시 지켜라.
- 첫 줄(훅)이 90%다. 첫 줄은 10단어 이하, 스크롤을 멈추게 하라.
- 훅 공식(택1~2): 반직관 진실 / 구체적 숫자 / 손실회피 / 빌린 권위 / 정면 질문 / 비밀·폭로 / before→after / 오류 지적.
- 말투: 완전 반말 + '스친 커뮤니티체'. 독자를 '스친들/다들'로 부른다. 관찰형(~하더라/~던데) + 질문. 존댓말(~요/~죠) 금지, 건조체(~함/~있음) 금지.
- 구조: 훅 1줄 → 전개 2~4줄(한 줄 한 호흡, 줄바꿈 여백) → 마지막 줄은 반드시 '댓글 유도 CTA'(질문/의견 요청).
- 본문에 URL·링크 절대 넣지 마라(링크는 시스템이 첫 댓글에 따로 붙인다).
- 해시태그 남발 금지. 문맥 키워드만 자연스럽게.
- 낚시 금지: 훅의 약속을 본문이 지켜라.`;

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`supabase ${method} ${path} ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

// 블로그 RSS에서 최근 글 [{title, url}] (실패 시 빈 배열 → 홈 링크로 폴백)
async function fetchRecentPosts(site, limit) {
  for (const p of ['/rss.xml', '/rss', '/feed.xml']) {
    try {
      const r = await fetch(site + p);
      if (!r.ok) continue;
      const xml = await r.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
        const b = m[1];
        const title = (b.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1]?.trim();
        const link = (b.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) || [])[1]?.trim();
        return title && link ? { title, url: link } : null;
      }).filter(Boolean);
      if (items.length) return items.slice(0, limit);
    } catch {}
  }
  return [];
}

// LLM 호출 경로. 기본은 로컬 Claude Code CLI(사용자 구독 세션) — GH secrets 의
// ANTHROPIC_API_KEY 가 401 로 죽어 이 워크플로가 멈췄던 이력이 있어, generate-post.mjs 와
// 동일하게 CLI 우선 + HTTP 폴백으로 둔다. BLOG_LLM=http 면 처음부터 HTTP(=GH Actions).
async function claude(prompt) {
  if (process.env.BLOG_LLM !== 'http') {
    try {
      const cli = await import('../../automation/llm-cli.mjs');
      if (cli.claudeCliAvailable()) {
        console.log('[threads-gen][LLM] Claude Code CLI');
        return await cli.callClaudeCli(prompt, { model: process.env.BLOG_CLAUDE_CLI_MODEL || '' });
      }
      console.warn('[threads-gen][LLM] CLI 없음 → HTTP 폴백');
    } catch (e) {
      console.warn(`[threads-gen][LLM] CLI 경로 실패(${e.message}) → HTTP 폴백`);
    }
  }
  console.log('[threads-gen][LLM] HTTP API');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`claude ${r.status}: ${JSON.stringify(j)}`);
  return j.content?.[0]?.text || '';
}

function extractJson(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('JSON 배열 파싱 실패: ' + text.slice(0, 200));
  return JSON.parse(m[0]);
}

async function main() {
  const accountId = parseInt(process.env.INPUT_ACCOUNT_ID || '0', 10);
  const topic = (process.env.INPUT_TOPIC || 'life').trim();
  const count = Math.min(parseInt(process.env.INPUT_COUNT || '2', 10) || 2, 5);
  const linkMode = (process.env.INPUT_LINKMODE || 'blog').trim(); // blog|coupang|mixed
  const cfg = TOPIC[topic] || TOPIC.life;

  if (!SRK) throw new Error('SUPABASE_SERVICE_ROLE_KEY 미설정');

  // 계정 확인 (account_id 우선, 없으면 topic 매칭)
  let account;
  if (accountId) account = (await sb(`threads_accounts?id=eq.${accountId}&limit=1`))[0];
  if (!account) account = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
  if (!account) throw new Error(`활성 계정 없음 (topic=${topic})`);

  const persona = account.persona ? `\n계정 페르소나: ${account.persona}` : '';
  const drafts = [];

  // 링크 모드별 소재 준비
  const useCoupang = linkMode === 'coupang';
  const posts = !useCoupang && cfg.site ? await fetchRecentPosts(cfg.site, count) : [];

  let prompt;
  if (useCoupang || (linkMode === 'mixed')) {
    // 쿠팡 큐레이션 (mixed도 일단 쿠팡 절반은 아래 blog에서 처리 — 단순화 위해 linkMode별 분기)
  }

  if (linkMode === 'coupang') {
    prompt = `${HOOK_RULES}

주제: ${cfg.niche}
계정 니치: Threads '${topic}' 계정.${persona}

'쿠팡에서 살 만한 가성비/꿀템' 추천 Threads 포스트 ${count}개를 만들어라.
각 포스트는 특정 상품(또는 상품군) 하나를 다룬다. 링크는 넣지 말 것.
JSON 배열로만 출력. 각 원소:
{"text":"<훅+전개+댓글CTA, 줄바꿈 포함>", "keyword":"<쿠팡 검색어(상품명, 한국어)>"}`;
    const arr = extractJson(await claude(prompt));
    for (const d of arr.slice(0, count)) {
      drafts.push({ text: d.text, link_url: coupangUrl(d.keyword || topic), link_kind: 'coupang', source_slug: null });
    }
  } else if (posts.length) {
    prompt = `${HOOK_RULES}

주제: ${cfg.niche}
계정 니치: Threads '${topic}' 계정.${persona}

아래 블로그 글 각각을 소개하는 Threads 포스트를 만들어라(글 1개당 포스트 1개). 링크는 넣지 말 것.
글 목록:
${posts.map((p, i) => `${i + 1}. ${p.title}`).join('\n')}

JSON 배열로만 출력(글 순서와 동일). 각 원소:
{"text":"<훅+전개+댓글CTA, 줄바꿈 포함>"}`;
    const arr = extractJson(await claude(prompt));
    posts.forEach((p, i) => {
      if (arr[i]?.text) drafts.push({ text: arr[i].text, link_url: p.url, link_kind: 'blog', source_slug: null });
    });
  } else {
    // RSS 실패 폴백 — 주제형 훅 + 홈 링크
    prompt = `${HOOK_RULES}

주제: ${cfg.niche}
계정 니치: Threads '${topic}' 계정.${persona}

'${cfg.niche}' 관련 Threads 포스트 ${count}개를 만들어라. 링크는 넣지 말 것.
JSON 배열로만 출력. 각 원소: {"text":"<훅+전개+댓글CTA, 줄바꿈 포함>"}`;
    const arr = extractJson(await claude(prompt));
    for (const d of arr.slice(0, count)) {
      drafts.push({ text: d.text, link_url: cfg.site || null, link_kind: cfg.site ? 'blog' : 'none', source_slug: null });
    }
  }

  if (!drafts.length) throw new Error('생성된 초안 없음');

  // 큐 저장
  const rows = drafts.map((d) => ({ account_id: account.id, status: 'draft', ...d }));
  const saved = await sb('threads_queue', { method: 'POST', body: rows, prefer: 'return=representation' });
  const ids = saved.map((r) => r.id);
  console.log(`[threads-gen] ${ids.length}개 초안 저장:`, ids);

  // 텔레그램 승인카드 발송 요청
  try {
    const r = await fetch(`${SITE}/api/threads-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
      body: JSON.stringify({ ids }),
    });
    console.log('[threads-gen] notify:', r.status);
  } catch (e) {
    console.error('[threads-gen] notify 실패:', e.message);
  }
}

console.log(`[threads-gen] start | SB=${SB} | SRK=${SRK ? 'set(' + SRK.length + ')' : 'MISSING'}`);
main().catch((e) => {
  console.error('[threads-gen] 실패:', e.message);
  if (e.cause) console.error('[threads-gen] cause:', JSON.stringify(e.cause, Object.getOwnPropertyNames(e.cause)));
  console.error(e.stack);
  process.exit(1);
});
