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

// ── 발행 (2단계: 컨테이너 생성 → 게시) ──
export async function publish(account, { text, imageUrl }) {
  const uid = account.threads_user_id;
  const token = account.access_token;

  // 1) 컨테이너 생성
  const create = new URL(`${GRAPH_V}/${uid}/threads`);
  create.searchParams.set('media_type', imageUrl ? 'IMAGE' : 'TEXT');
  if (text) create.searchParams.set('text', text);
  if (imageUrl) create.searchParams.set('image_url', imageUrl);
  create.searchParams.set('access_token', token);
  const cRes = await fetch(create, { method: 'POST' });
  const cJson = await cRes.json();
  if (!cRes.ok || !cJson.id) throw new Error(`container failed: ${JSON.stringify(cJson)}`);

  // 2) 게시 (미디어 처리 지연 대비 — 이미지면 잠깐 여유가 필요할 수 있음. 텍스트는 즉시)
  const pub = new URL(`${GRAPH_V}/${uid}/threads_publish`);
  pub.searchParams.set('creation_id', cJson.id);
  pub.searchParams.set('access_token', token);
  const pRes = await fetch(pub, { method: 'POST' });
  const pJson = await pRes.json();
  if (!pRes.ok || !pJson.id) throw new Error(`publish failed: ${JSON.stringify(pJson)}`);
  return pJson.id; // media id
}

// 자답(첫 댓글) — hook-writer 규칙: 외부링크는 본문 아닌 첫 댓글에 (도달 보호)
export async function publishReply(account, { text, replyToId }) {
  const uid = account.threads_user_id;
  const token = account.access_token;
  const create = new URL(`${GRAPH_V}/${uid}/threads`);
  create.searchParams.set('media_type', 'TEXT');
  create.searchParams.set('text', text);
  create.searchParams.set('reply_to_id', replyToId);
  create.searchParams.set('access_token', token);
  const cRes = await fetch(create, { method: 'POST' });
  const cJson = await cRes.json();
  if (!cRes.ok || !cJson.id) throw new Error(`reply container failed: ${JSON.stringify(cJson)}`);
  const pub = new URL(`${GRAPH_V}/${uid}/threads_publish`);
  pub.searchParams.set('creation_id', cJson.id);
  pub.searchParams.set('access_token', token);
  const pRes = await fetch(pub, { method: 'POST' });
  const pJson = await pRes.json();
  if (!pRes.ok || !pJson.id) throw new Error(`reply publish failed: ${JSON.stringify(pJson)}`);
  return pJson.id;
}

// 쿠팡 파트너스 정적 검색 URL (딥링크/Open API 아님 — lptag 검색 URL만, 호출 금지 제약 준수)
const COUPANG_LPTAG = 'AF7838146';
export function coupangSearchUrl(keyword) {
  const q = encodeURIComponent(keyword);
  return `https://www.coupang.com/np/search?q=${q}&src=1139000&spec=10799999&addtag=200&ctag=${q}&lptag=${COUPANG_LPTAG}&pageType=SEARCH&pageValue=${q}`;
}

// 큐 항목 발행 오케스트레이션 (본문 → 링크는 첫 댓글 자답 → 기록)
export async function publishDraft(account, item) {
  const mediaId = await publish(account, { text: item.text, imageUrl: item.image_url });
  if (item.link_url) {
    try {
      await publishReply(account, { text: `전문 👇\n${item.link_url}`, replyToId: mediaId });
    } catch (e) {
      console.error('link reply failed (본문은 정상 발행됨):', e.message);
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
  const url = new URL(`${GRAPH_V}/${account.threads_user_id}/threads`);
  url.searchParams.set('fields', 'id,timestamp,media_type');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('access_token', account.access_token);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error(`my media fetch failed: ${JSON.stringify(j)}`);
  return Array.isArray(j.data) ? j.data : [];
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

// AI 추천 대댓글 초안 — ANTHROPIC_API_KEY 있으면 생성, 없으면 '' (사람이 직접 작성).
// 반말+스친체, 진심 1~2줄, 링크·영업 금지 (threads-hook-writer 규칙).
export async function draftReply(commentText, { postText } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !commentText) return '';
  const sys =
    '너는 생활정보 스레드 계정 "미나"야. 댓글에 다는 대댓글을 쓴다. ' +
    '규칙: 반말+친근한 스친체(존댓말/격식체/~있음체 금지), 1~2줄, 진심으로 반응, ' +
    '외부 링크·영업·홍보 금지, 이모지 0~1개. 댓글 내용에 실제로 반응하는 답만.';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: sys,
        messages: [{ role: 'user', content: `${postText ? `[내 글]\n${postText}\n\n` : ''}[달린 댓글]\n${commentText}\n\n이 댓글에 달 대댓글만 써줘.` }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return '';
    return (j.content?.[0]?.text || '').trim();
  } catch {
    return '';
  }
}
