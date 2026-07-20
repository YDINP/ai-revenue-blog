// 뉴스레터 발송 파이프라인
//   새 글(RSS 최근 48h) → 블로그별 구독자에게 Resend로 다이제스트 메일 1통.
//   중복 발송은 newsletter_sends(post_url) 로 방지.
// 발송 = 내 Gmail SMTP(nodemailer). 발신인 = 내 이메일, 실구독자 누구에게나 발송(하루 ~500).
// 필요 env: GMAIL_USER, GMAIL_APP_PASSWORD(16자리 앱 비밀번호), SUPABASE_SERVICE_ROLE_KEY
import nodemailer from 'nodemailer';
import { SUPABASE_URL, escapeHtml, sourceLabel } from './_shared.js';
import { blogList } from './_blogs.js';

let _transport;
function transport() {
  if (_transport) return _transport;
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''); // 앱 비번은 공백 포함 표기 → 제거
  if (!user || !pass) throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD not set');
  _transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  return _transport;
}
// 발신 주소는 인증한 Gmail 계정 고정, 표시명만 블로그별로
function fromHeader(label) {
  return `"${label}" <${process.env.GMAIL_USER || 'me'}>`;
}
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

// 글 페이지에서 대표이미지 1장 추출(RSS엔 이미지가 없어 페이지를 직접 읽음)
//   og:image가 자동생성 OG카드(/open-graph/…, 제목 텍스트가 그려진 이미지)면
//   메일엔 실제 사진이 낫다 → 본문 대표사진(/images/…)으로 대체.
async function ogImage(pageUrl) {
  try {
    const r = await fetch(pageUrl);
    if (!r.ok) return '';
    const html = await r.text();
    const abs = (src) => {
      if (!src) return '';
      try {
        return new URL(src.replace(/&amp;/g, '&'), pageUrl).href;
      } catch {
        return src.replace(/&amp;/g, '&');
      }
    };
    const ogm =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const og = ogm ? abs(ogm[1]) : '';
    if (og && !/\/open-graph\//i.test(og)) return og;
    // OG카드거나 없음 → 본문 첫 대표사진으로 대체(프로모/광고 이미지 제외)
    const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((x) => x[1]);
    const hero = imgs.find((s) => /\/images\//i.test(s) && !/pd-|promo|banner|logo/i.test(s));
    return hero ? abs(hero) : og;
  } catch {
    return '';
  }
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

async function sendEmail(to, subject, html, from) {
  const info = await transport().sendMail({
    from: from || fromHeader('Insights'),
    to,
    subject,
    html,
  });
  return { id: info.messageId };
}

function unsubUrl(source, email) {
  return `${BACKEND}/api/daily-report?action=unsubscribe&source=${encodeURIComponent(source)}&email=${encodeURIComponent(email)}`;
}
// 이메일 유입을 분석에서 따로 잡기 위한 UTM(이메일 클라는 referrer를 지워 UTM이 유일 신호)
const UTM = 'utm_source=newsletter&utm_medium=email&utm_campaign=digest';
function withUtm(url) {
  if (!url) return url;
  return url + (url.includes('?') ? '&' : '?') + UTM;
}
// 블로그별 브랜드 accent(제목/링크/버튼 색)
const BRAND = { blog: '#6d5cf0', lifeflow: '#1e6b5c', vip: '#ff3d54' };
// 신문/큐레이션 레이아웃: 리드 기사(큰 이미지+요약) 1개 + 나머지는 작은 썸네일 헤드라인
function digestHtml(label, posts, source, email, site, brand = '#1e6b5c') {
  const ink = '#1a1712';
  const sub = '#5f5a51';
  const muted = '#938d80';
  const ground = '#f4f3f1';
  const line = '#e6e3dd';
  const serif = "Georgia,'Times New Roman',serif";
  const noun = source === 'vip' ? '영상' : '글';
  // VIP는 블로그 watch 페이지 '뉴스룸' 구도를 빌드시 합성해둔 단일 이미지(/newsroom-cards/<slug>.png)로.
  //   이메일 클라(Gmail 등)는 position:absolute 를 제거해 레이어드 오버레이가 세로로 무너지므로 단일 이미지가 필수.
  const vipStage = source === 'vip' && site ? site.replace(/\/$/, '') : '';
  const intro = vipStage
    ? '로지가 이번에 새로 올라온 영상을 골라봤어요 📩'
    : `새로 올라온 ${noun} 중에서 골라봤어요 📩`;
  const [lead, ...rest] = posts;

  const leadUrl = lead ? withUtm(lead.link) : '';
  const slugM = lead ? lead.link.match(/\/watch\/([^/?#]+)/) : null;
  // ?v=pubDate 캐시버스터 — 같은 URL 이미지를 캐시하는 메일 클라(Gmail 프록시)에서 옛 카드가 남는 것 방지
  const leadImg =
    vipStage && slugM ? `${vipStage}/newsroom-cards/${slugM[1]}.png?v=${lead.ts}` : lead ? lead.image : '';
  const leadMedia = lead && leadImg
    ? `<a href="${leadUrl}"><img src="${escapeHtml(leadImg)}" width="516" alt="" style="width:100%;max-width:516px;height:auto;border-radius:12px;display:block"></a>`
    : '';
  const leadBlock = lead
    ? `
    <tr><td style="padding:2px 0 0">
      ${leadMedia}
    </td></tr>
    <tr><td style="padding:14px 0 4px">
      <a href="${leadUrl}" style="font-family:${serif};font-size:22px;line-height:1.32;font-weight:700;color:${ink};text-decoration:none">${escapeHtml(lead.title)}</a>
      ${lead.desc ? `<div style="font-size:14px;color:${sub};margin-top:9px;line-height:1.65">${escapeHtml(lead.desc)}…</div>` : ''}
      <a href="${leadUrl}" style="display:inline-block;margin-top:12px;font-size:13px;font-weight:700;color:${brand};text-decoration:none">${noun} 보러가기 →</a>
    </td></tr>`
    : '';

  const restBlock = rest.length
    ? `
    <tr><td style="padding:24px 0 8px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:${muted};border-top:2px solid ${ink};padding-top:11px">MORE STORIES</div>
    </td></tr>
    ${rest
      .map(
        (p) => `
    <tr><td style="padding:11px 0;border-bottom:1px solid ${line}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${
          p.image
            ? `<td width="72" valign="top" style="padding-right:13px">
          <a href="${withUtm(p.link)}"><img src="${escapeHtml(p.image)}" width="72" height="72" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:8px;display:block"></a>
        </td>`
            : ''
        }
        <td valign="middle">
          <a href="${withUtm(p.link)}" style="font-size:15px;font-weight:700;line-height:1.42;color:${ink};text-decoration:none">${escapeHtml(p.title)}</a>
        </td>
      </tr></table>
    </td></tr>`
      )
      .join('')}`
    : '';

  return `<div style="max-width:560px;margin:0 auto;background:${ground};font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;padding:6px">
    <div style="background:#fff;border:1px solid ${line};border-radius:16px;padding:26px 22px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${serif};font-size:20px;font-weight:700;color:${brand}">${escapeHtml(label)}</td>
        <td align="right" valign="middle" style="font-size:11px;color:${muted};letter-spacing:.06em">NEWSLETTER</td>
      </tr></table>
      <div style="height:2px;background:${ink};margin:11px 0 4px"></div>
      <p style="font-size:12px;color:${sub};margin:8px 0 18px">${intro}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${leadBlock}${restBlock}</table>
      ${
        site
          ? `<div style="text-align:center;margin:26px 0 2px">
        <a href="${escapeHtml(withUtm(site))}" style="display:inline-block;background:${brand};color:#fff;font-size:13px;font-weight:700;text-decoration:none;padding:11px 24px;border-radius:9px">전체 ${noun} 보러가기 →</a>
      </div>`
          : ''
      }
      <p style="font-size:11px;color:${muted};margin:22px 0 0;line-height:1.6;text-align:center">
        이 메일은 ${escapeHtml(label)} 뉴스레터 구독자에게 발송됩니다 · <a href="${unsubUrl(source, email)}" style="color:${muted}">구독 취소</a>
      </p>
    </div>
  </div>`;
}

// 한 블로그 처리: 신규글 찾아 구독자에게 다이제스트 1통
//   force=true → 발송기록(newsletter_sends) 무시하고 최근 48h 글 강제 재발송(수동 발송용)
async function sendForBlog(blog, force = false) {
  const source = blog.source;
  if (!source) return { source: blog.key, skipped: 'no source' };
  const [posts0, sent, subs] = await Promise.all([
    recentPosts(blog.site),
    sentUrls(source),
    activeSubscribers(source),
  ]);
  const fresh = (force ? posts0 : posts0.filter((p) => !sent.has(p.link))).sort(
    (a, b) => b.ts - a.ts
  );
  if (!fresh.length) return { source, new: 0, sent: 0 };
  if (!subs.length) {
    // 구독자 없어도 발송기록은 남겨 다음에 중복 안 되게
    for (const p of fresh) await recordSent(source, p.link, null, 0);
    return { source, new: fresh.length, sent: 0, note: 'no subscribers' };
  }
  // 발송 대상 글에만 og:image 채움(전체 글 fetch 방지)
  await Promise.all(
    fresh.map(async (p) => {
      p.image = await ogImage(p.link);
    })
  );
  const label = sourceLabel ? sourceLabel(source) : blog.label || source;
  const noun = source === 'vip' ? '영상' : '글';
  const subject =
    fresh.length === 1
      ? `📩 방금 새 ${noun} 올렸어요 — ${fresh[0].title}`
      : `📩 ${label} 새 ${noun} ${fresh.length}편 왔어요, 골라 보세요`;
  let ok = 0;
  for (const email of subs) {
    try {
      await sendEmail(
        email,
        subject,
        digestHtml(label, fresh, source, email, blog.site, BRAND[source] || '#1e6b5c'),
        fromHeader(label)
      );
      ok++;
    } catch (e) {
      console.error(`newsletter send fail (${source}/${email}):`, e.message);
    }
  }
  for (const p of fresh) await recordSent(source, p.link, subject, ok);
  return { source, new: fresh.length, sent: ok, subscribers: subs.length };
}

// 전 블로그 실행(daily-report / 크론 / 수동에서 호출). force=true → 강제 재발송
export async function runNewsletter({ force = false } = {}) {
  const out = [];
  for (const blog of blogList()) {
    try {
      out.push(await sendForBlog(blog, force));
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
