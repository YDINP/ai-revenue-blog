// 뉴스레터 발송 파이프라인
//   새 글(RSS 최근 48h) → 블로그별 구독자에게 Resend로 다이제스트 메일 1통.
//   중복 발송은 newsletter_sends(post_url) 로 방지.
// 필요 env: RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, (선택)NEWSLETTER_FROM
import { SUPABASE_URL, escapeHtml, sourceLabel } from './_shared.js';
import { blogList } from './_blogs.js';

const RESEND_URL = 'https://api.resend.com/emails';
const FROM = process.env.NEWSLETTER_FROM || 'Insights <onboarding@resend.dev>';
const BACKEND = 'https://ai-revenue-blog.vercel.app'; // 공유 api/가 배포되는 곳(구독취소 링크용)
const WINDOW_H = 48; // 최근 48시간 내 발행글만(첫 실행 폭주 방지)

function svcKey() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return k;
}
export async function sbn(path, { method = 'GET', body, prefer } = {}) {
  const key = svcKey();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`supabase ${method} ${path} ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

async function activeSubscribers(source) {
  const rows = await sbn(
    `newsletter_subscribers?source=eq.${encodeURIComponent(source)}&is_active=eq.true&select=email`
  );
  return rows.map((r) => r.email).filter(Boolean);
}

// RSS <item> 파싱 → {title, link, desc, ts}
async function recentPosts(site) {
  const r = await fetch(`${site.replace(/\/$/, '')}/rss.xml`);
  if (!r.ok) return [];
  const xml = await r.text();
  const decode = (s) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  const pick = (block, tag) => {
    const mm = block.match(new RegExp(`<${tag}>([^]*?)</${tag}>`));
    if (!mm) return '';
    return decode(mm[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim());
  };
  const out = [];
  const re = /<item>([^]*?)<\/item>/g;
  let m;
  const now = Date.now();
  while ((m = re.exec(xml))) {
    const b = m[1];
    const link = pick(b, 'link');
    const title = pick(b, 'title');
    const pub = pick(b, 'pubDate');
    const ts = pub ? Date.parse(pub) : 0;
    if (!link || !title || !ts) continue;
    if (now - ts > WINDOW_H * 3600 * 1000) continue; // 오래된 글 제외
    const desc = pick(b, 'description')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 140);
    out.push({ link, title, desc, ts });
  }
  return out;
}

async function sentUrls(source) {
  const rows = await sbn(
    `newsletter_sends?source=eq.${encodeURIComponent(source)}&select=post_url`
  );
  return new Set(rows.map((r) => r.post_url));
}
async function recordSent(source, post_url, subject, count) {
  await sbn('newsletter_sends', {
    method: 'POST',
    body: { source, post_url, subject, recipient_count: count },
    prefer: 'resolution=ignore-duplicates',
  });
}

async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not set');
  const r = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`resend ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

function unsubUrl(source, email) {
  return `${BACKEND}/api/newsletter-unsubscribe?source=${encodeURIComponent(source)}&email=${encodeURIComponent(email)}`;
}
function digestHtml(label, posts, source, email) {
  const rows = posts
    .map(
      (p) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #eee">
      <a href="${p.link}" style="font-size:16px;font-weight:700;color:#1e6b5c;text-decoration:none">${escapeHtml(p.title)}</a>
      ${p.desc ? `<div style="font-size:13px;color:#666;margin-top:5px;line-height:1.5">${escapeHtml(p.desc)}…</div>` : ''}
    </td></tr>`
    )
    .join('');
  return `<div style="max-width:560px;margin:0 auto;font-family:'Apple SD Gothic Neo',sans-serif;color:#222;padding:8px">
    <h2 style="color:#1e6b5c;margin:0 0 4px">${escapeHtml(label)}</h2>
    <p style="color:#555;margin:0 0 18px">새로 올라온 글이에요. 골라서 읽어보세요 📩</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="font-size:12px;color:#999;margin-top:26px;line-height:1.6">
      이 메일은 ${escapeHtml(label)} 뉴스레터 구독자에게 발송됩니다.<br/>
      <a href="${unsubUrl(source, email)}" style="color:#999">구독 취소</a>
    </p>
  </div>`;
}

// 한 블로그 처리: 신규글 찾아 구독자에게 다이제스트 1통
async function sendForBlog(blog) {
  const source = blog.source;
  if (!source) return { source: blog.key, skipped: 'no source' };
  const [posts0, sent, subs] = await Promise.all([
    recentPosts(blog.site),
    sentUrls(source),
    activeSubscribers(source),
  ]);
  const fresh = posts0.filter((p) => !sent.has(p.link)).sort((a, b) => b.ts - a.ts);
  if (!fresh.length) return { source, new: 0, sent: 0 };
  if (!subs.length) {
    // 구독자 없어도 발송기록은 남겨 다음에 중복 안 되게
    for (const p of fresh) await recordSent(source, p.link, null, 0);
    return { source, new: fresh.length, sent: 0, note: 'no subscribers' };
  }
  const label = sourceLabel ? sourceLabel(source) : blog.label || source;
  const subject =
    fresh.length === 1 ? `[${label}] ${fresh[0].title}` : `[${label}] 새 글 ${fresh.length}편`;
  let ok = 0;
  for (const email of subs) {
    try {
      await sendEmail(email, subject, digestHtml(label, fresh, source, email));
      ok++;
    } catch (e) {
      console.error(`newsletter send fail (${source}/${email}):`, e.message);
    }
  }
  for (const p of fresh) await recordSent(source, p.link, subject, ok);
  return { source, new: fresh.length, sent: ok, subscribers: subs.length };
}

// 전 블로그 실행(daily-report / 크론에서 호출)
export async function runNewsletter() {
  const out = [];
  for (const blog of blogList()) {
    try {
      out.push(await sendForBlog(blog));
    } catch (e) {
      out.push({ source: blog.source || blog.key, error: e.message });
    }
  }
  return out;
}

export async function unsubscribe(source, email) {
  if (!source || !email) throw new Error('source/email required');
  const rows = await sbn(
    `newsletter_subscribers?source=eq.${encodeURIComponent(source)}&email=eq.${encodeURIComponent(email)}`,
    { method: 'PATCH', body: { is_active: false }, prefer: 'return=representation' }
  );
  return rows.length;
}
