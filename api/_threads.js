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
