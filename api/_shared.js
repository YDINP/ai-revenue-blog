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
  vip: { label: 'VIP', base: 'https://virtual-in-playing.vercel.app' },
};

export function postUrl(source, slug) {
  const meta = SOURCE_META[source];
  return meta ? `${meta.base}/blog/${slug}/` : null;
}

export function sourceLabel(source) {
  return SOURCE_META[source]?.label || source;
}

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
