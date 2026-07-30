// 텔레그램 댓글봇 공용 헬퍼 (파일명 `_` 프리픽스 → Vercel 엔드포인트로 노출 안 됨)

export const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://xyprbsmagtlzebxyxsvj.supabase.co';

// anon key는 클라이언트(CommentSection.astro)에 이미 공개된 값
export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cHJic21hZ3RsemVieHl4c3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NjY4NTQsImV4cCI6MjA4NjA0Mjg1NH0.dajN0n0IWzOgYOSCglxVLzddg7jJFRHNCHwTWMG62uU';

// source 컬럼 → 블로그 표시명/글 URL 매핑
export const SOURCE_META = {
  blog: { label: 'TechFlow', base: 'https://ai-revenue-blog.vercel.app' },
  lifeflow: { label: 'LifeFlow', base: 'https://life-revenue-blog.vercel.app' },
  // analytics·newsletter 소스값은 'playcast'. 'vip'는 별칭(하위호환).
  playcast: { label: 'VIP (Virtual-in-Playing)', base: 'https://virtual-in-playing.vercel.app' },
  vip: { label: 'VIP (Virtual-in-Playing)', base: 'https://virtual-in-playing.vercel.app' },
};

export function postUrl(source, slug) {
  const meta = SOURCE_META[source];
  return meta ? `${meta.base}/blog/${slug}/` : null;
}

export function sourceLabel(source) {
  return SOURCE_META[source]?.label || source;
}

// ── KST 날짜 유틸 ──
// 집계 기준일은 전부 KST 달력 날짜다. 서버(Vercel/GitHub Actions)는 UTC 로 돌기 때문에
// new Date().toISOString() 을 그대로 쓰면 09시 이전에 하루가 밀린다.

// offset일 전의 KST 날짜 문자열 (YYYY-MM-DD)
export function kstDay(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600 * 1000 - offsetDays * 86400000)
    .toISOString()
    .split('T')[0];
}

// KST 날짜 [00:00, 24:00) → UTC ISO 범위 (Supabase created_at 필터용)
export function kstRange(day) {
  const t0 = new Date(`${day}T00:00:00+09:00`).getTime();
  return { start: new Date(t0).toISOString(), end: new Date(t0 + 86400000).toISOString() };
}

// 타임스탬프가 속한 KST 날짜
export const kstDayOf = (ts) =>
  new Date(new Date(ts).getTime() + 9 * 3600 * 1000).toISOString().split('T')[0];

// day 의 offset일 전 KST 날짜 (day 기준 상대 이동)
export const kstShift = (day, offsetDays) =>
  new Date(new Date(`${day}T00:00:00+09:00`).getTime() - offsetDays * 86400000)
    .toISOString()
    .split('T')[0];

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 텔레그램 Bot API 호출
export async function tg(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await r.json().catch(() => ({}));
  if (!json.ok) console.error(`telegram ${method} failed:`, JSON.stringify(json));
  return json;
}

export function sendToAdmin(text, extra = {}) {
  return tg('sendMessage', {
    chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
}

// Supabase RPC (anon key + SECURITY DEFINER 함수)
export async function supabaseRpc(fn, params) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(params),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

// 댓글 단건 조회 (RLS select 전체 허용이라 anon으로 가능)
export async function getComment(id) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/comments?id=eq.${encodeURIComponent(id)}&select=id,post_slug,source,nickname,content`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
