// 전날(또는 지정일) 종합 리포트 — 조회수/방문자/신규 댓글/좋아요/쿠팡클릭
// cron(daily-report.js) 과 봇 /report 명령이 공유

import { SUPABASE_ANON_KEY, SUPABASE_URL, escapeHtml, postUrl } from './_shared.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const cut = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n) + '…' : s);

// KST 기준 날짜 문자열 (offset일 전)
function kstDay(offsetDays = 0) {
  const t = Date.now() + 9 * 3600 * 1000 - offsetDays * 86400000;
  return new Date(t).toISOString().split('T')[0];
}

// KST 날짜 [00:00, 24:00) 을 UTC ISO 범위로
function kstRange(day) {
  const start = new Date(`${day}T00:00:00+09:00`).toISOString();
  const end = new Date(new Date(`${day}T00:00:00+09:00`).getTime() + 86400000).toISOString();
  return { start, end };
}

async function rest(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

function delta(cur, prev) {
  const c = Number(cur || 0), p = Number(prev || 0);
  if (p === 0) return c > 0 ? ` (<b>+${fmt(c)}</b>)` : '';
  const pct = Math.round(((c - p) / p) * 100);
  if (pct === 0) return ' (전일 대비 ±0%)';
  return pct > 0 ? ` (전일 대비 ▲${pct}%)` : ` (전일 대비 ▼${Math.abs(pct)}%)`;
}

// 하루치 원자료 → 집계
async function collect(day) {
  const { start, end } = kstRange(day);
  const range = `created_at=gte.${start}&created_at=lt.${end}`;

  const [pv, comments, likes, clicks] = await Promise.all([
    rest(`analytics?event_type=eq.pageview&${range}&select=source,metadata`),
    rest(`comments?${range}&select=source,nickname,content,post_slug,is_admin`),
    rest(`card_likes?${range}&select=slug`),
    rest(
      `analytics?or=(event_type.eq.coupang_click,event_type.eq.affiliate_click)&${range}&select=source,metadata`
    ),
  ]);

  const uas = new Set();
  const byPost = {};
  let tf = 0, lf = 0;
  (pv || []).forEach((r) => {
    const m = r.metadata || {};
    if (m.user_agent) uas.add(m.user_agent);
    if (r.source === 'lifeflow') lf++; else tf++;
    const title = m.title && m.title !== 'null'
      ? String(m.title).split(' | ')[0].split(' - ')[0]
      : decodeURIComponent(m.slug || m.path || '홈');
    const key = `${r.source === 'lifeflow' ? 'LF' : 'TF'}|${title}`;
    byPost[key] = (byPost[key] || 0) + 1;
  });

  return {
    day,
    views: (pv || []).length,
    tfViews: tf,
    lfViews: lf,
    visitors: uas.size,
    comments: (comments || []).filter((c) => !c.is_admin),
    likes: (likes || []).length,
    clicks: (clicks || []).filter((c) => {
      const m = c.metadata || {};
      return m.target === undefined || m.target === 'coupang';
    }),
    topPosts: Object.entries(byPost).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

export async function reportMessage(dayArg) {
  const day = dayArg || kstDay(1);                      // 기본 = 어제(KST)
  const prevDay = new Date(new Date(`${day}T00:00:00+09:00`).getTime() - 86400000)
    .toISOString()
    .split('T')[0];

  const [cur, prev] = await Promise.all([collect(day), collect(prevDay)]);

  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(`${day}T00:00:00+09:00`).getDay()];
  const lines = [
    `📊 <b>일일 리포트</b> — ${day} (${wd})`,
    '',
    `👁 조회수 <b>${fmt(cur.views)}</b>${delta(cur.views, prev.views)}`,
    `    TF ${fmt(cur.tfViews)} · LF ${fmt(cur.lfViews)}`,
    `🧑 방문자 <b>${fmt(cur.visitors)}</b>${delta(cur.visitors, prev.visitors)}`,
    `💬 신규 댓글 <b>${fmt(cur.comments.length)}</b>${delta(cur.comments.length, prev.comments.length)}`,
    `❤️ 신규 좋아요 <b>${fmt(cur.likes)}</b>${delta(cur.likes, prev.likes)}`,
    `🛒 쿠팡 클릭 <b>${fmt(cur.clicks.length)}</b>${delta(cur.clicks.length, prev.clicks.length)}`,
  ];

  if (cur.topPosts.length) {
    lines.push('', '<b>인기 글 TOP</b>');
    cur.topPosts.forEach(([key, n], i) => {
      const [src, title] = key.split('|');
      lines.push(`${i + 1}. [${src}] ${escapeHtml(cut(title, 32))} — ${fmt(n)}`);
    });
  }

  if (cur.comments.length) {
    lines.push('', '<b>새 댓글</b>');
    cur.comments.slice(0, 5).forEach((c) => {
      const src = c.source === 'lifeflow' ? 'LF' : 'TF';
      lines.push(`· [${src}] <b>${escapeHtml(c.nickname)}</b>: ${escapeHtml(cut(c.content, 40))}`);
    });
    if (cur.comments.length > 5) lines.push(`  …외 ${cur.comments.length - 5}개 (<code>/comments</code>)`);
  }

  if (cur.clicks.length) {
    lines.push('', '<b>쿠팡 클릭 상품</b>');
    const by = {};
    cur.clicks.forEach((c) => {
      const m = c.metadata || {};
      const p = m.product || m.label || '(상품 미상)';
      by[p] = (by[p] || 0) + 1;
    });
    Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([p, n]) => lines.push(`· ${escapeHtml(cut(p, 34))} — ${fmt(n)}`));
  }

  if (!cur.views && !cur.comments.length && !cur.clicks.length) {
    lines.push('', '<i>해당 날짜의 활동 데이터가 없습니다.</i>');
  }

  return lines.join('\n');
}

export { kstDay };
