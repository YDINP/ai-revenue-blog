// Threads Graph API 래퍼 + Supabase(service_role) 헬퍼
// `_` 프리픽스 → Vercel 엔드포인트로 노출 안 됨. threads_* 테이블은 RLS 차단이라
// 반드시 service_role 키로만 접근(serverless 전용, 클라이언트 노출 금지).

import { SUPABASE_URL } from './_shared.js';

const GRAPH = 'https://graph.threads.net';
const GRAPH_V = `${GRAPH}/v1.0`;

function serviceKey() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return k;
}

// ── Supabase REST (service_role) ──
export async function sb(path, { method = 'GET', body, prefer } = {}) {
  const key = serviceKey();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`supabase ${method} ${path} ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

export const getAccounts = (activeOnly = true) =>
  sb(`threads_accounts?select=*${activeOnly ? '&active=eq.true' : ''}&order=id`);

export const getAccountByTopic = (topic) =>
  sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`).then((r) => r[0] || null);

export const insertAccount = (row) =>
  sb('threads_accounts', { method: 'POST', body: row, prefer: 'return=representation,resolution=merge-duplicates' }).then((r) => r[0]);

export const updateAccount = (id, patch) =>
  sb(`threads_accounts?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }).then((r) => r[0]);

export const insertQueue = (row) =>
  sb('threads_queue', { method: 'POST', body: row, prefer: 'return=representation' }).then((r) => r[0]);

export const updateQueue = (id, patch) =>
  sb(`threads_queue?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }).then((r) => r[0]);

export const getQueue = (id) =>
  sb(`threads_queue?id=eq.${id}&select=*`).then((r) => r[0] || null);

export const insertPost = (row) =>
  sb('threads_posts', { method: 'POST', body: row, prefer: 'return=representation' }).then((r) => r[0]);

// 오늘(24h) 계정 발행수 — rate limit(250/24h) & 사람같은 페이싱 판단용
export async function publishedCount24h(accountId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const r = await sb(
    `threads_posts?account_id=eq.${accountId}&published_at=gte.${since}&select=id`,
    { prefer: 'count=exact' }
  );
  return Array.isArray(r) ? r.length : 0;
}

// ── OAuth 토큰 ──
// 단기 토큰(code 교환) → 장기(60d) 교환
export async function exchangeLongLived(shortToken) {
  const url = new URL(`${GRAPH}/access_token`);
  url.searchParams.set('grant_type', 'th_exchange_token');
  url.searchParams.set('client_secret', process.env.THREADS_APP_SECRET);
  url.searchParams.set('access_token', shortToken);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(`exchange failed: ${JSON.stringify(j)}`);
  return j; // { access_token, token_type, expires_in }
}

export async function refreshLongLived(longToken) {
  const url = new URL(`${GRAPH}/refresh_access_token`);
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', longToken);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(`refresh failed: ${JSON.stringify(j)}`);
  return j;
}

// authorization code → 단기 토큰(+ user_id)
export async function codeToShortToken(code) {
  const body = new URLSearchParams({
    client_id: process.env.THREADS_APP_ID,
    client_secret: process.env.THREADS_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: process.env.THREADS_REDIRECT_URI,
    code,
  });
  const r = await fetch(`${GRAPH}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`code exchange failed: ${JSON.stringify(j)}`);
  return j; // { access_token, user_id }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 컨테이너 게시 (2단계). 컨테이너가 처리되기 전 게시하면 "Media Not Found"(subcode 4279009)가
// 나므로, 잠깐 기다렸다가 재시도한다. 텍스트는 대개 1~2초면 준비됨.
const UID = 'me'; // 숫자 threads_user_id는 노드로 안 먹는 경우 있음 → 'me'가 안정

async function finalizePublish(token, creationId) {
  const pub = new URL(`${GRAPH_V}/${UID}/threads_publish`);
  pub.searchParams.set('creation_id', creationId);
  pub.searchParams.set('access_token', token);
  const delays = [1000, 2000, 3000]; // 최대 ~6초(Vercel 10s 제한 여유), 텍스트는 대개 1~2초면 준비
  let last;
  for (let i = 0; i < delays.length; i++) {
    await sleep(delays[i]);
    const pRes = await fetch(pub, { method: 'POST' });
    const pJson = await pRes.json();
    if (pRes.ok && pJson.id) return pJson.id;
    last = pJson;
    const sub = pJson?.error?.error_subcode;
    const transient = pJson?.error?.is_transient === true;
    if (sub !== 4279009 && !transient) throw new Error(`publish failed: ${JSON.stringify(pJson)}`); // 준비지연 아니면 즉시 중단
  }
  throw new Error(`publish failed(after retries): ${JSON.stringify(last)}`);
}

// ── 발행 (2단계: 컨테이너 생성 → 게시) ──
export async function publish(account, { text, imageUrl }) {
  const token = account.access_token;
  const create = new URL(`${GRAPH_V}/${UID}/threads`);
  create.searchParams.set('media_type', imageUrl ? 'IMAGE' : 'TEXT');
  if (text) create.searchParams.set('text', text);
  if (imageUrl) create.searchParams.set('image_url', imageUrl);
  create.searchParams.set('access_token', token);
  const cRes = await fetch(create, { method: 'POST' });
  const cJson = await cRes.json();
  if (!cRes.ok || !cJson.id) throw new Error(`container failed: ${JSON.stringify(cJson)}`);
  return await finalizePublish(token, cJson.id);
}

// 대댓글/자답 발행 — hook-writer 규칙: 외부링크는 본문 아닌 첫 댓글에 (도달 보호)
export async function publishReply(account, { text, replyToId }) {
  const token = account.access_token;
  const create = new URL(`${GRAPH_V}/${UID}/threads`);
  create.searchParams.set('media_type', 'TEXT');
  create.searchParams.set('text', text);
  create.searchParams.set('reply_to_id', replyToId);
  create.searchParams.set('access_token', token);
  const cRes = await fetch(create, { method: 'POST' });
  const cJson = await cRes.json();
  if (!cRes.ok || !cJson.id) throw new Error(`reply container failed: ${JSON.stringify(cJson)}`);
  return await finalizePublish(token, cJson.id);
}

// 쿠팡 파트너스 정적 검색 URL (딥링크/Open API 아님 — lptag 검색 URL만, 호출 금지 제약 준수)
const COUPANG_LPTAG = 'AF7838146';
export function coupangSearchUrl(keyword) {
  const q = encodeURIComponent(keyword);
  return `https://www.coupang.com/np/search?q=${q}&src=1139000&spec=10799999&addtag=200&ctag=${q}&lptag=${COUPANG_LPTAG}&pageType=SEARCH&pageValue=${q}`;
}

// 타래 구분자 — 한 줄에 --- (3개 이상) 만 있으면 편 경계
export const THREAD_SEP = /\n\s*-{3,}\s*\n/;
export const splitThread = (text) =>
  String(text || '').split(THREAD_SEP).map((s) => s.trim()).filter(Boolean);
export const isThreadItem = (item) =>
  item?.link_kind === 'thread' || THREAD_SEP.test(item?.text || '');

// 타래 발행 — 1편(root) → 2편~ 직전 글에 체인 답글 → 링크는 root 첫 댓글.
// hook-writer 규칙: 외부 링크는 본문 아닌 첫 댓글에(도달 보호).
export async function publishThread(account, segments, { linkUrl, imageUrl } = {}) {
  const segs = (segments || []).filter((s) => s && s.trim());
  if (!segs.length) throw new Error('빈 타래');
  let rootId = null;
  let prevId = null;
  for (let i = 0; i < segs.length; i++) {
    const mid =
      i === 0
        ? await publish(account, { text: segs[i], imageUrl })
        : await publishReply(account, { text: segs[i], replyToId: prevId });
    if (i === 0) rootId = mid;
    prevId = mid;
  }
  if (linkUrl && rootId) {
    try {
      await publishReply(account, { text: `전문 👇\n${linkUrl}`, replyToId: rootId });
    } catch (e) {
      console.error('thread link reply failed (본문 타래는 정상 발행됨):', e.message);
    }
  }
  return rootId;
}

/* 스레드에서 온 유입을 글 단위로 계측하기 위한 UTM.
   여기(발행 직전)에 붙이는 이유: 예약·수동·랜덤·타래가 전부 publishDraft 를 지나므로
   한 곳만 고치면 모든 경로가 태깅된다. 생성기에서 붙이면 큐 id 가 아직 없고(insert 후 발급),
   텔레그램에서 손으로 올린 글은 영영 안 붙는다.

   ⚠ 우리 도메인만 건드린다 — link_url 에는 쿠팡 제휴 검색 URL 도 들어오는데(lptag 등
   파라미터가 이미 붙어 있다) 거기에 utm 을 얹을 이유가 없다.
   ⚠ 이미 utm_source 가 있으면 덮지 않는다(과거 nochimyon 캠페인 링크 보존). */
const OWN_HOST = /(^|\.)mungge\.com$|(^|\.)(ai|life)-revenue-blog\.vercel\.app$/;

export function withUtm(raw, queueId) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return raw;
    if (!OWN_HOST.test(u.hostname)) return raw;
    if (!u.searchParams.has('utm_source')) {
      u.searchParams.set('utm_source', 'threads');
      u.searchParams.set('utm_medium', 'social');
    }
    if (!u.searchParams.has('utm_content')) u.searchParams.set('utm_content', `q${queueId}`);
    return u.toString();
  } catch {
    return raw; // URL 로 못 읽는 값이면 원문 그대로 — 링크를 잃는 것보다 낫다
  }
}

// 큐 항목 발행 오케스트레이션 — 타래면 체인 발행, 아니면 단일 글.
// (본문 → 링크는 첫 댓글 자답 → 기록)
export async function publishDraft(account, item) {
  let mediaId;
  const linkUrl = item.link_url ? withUtm(item.link_url, item.id) : null;
  if (isThreadItem(item)) {
    mediaId = await publishThread(account, splitThread(item.text), {
      linkUrl,
      imageUrl: item.image_url,
    });
  } else {
    mediaId = await publish(account, { text: item.text, imageUrl: item.image_url });
    if (linkUrl) {
      try {
        await publishReply(account, { text: `전문 👇\n${linkUrl}`, replyToId: mediaId });
      } catch (e) {
        console.error('link reply failed (본문은 정상 발행됨):', e.message);
      }
    }
  }
  await updateQueue(item.id, { status: 'published', error: null });
  await insertPost({ queue_id: item.id, account_id: account.id, threads_media_id: mediaId });
  return mediaId;
}

export async function getInsights(mediaId, token) {
  const url = new URL(`${GRAPH_V}/${mediaId}/insights`);
  url.searchParams.set('metric', 'views,likes,replies,reposts,quotes,shares');
  url.searchParams.set('access_token', token);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) return null;
  const out = {};
  for (const m of j.data || []) out[m.name] = m.values?.[0]?.value ?? 0;
  return out; // { views, likes, replies, reposts, quotes, shares }
}

// ── 댓글(대댓글) 반자동 ──
// 내 계정의 최근 글(수동 발행 포함) — DB(threads_posts)에 없는 앱 직접 발행글도 커버.
export async function getMyRecentMedia(account, limit = 25) {
  // 본인 글 조회는 'me' 별칭이 안정적(토큰 주인으로 해석). 숫자 user_id는 노드 조회 불가한 경우 있음.
  const url = new URL(`${GRAPH_V}/me/threads`);
  url.searchParams.set('fields', 'id,timestamp,media_type');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', account.access_token);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(`my media fetch failed: ${JSON.stringify(j)}`);
  return Array.isArray(j.data) ? j.data : [];
}

// 내 계정 username — 자기 댓글에 자기가 답하는 루프를 막는 데 쓴다.
// threads_accounts.handle 이 비어 있는 계정이 실제로 있었으므로(2026-07-29 실측 handle=null)
// DB 값에만 의존하지 않고 API에서 받아온다. 받아오면 handle에 캐시.
export async function getMyUsername(account) {
  const cached = String(account.handle || '').replace(/^@/, '');
  if (cached) return cached.toLowerCase();
  const url = new URL(`${GRAPH_V}/me`);
  url.searchParams.set('fields', 'username');
  url.searchParams.set('access_token', account.access_token);
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  const username = String(j?.username || '').replace(/^@/, '');
  if (!username) return '';
  await updateAccount(account.id, { handle: username }).catch(() => {});
  return username.toLowerCase();
}

// 내 원글에 달린 직접 답글 목록. threads_manage_replies 스코프 필요.
export async function getReplies(account, mediaId) {
  const url = new URL(`${GRAPH_V}/${mediaId}/replies`);
  url.searchParams.set('fields', 'id,text,username,timestamp,hide_status');
  url.searchParams.set('reverse', 'false');
  url.searchParams.set('access_token', account.access_token);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(`replies fetch failed: ${JSON.stringify(j)}`);
  return Array.isArray(j.data) ? j.data : [];
}

// 원글의 대화 전체(중첩 답글 포함). /replies는 직접 답글만 주므로 "내가 이미 답했는지"는 이걸로 본다.
export async function getConversation(account, rootMediaId, limit = 100) {
  const url = new URL(`${GRAPH_V}/${rootMediaId}/conversation`);
  url.searchParams.set('fields', 'id,text,username,replied_to');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', account.access_token);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(`conversation fetch failed: ${JSON.stringify(j)}`);
  return Array.isArray(j.data) ? j.data : [];
}

// ⚠️ 앱에서 손으로 단 답글은 우리 DB에 없다(threads_replies에는 API로 발행한 것만 남는다).
// 그래서 이 체크 없이는 이미 답한 댓글이 pending으로 남아 중복 답글이 나간다.
// 2026-07-29 실측: pending 7건 중 5건이 앱에서 이미 답장한 댓글이었다.
export async function myAnsweredCommentIds(account, rootMediaId, myHandle) {
  const me = String(myHandle || '').replace(/^@/, '').toLowerCase();
  if (!me) return new Set();
  const conv = await getConversation(account, rootMediaId);
  const out = new Set();
  for (const it of conv) {
    if (String(it.username || '').toLowerCase() !== me) continue;
    if (it.replied_to?.id) out.add(it.replied_to.id);
  }
  return out;
}

// 내 글/대댓글 삭제 — DELETE /{media-id}. threads_delete 스코프 필요(100/day 한도).
export async function deleteMedia(account, mediaId) {
  const url = new URL(`${GRAPH_V}/${mediaId}`);
  url.searchParams.set('access_token', account.access_token);
  const r = await fetch(url, { method: 'DELETE' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`delete failed: ${JSON.stringify(j)}`);
  return j;
}

export const insertReply = (row) =>
  sb('threads_replies', { method: 'POST', body: row, prefer: 'return=representation' }).then((r) => r[0]);
export const updateReply = (id, patch) =>
  sb(`threads_replies?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }).then((r) => r[0]);
export const getReply = (id) =>
  sb(`threads_replies?id=eq.${id}&select=*`).then((r) => r[0] || null);
// 이미 수집한 댓글이거나(comment_id), 내가 보낸 대댓글(reply_media_id)이면 true → 재수집·자기답글 루프 방지
export const replyExists = (mediaId) => {
  const v = encodeURIComponent(mediaId);
  return sb(`threads_replies?or=(comment_id.eq.${v},reply_media_id.eq.${v})&select=id&limit=1`).then((r) => r.length > 0);
};

// 단건 permalink 조회 — 텔레그램 카드의 '스레드에서 보기' 링크용.
// ⚠️ Threads 웹 URL 은 숫자 media id 로 조립할 수 없다(퍼머링크는 shortcode 기반).
//    그래서 반드시 API 가 준 permalink 를 써야 하고, 못 받으면 버튼을 안 다는 게 맞다
//    (죽은 링크를 다느니 없는 편이 낫다).
export async function getPermalink(account, mediaId) {
  if (!mediaId || !account?.access_token) return '';
  try {
    const url = new URL(`${GRAPH}/v1.0/${mediaId}`);
    url.searchParams.set('fields', 'permalink');
    url.searchParams.set('access_token', account.access_token);
    const r = await fetch(url);
    const j = await r.json();
    return r.ok && j.permalink ? j.permalink : '';
  } catch { return ''; }
}

// ── 아웃바운드 인게이지먼트 (키워드 검색 → 남 글에 답글) ──
export async function keywordSearch(account, q, { searchType = 'TOP', searchMode = 'KEYWORD', limit = 15 } = {}) {
  const url = new URL(`${GRAPH}/v1.0/keyword_search`);
  url.searchParams.set('q', q);
  url.searchParams.set('search_type', searchType); // TOP | RECENT
  url.searchParams.set('search_mode', searchMode); // KEYWORD | TAG
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('fields', 'id,text,username,permalink,timestamp');
  url.searchParams.set('access_token', account.access_token);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(`keyword_search failed: ${JSON.stringify(j)}`);
  return Array.isArray(j.data) ? j.data : [];
}

export const insertEngage = (row) =>
  sb('threads_engage', { method: 'POST', body: row, prefer: 'return=representation' }).then((r) => r[0]);
export const updateEngage = (id, patch) =>
  sb(`threads_engage?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }).then((r) => r[0]);
export const getEngage = (id) =>
  sb(`threads_engage?id=eq.${id}&select=*`).then((r) => r[0] || null);
export const engageExists = (postId) =>
  sb(`threads_engage?post_id=eq.${encodeURIComponent(postId)}&select=id&limit=1`).then((r) => r.length > 0);

// ── LLM 초안 ──
// 크레덴셜 2종을 모두 받는다: 직접키(ANTHROPIC_API_KEY) 또는 게이트웨이(BASE_URL+AUTH_TOKEN).
// 어느 것도 없으면 '' → 호출부가 "초안 없음"으로 처리하고, 자동발행은 아예 하지 않는다.
// (2026-07-29 현재 Vercel에 둘 다 없음 → 초안은 로컬 러너 automation/threads-reply-run.mjs가 채운다)
export function llmConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY || (process.env.ANTHROPIC_BASE_URL && process.env.ANTHROPIC_AUTH_TOKEN));
}

async function anthropicText({ system, user, model = 'claude-haiku-4-5-20251001', maxTokens = 150 }) {
  const direct = process.env.ANTHROPIC_API_KEY;
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const token = direct || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!token) return '';
  try {
    const r = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': token,
        // 게이트웨이(kone 계열)는 Bearer만 받는 경우가 있어 둘 다 붙인다.
        ...(direct ? {} : { authorization: `Bearer ${token}` }),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.THREADS_LLM_MODEL || model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return '';
    return (j.content?.[0]?.text || '').trim();
  } catch { return ''; }
}

// 남 글에 다는 답글 초안 — 공감/도움 위주, 홍보·링크 금지 (스팸 방지).
export async function draftEngageReply(postText) {
  if (!postText) return '';
  return anthropicText({
    system:
      '너는 생활정보 스레드 계정 "미나"야. 다른 사람의 글에 다는 답글을 쓴다. ' +
      '규칙: 반말+친근한 스친체(존댓말/격식체/~있음체 금지), 1~2줄, 글 내용에 진심으로 공감/반응. ' +
      '절대 홍보·링크·내 계정 언급 금지. 자연스러운 대화만. 뻔한 "좋은 글이네요" 금지.',
    user: `[상대 글]\n${postText}\n\n이 글에 달 답글만 써줘.`,
  });
}

// AI 추천 대댓글 초안 — 크레덴셜 있으면 생성, 없으면 '' (사람이 직접 작성 / 로컬 러너가 채움).
// 반말+스친체, 진심 1~2줄, 링크·영업 금지 (threads-hook-writer 규칙).
export const REPLY_DRAFT_SYSTEM =
  '너는 생활정보 스레드 계정 "미나"야. 댓글에 다는 대댓글을 쓴다. ' +
  '규칙: 반말+친근한 스친체(존댓말/격식체/~있음체 금지), 1~2줄, 진심으로 반응, ' +
  '외부 링크·영업·홍보 금지, 이모지 0~1개. 댓글 내용에 실제로 반응하는 답만.';

export const replyDraftPrompt = (commentText, postText) =>
  `${postText ? `[내 글]\n${postText}\n\n` : ''}[달린 댓글]\n${commentText}\n\n이 댓글에 달 대댓글만 써줘.`;

export async function draftReply(commentText, { postText } = {}) {
  if (!commentText) return '';
  return anthropicText({ system: REPLY_DRAFT_SYSTEM, user: replyDraftPrompt(commentText, postText) });
}

// ── 자동 대댓글 안전장치용 카운터 ──
// 24h 자동발행 수 — created_at(수집시각)이 아니라 sent_at(발행시각) 기준이어야 캡이 정확하다.
export async function autoRepliesSent24h(accountId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const r = await sb(`threads_replies?account_id=eq.${accountId}&auto=is.true&sent_at=gte.${since}&select=id`);
  return Array.isArray(r) ? r.length : 0;
}

// 한 원글에 쌓인 미답변(pending) 수 — 바이럴 글에서 수집이 폭주하는 것을 막는다.
export async function pendingRepliesForRoot(rootMediaId) {
  const r = await sb(`threads_replies?root_media_id=eq.${encodeURIComponent(rootMediaId)}&status=eq.pending&select=id`);
  return Array.isArray(r) ? r.length : 0;
}
