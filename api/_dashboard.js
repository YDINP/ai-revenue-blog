// 대시보드 항목별 실시간 조회 → 텔레그램 메시지 포매터
// 데이터 소스 = 대시보드(/dashboard)와 동일한 Supabase RPC/REST

import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  escapeHtml,
  postUrl,
  supabaseRpc,
} from './_shared.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const cut = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n) + '…' : s);

async function rpc(fn, params = {}) {
  const { status, data } = await supabaseRpc(fn, params);
  if (status >= 400) throw new Error(`${fn} failed (HTTP ${status})`);
  return data;
}

async function restGet(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!r.ok) throw new Error(`analytics query failed (HTTP ${r.status})`);
  return r.json();
}

function nowKst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' KST';
}

function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

function delta(today, yesterday) {
  const d = Number(today || 0) - Number(yesterday || 0);
  return d === 0 ? '±0' : d > 0 ? `+${fmt(d)}` : fmt(d);
}

// 값 목록 → ▁▂▃▄▅▆▇█ 스파크라인
function sparkline(values) {
  const blocks = '▁▂▃▄▅▆▇█';
  const max = Math.max(...values, 1);
  return values.map((v) => blocks[Math.min(7, Math.round((v / max) * 7))]).join('');
}

// 글 제목 표시: "제목 | TechFlow - ..." → 제목, 없으면 slug
function pageTitle(m) {
  const t = m.title && m.title !== 'null' ? String(m.title).split(' | ')[0].split(' - ')[0].trim() : '';
  if (t && !t.startsWith('TechFlow') && !t.startsWith('LifeFlow')) return t;
  const raw = decodeURIComponent(m.slug || m.path || '');
  return raw.replace(/^\/blog\//, '').replace(/\/$/, '') || '홈페이지';
}

// ── /stats — 전체 요약 ──────────────────────────────────────
export async function statsMessage() {
  const [s, c] = await Promise.all([rpc('get_traffic_summary'), rpc('get_comment_stats')]);
  return [
    `📊 <b>전체 요약</b>  <i>${nowKst()}</i>`,
    '',
    `👁 오늘 조회수: <b>${fmt(s?.today_views)}</b> (어제 ${fmt(s?.yesterday_views)}, ${delta(s?.today_views, s?.yesterday_views)})`,
    `    TF ${fmt(s?.tf_today_views)} · LF ${fmt(s?.lf_today_views)}`,
    `🛒 오늘 쿠팡클릭: <b>${fmt(s?.today_clicks)}</b> (누적 ${fmt(s?.total_clicks)})`,
    `    TF ${fmt(s?.tf_today_clicks)} · LF ${fmt(s?.lf_today_clicks)}`,
    `❤️ 오늘 좋아요: <b>${fmt(s?.today_likes)}</b> (누적 ${fmt(s?.total_likes)})`,
    `📬 구독자: <b>${fmt(s?.total_subscribers)}</b> (오늘 +${fmt(s?.today_subscribers)})`,
    `💬 댓글: 오늘 <b>${fmt(c?.today)}</b> (전체 ${fmt(c?.total)}, 신고 ${fmt(c?.reports)})`,
    '',
    `누적 조회수 ${fmt(s?.total_views)} (TF ${fmt(s?.tf_total_views)} · LF ${fmt(s?.lf_total_views)})`,
  ].join('\n');
}

// ── /tf /lf — 소스별 요약 + 해당 소스 Top 5 ─────────────────
export async function sourceMessage(source) {
  const isTf = source === 'blog';
  const p = isTf ? 'tf' : 'lf';
  const label = isTf ? 'TechFlow' : 'LifeFlow';
  const [s, pages] = await Promise.all([rpc('get_traffic_summary'), rpc('get_top_pages', { p_limit: 50 })]);
  const top = (Array.isArray(pages) ? pages : [])
    .filter((r) => (r.source || 'blog') === source)
    .slice(0, 5);
  const lines = [
    `${isTf ? '🔵' : '🟢'} <b>${label}</b>  <i>${nowKst()}</i>`,
    '',
    `👁 오늘 조회수: <b>${fmt(s?.[`${p}_today_views`])}</b> (누적 ${fmt(s?.[`${p}_total_views`])})`,
    `🛒 오늘 쿠팡클릭: <b>${fmt(s?.[`${p}_today_clicks`])}</b> (누적 ${fmt(s?.[`${p}_total_clicks`])})`,
  ];
  if (top.length) {
    lines.push('', `🔝 <b>인기 페이지 Top ${top.length}</b>`);
    top.forEach((r, i) => {
      const title = escapeHtml(cut(pageTitle(r), 38));
      lines.push(`${i + 1}. ${title} — ${fmt(r.views ?? r.count)}`);
    });
  }
  return lines.join('\n');
}

// ── /top [n] — 인기 페이지 ──────────────────────────────────
export async function topPagesMessage(n = 10) {
  n = Math.min(Math.max(n, 1), 20);
  const pages = await rpc('get_top_pages', { p_limit: n });
  const list = Array.isArray(pages) ? pages.slice(0, n) : [];
  if (!list.length) return '아직 조회 데이터가 없습니다.';
  const lines = [`🔝 <b>인기 페이지 Top ${list.length}</b>  <i>${nowKst()}</i>`, ''];
  list.forEach((r, i) => {
    const src = (r.source || 'blog') === 'lifeflow' ? 'LF' : 'TF';
    lines.push(`${i + 1}. [${src}] ${escapeHtml(cut(pageTitle(r), 36))} — <b>${fmt(r.views ?? r.count)}</b>`);
  });
  return lines.join('\n');
}

// ── /trend — 최근 7일 조회수 ────────────────────────────────
export async function trendMessage() {
  const trend = await rpc('get_daily_trend');
  const rows = (Array.isArray(trend) ? trend : []).slice(-7);
  if (!rows.length) return '아직 트렌드 데이터가 없습니다.';
  const views = rows.map((r) => Number(r.views) || 0);
  const lines = [`📈 <b>최근 7일 조회수</b>`, '', `<code>${sparkline(views)}</code>`, ''];
  rows.forEach((r) => {
    const d = String(r.day).slice(5).replace('-', '/');
    lines.push(`<code>${d}</code>  ${fmt(r.views)}`);
  });
  lines.push('', `합계 ${fmt(views.reduce((a, b) => a + b, 0))}`);
  return lines.join('\n');
}

// ── /comments [n] — 최근 댓글 (개별 메시지 → 바로 답장 가능) ──
export async function commentsMessages(n = 5) {
  n = Math.min(Math.max(n, 1), 10);
  const rows = await rpc('get_all_comments', { p_limit: n, p_offset: 0 });
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return ['아직 댓글이 없습니다.'];
  const header = `💬 <b>최근 댓글 ${list.length}개</b> — 각 메시지에 답장하면 대댓글이 달립니다`;
  const msgs = list.map((c) => {
    const src = c.source === 'lifeflow' ? 'LF' : 'TF';
    const url = postUrl(c.source, c.post_slug);
    const admin = c.is_admin ? ' 👑관리자' : '';
    const reply = c.parent_id ? '↪️ ' : '';
    const reported = Number(c.report_count) > 0 ? ` 🚨신고 ${c.report_count}` : '';
    return [
      `${reply}[${src}] <b>${escapeHtml(c.nickname)}</b>${admin} · ${timeAgo(c.created_at)}${reported}`,
      url ? `📄 <a href="${url}#comments">${escapeHtml(cut(c.post_slug, 40))}</a>` : `📄 ${escapeHtml(c.post_slug)}`,
      '',
      escapeHtml(cut(c.content, 300)),
      '',
      `#c_${c.id}`,
    ].join('\n');
  });
  return [header, ...msgs];
}

// ── /cstats — 댓글 통계 + 7일 트렌드 ────────────────────────
export async function commentStatsMessage() {
  const [s, trend] = await Promise.all([rpc('get_comment_stats'), rpc('get_comment_trend')]);
  const rows = Array.isArray(trend) ? trend : [];
  const lines = [
    `💬 <b>댓글 통계</b>  <i>${nowKst()}</i>`,
    '',
    `전체 <b>${fmt(s?.total)}</b> · 오늘 <b>${fmt(s?.today)}</b> · 신고 ${fmt(s?.reports)}`,
    `TF ${fmt(s?.blog_count)} · LF ${fmt(s?.lifeflow_count)}`,
  ];
  if (rows.length) {
    lines.push('', '<b>최근 7일</b>', `<code>${sparkline(rows.map((r) => Number(r.count) || 0))}</code>`);
    rows.forEach((r) => lines.push(`<code>${String(r.day).slice(5).replace('-', '/')}</code>  ${fmt(r.count)} (TF ${fmt(r.blog_count)} · LF ${fmt(r.lf_count)})`));
  }
  return lines.join('\n');
}

// ── /coupang — 쿠팡 클릭 상세 (어떤 글 → 어떤 링크) ─────────
export async function coupangMessage() {
  const [s, rowsRaw] = await Promise.all([
    rpc('get_traffic_summary'),
    // 트래커 통일 전 인라인 링크는 affiliate_click 으로 기록 → 두 타입 모두 조회
    restGet('analytics?or=(event_type.eq.coupang_click,event_type.eq.affiliate_click)&select=metadata,source,created_at&order=created_at.desc&limit=200'),
  ]);
  const rows = (Array.isArray(rowsRaw) ? rowsRaw : [])
    .filter((r) => { const m = r.metadata || {}; return m.target === undefined || m.target === 'coupang'; })
    .map((r) => { const m = r.metadata || {}; return { ...r, m: { ...m, product: m.product || m.label || '', url: m.url || m.href || '' } }; });

  const lines = [
    `🛒 <b>쿠팡 클릭</b>  <i>${nowKst()}</i>`,
    '',
    `오늘 <b>${fmt(s?.today_clicks)}</b> · 누적 <b>${fmt(s?.total_clicks)}</b> (TF ${fmt(s?.tf_total_clicks)} · LF ${fmt(s?.lf_total_clicks)})`,
  ];

  // 상품별 집계 Top 5
  const by = {};
  rows.forEach((r) => {
    const k = r.m.product || '(상품 미상)';
    by[k] = (by[k] || 0) + 1;
  });
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length) {
    lines.push('', '<b>상품별 클릭 Top</b>');
    top.forEach(([p, c], i) => lines.push(`${i + 1}. ${escapeHtml(cut(p, 36))} — <b>${fmt(c)}</b>`));
  }

  // 최근 클릭 10건: 어떤 포스팅에서 어떤 링크를 눌렀는지
  const recent = rows.slice(0, 10);
  if (recent.length) {
    lines.push('', '<b>최근 클릭</b>');
    recent.forEach((r) => {
      const src = r.source === 'lifeflow' ? 'LF' : 'TF';
      const prod = r.m.url
        ? `<a href="${r.m.url}">${escapeHtml(cut(r.m.product || '(상품 미상)', 30))}</a>`
        : escapeHtml(cut(r.m.product || '(상품 미상)', 30));
      lines.push(`· [${src}] ${prod} ← ${escapeHtml(cut(pageTitle(r.m), 28))} (${timeAgo(r.created_at)})`);
    });
  } else {
    lines.push('', '아직 클릭 데이터가 없습니다.');
  }
  return lines.join('\n');
}

// ── /likes — 추천(좋아요) Top ───────────────────────────────
export async function likesMessage(n = 10) {
  n = Math.min(Math.max(n, 1), 15);
  const rows = await rpc('get_top_liked_posts', { p_limit: n });
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '아직 추천 데이터가 없습니다 ❤️';
  const total = list.reduce((s, p) => s + Number(p.like_count || 0), 0);
  const lines = [`❤️ <b>추천 Top ${list.length}</b> (합계 ${fmt(total)})`, ''];
  list.forEach((p, i) => {
    lines.push(`${i + 1}. ${escapeHtml(cut(pageTitle(p), 36))} — <b>${fmt(p.like_count)}</b>`);
  });
  return lines.join('\n');
}

// ── /recent [n] — 최근 이벤트 피드 ──────────────────────────
const EVENT_LABELS = {
  pageview: '👁 조회',
  coupang_click: '🛒 쿠팡클릭',
  affiliate_click: '🛒 쿠팡클릭',
  newsletter_subscribe: '📬 구독',
  like: '❤️ 추천',
  comment: '💬 댓글',
};

export async function recentMessage(n = 10) {
  n = Math.min(Math.max(n, 1), 20);
  const rows = await rpc('get_recent_events', { p_limit: n });
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '아직 이벤트가 없습니다.';
  const lines = [`⚡ <b>최근 이벤트 ${list.length}건</b>  <i>${nowKst()}</i>`, ''];
  list.forEach((e) => {
    const m = e.metadata || {};
    const src = e.source === 'lifeflow' ? 'LF' : 'TF';
    const label = EVENT_LABELS[e.event_type] || e.event_type;
    const what = e.event_type === 'coupang_click' || e.event_type === 'affiliate_click'
      ? cut(m.product || m.label || pageTitle(m), 26)
      : cut(pageTitle(m), 26);
    lines.push(`· [${src}] ${label} — ${escapeHtml(what)} (${timeAgo(e.created_at)})`);
  });
  return lines.join('\n');
}
