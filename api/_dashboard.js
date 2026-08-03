// 대시보드 항목별 실시간 조회 → 텔레그램 메시지 포매터
// 데이터 소스 = 대시보드(/dashboard)와 동일한 Supabase RPC/REST

import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  escapeHtml,
  kstDay,
  postUrl,
  supabaseRpc,
} from './_shared.js';
import { loadMungge, mgComments, mgPosts } from './_mungge.js';
import { isSearch } from './_refs.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const cut = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n) + '…' : s);

// source → 표시 약어. 뭉게가 본 사이트이고 VIP(playcast)만 별개로 운영된다.
// TF(blog)·LF(lifeflow)는 뭉게로 301 통합돼 소스로 쓰지 않지만, DB 에 남은 과거 행이
// 라벨 없이 원문(`blog`)으로 노출되는 걸 막기 위해 매핑만 남긴다.
const SRC_ABBR = { mg: '뭉게', playcast: 'VIP', vip: 'VIP', blog: '(구)TF', lifeflow: '(구)LF' };
const abbr = (s) => SRC_ABBR[s] || s || '?';

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

// 글 제목 표시: "제목 – 뭉게" → 제목, 없으면 slug
function pageTitle(m) {
  const t = m.title && m.title !== 'null' ? String(m.title).split(' | ')[0].split(' - ')[0].trim() : '';
  if (t && !/^뭉게/.test(t)) return t;
  const raw = decodeURIComponent(m.slug || m.path || '');
  return raw.replace(/^\/blog\//, '').replace(/\/$/, '') || '홈페이지';
}

// ── /stats — 전체 요약 (뭉게 기준) ──────────────────────────
//
// 뭉게가 유일한 본 사이트다. get_traffic_summary 는 analytics 이벤트만 보는 RPC 라
// 뭉게(GA4+자체트래커)는 잡지 못한다 → 뭉게 수치는 _mungge.js 로 읽는다.
// 구독자·댓글은 사이트 구분 없는 전체 카운트라 그대로 쓴다.
export async function statsMessage() {
  const today = kstDay(0);
  const yday = kstDay(1);
  const [s, c, mg, posts] = await Promise.all([
    rpc('get_traffic_summary'),
    rpc('get_comment_stats'),
    loadMungge(yday, today, { dims: ['total', 'source_medium'] }).catch(() => null),
    mgPosts().catch(() => ({ total: 0 })),
  ]);

  const lines = [`📊 <b>전체 요약</b>  <i>${nowKst()}</i>`, '', `🌐 <b>뭉게</b> (mungge.com)`];
  if (mg) {
    const t = mg.stats(today);
    const y = mg.stats(yday);
    lines.push(
      `👁 오늘 조회수: <b>${fmt(t.views)}</b> (어제 ${fmt(y.views)}, ${delta(t.views, y.views)})`,
      `🧑 오늘 방문자: <b>${fmt(t.users)}</b> (어제 ${fmt(y.users)})`
    );
    // 유입 = 외부에서 들어온 것만(사이트 내 이동은 mg.refs 가 분리해 준다)
    const { refs } = mg.refs(today);
    const search = Object.entries(refs).filter(([l]) => isSearch(l)).reduce((a, [, n]) => a + n, 0);
    const top = Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 3);
    // 검색 합계와 상위 채널은 서로 다른 집계다 → 같은 줄에 붙이면 "6인데 3?" 으로 읽힌다
    if (search || top.length) lines.push(`🔍 검색 유입: <b>${fmt(search)}</b>`);
    if (top.length) {
      lines.push(`📥 주요 유입: <i>${top.map(([l, n]) => `${escapeHtml(l)} ${fmt(n)}`).join(' · ')}</i>`);
    }
    if (t.live) lines.push('<i>※ GA4 배치 전 — 자체 트래커 실시간 기준</i>');
    else if (mg.syncedLabel()) lines.push(`<i>※ GA4 ${mg.syncedLabel()} KST 동기화 기준</i>`);
  } else {
    lines.push('<i>⚠️ 뭉게 수치 조회 실패</i>');
  }
  if (posts?.total) lines.push(`📝 전체 글: <b>${fmt(posts.total)}</b>편`);

  lines.push(
    '',
    `📬 구독자: <b>${fmt(s?.total_subscribers)}</b> (오늘 +${fmt(s?.today_subscribers)})`,
    `💬 댓글: 오늘 <b>${fmt(c?.today)}</b> (전체 ${fmt(c?.total)}, 신고 ${fmt(c?.reports)})`,
    `🛒 쿠팡클릭: 오늘 <b>${fmt(s?.today_clicks)}</b> (누적 ${fmt(s?.total_clicks)}) · ❤️ 좋아요 오늘 ${fmt(s?.today_likes)} (누적 ${fmt(s?.total_likes)})`
  );
  return lines.join('\n');
}

// ── /mg — 뭉게 상세 (조회·유입·인기글·GA4 채널) ──────────────
export async function munggeMessage(days = 7) {
  days = Math.min(Math.max(days, 1), 90);
  const today = kstDay(0);
  const from = kstDay(days - 1);
  const [mg, posts] = await Promise.all([loadMungge(from, today), mgPosts()]);

  const lines = [`🌐 <b>뭉게</b> (mungge.com) — 최근 ${days}일  <i>${nowKst()}</i>`, ''];

  // 일별 조회수 (GA4 미동기화 날은 자체 트래커 폴백 — 라벨에 * 로 표시)
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = kstDay(i);
    const st = mg.stats(day);
    rows.push({ day, ...st });
  }
  // 데이터가 있는 날만 스파크라인/합계에 넣는다 — 수집 시작 전 날을 0 으로 그리면
  // "트래픽이 0 이었다"로 읽혀 추이가 왜곡된다
  const withData = rows.filter((r) => !r.nodata);
  const views = withData.map((r) => r.views);
  if (views.length) lines.push(`<code>${sparkline(views)}</code>`, '');
  rows.forEach((r) =>
    lines.push(
      r.nodata
        ? `<code>${r.day.slice(5).replace('-', '/')}</code>  <i>데이터 없음 (수집 전)</i>`
        : `<code>${r.day.slice(5).replace('-', '/')}</code>  조회 ${fmt(r.views)} · 방문 ${fmt(r.users)}${r.live ? ' *' : ''}`
    )
  );
  lines.push(
    '',
    `합계 조회 <b>${fmt(views.reduce((a, b) => a + b, 0))}</b> <i>(${withData.length}일)</i>`,
    ...(withData.some((r) => r.live) ? ['<i>* GA4 배치 전 — 자체 트래커 실시간 기준</i>'] : [])
  );
  if (posts?.total) lines.push(`📝 전체 글 <b>${fmt(posts.total)}</b>편`);

  // 기간 전체 유입 경로 — 날짜별 refs 를 합산(날마다 GA4/폴백 기준이 달라 stats 와 같은 원칙)
  const refTotal = {};
  let internalTotal = 0;
  for (const r of withData) {
    const { refs, internal } = mg.refs(r.day);
    internalTotal += internal;
    for (const [k, n] of Object.entries(refs)) refTotal[k] = (refTotal[k] || 0) + n;
  }
  const refEntries = Object.entries(refTotal).sort((a, b) => b[1] - a[1]);
  if (refEntries.length) {
    const base = refEntries.reduce((s, [, n]) => s + n, 0);
    const search = refEntries.filter(([l]) => isSearch(l)).reduce((s, [, n]) => s + n, 0);
    const p = (n) => (base ? Math.round((n / base) * 100) : 0);
    lines.push('', `<b>유입 경로</b> — 검색 <b>${fmt(search)}</b> (${p(search)}%)`);
    refEntries.slice(0, 8).forEach(([l, n]) => lines.push(`· ${escapeHtml(l)} ${fmt(n)} (${p(n)}%)`));
    if (internalTotal) lines.push(`<i>+ 사이트 내 이동 ${fmt(internalTotal)} (유입 집계 제외)</i>`);
  }

  // 인기 글 — 기간 전체 합산
  const pageTotal = {};
  for (const r of rows) {
    for (const p of mg.topPages(r.day, 50)) {
      const a = (pageTotal[p.path] ||= { title: p.title, views: 0 });
      a.views += p.views;
    }
  }
  const top = Object.values(pageTotal).sort((a, b) => b.views - a.views).slice(0, 8);
  if (top.length) {
    lines.push('', '<b>인기 글 TOP</b>');
    top.forEach((p, i) => lines.push(`${i + 1}. ${escapeHtml(cut(p.title, 36))} — <b>${fmt(p.views)}</b>`));
  }

  // 최근 발행
  const recent = (posts?.recent || []).slice(0, 5);
  if (recent.length) {
    lines.push('', '<b>최근 발행</b>');
    recent.forEach((p) => lines.push(`· ${p.day} ${escapeHtml(cut(p.title, 32))}`));
  }
  return lines.join('\n');
}

// ── /top [n] — 인기 페이지 (뭉게 최근 30일) ─────────────────
//
// get_top_pages RPC 는 analytics 누적(레거시 TF/LF)이라 뭉게가 안 들어온다.
// 뭉게가 유일한 본 사이트이므로 GA4/자체 트래커 기준으로만 낸다.
export async function topPagesMessage(n = 10) {
  n = Math.min(Math.max(n, 1), 20);
  const mg = await loadMungge(kstDay(29), kstDay(0), { dims: ['total', 'page_all'] }).catch(() => null);

  const lines = [`🔝 <b>인기 페이지</b> — 뭉게 최근 30일  <i>${nowKst()}</i>`, ''];
  if (!mg) return lines.concat('<i>⚠️ 뭉게 수치 조회 실패</i>').join('\n');

  const total = {};
  for (let i = 29; i >= 0; i--) {
    const day = kstDay(i);
    for (const p of mg.topPages(day, 50)) {
      const a = (total[p.path] ||= { title: p.title, views: 0 });
      a.views += p.views;
    }
  }
  const top = Object.values(total).sort((a, b) => b.views - a.views).slice(0, n);
  if (!top.length) return lines.concat('아직 조회 데이터가 없습니다.').join('\n');
  top.forEach((p, i) =>
    lines.push(`${i + 1}. ${escapeHtml(cut(p.title, 36))} — <b>${fmt(p.views)}</b>`)
  );
  return lines.join('\n');
}

// ── /trend — 최근 7일 조회수 (뭉게) ─────────────────────────
export async function trendMessage() {
  const mg = await loadMungge(kstDay(6), kstDay(0), { dims: ['total'] }).catch(() => null);

  const rows = [];
  for (let i = 6; i >= 0; i--) {
    const day = kstDay(i);
    const st = mg ? mg.stats(day) : { views: 0, live: false, nodata: true };
    rows.push({ day, mg: st.views, live: st.live, nodata: st.nodata });
  }
  if (!rows.some((r) => r.mg)) return '아직 트렌드 데이터가 없습니다.';

  const withData = rows.filter((r) => !r.nodata);
  const views = withData.map((r) => r.mg);
  const lines = ['📈 <b>최근 7일 조회수</b> — 뭉게', ''];
  if (views.length) lines.push(`<code>${sparkline(views)}</code>`, '');
  rows.forEach((r) =>
    lines.push(
      `<code>${r.day.slice(5).replace('-', '/')}</code>  ` +
        (r.nodata ? '<i>—</i>' : `<b>${fmt(r.mg)}</b>${r.live ? '*' : ''}`)
    )
  );
  lines.push('', `합계 <b>${fmt(views.reduce((a, b) => a + b, 0))}</b> <i>(${withData.length}일)</i>`);
  if (rows.some((r) => r.nodata)) lines.push('<i>— 뭉게 수집 시작 전 (GA4 07-27 / 자체 트래커 07-28)</i>');
  if (withData.some((r) => r.live)) lines.push('<i>* GA4 배치 전 — 자체 트래커 실시간 기준</i>');
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
    const src = abbr(c.source);
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
//
// 댓글은 두 저장소로 갈린다: 뭉게는 WordPress 자체 댓글(WP REST), VIP 는 Supabase.
// 한 숫자로 합치면 어느 쪽 얘기인지 알 수 없어 줄을 나눈다.
export async function commentStatsMessage() {
  const [s, trend, mgc] = await Promise.all([
    rpc('get_comment_stats'),
    rpc('get_comment_trend'),
    mgComments({ perPage: 1 }).catch(() => ({ total: 0 })),
  ]);
  const rows = Array.isArray(trend) ? trend : [];
  const lines = [
    `💬 <b>댓글 통계</b>  <i>${nowKst()}</i>`,
    '',
    `🌐 뭉게 <b>${fmt(mgc?.total)}</b> <i>(WordPress 댓글 — 답글은 wp-admin)</i>`,
    `🎬 VIP <b>${fmt(s?.vip_count)}</b> · 신고 ${fmt(s?.reports)}`,
  ];
  if (rows.length) {
    lines.push('', '<b>최근 7일</b> <i>(VIP·Supabase 기준)</i>', `<code>${sparkline(rows.map((r) => Number(r.count) || 0))}</code>`);
    rows.forEach((r) => lines.push(`<code>${String(r.day).slice(5).replace('-', '/')}</code>  ${fmt(r.count)}`));
  }
  return lines.join('\n');
}

// ── /coupang — 쿠팡 클릭 상세 (어떤 글 → 어떤 링크) ─────────
export async function coupangMessage() {
  const [s, rowsRaw] = await Promise.all([
    rpc('get_traffic_summary'),
    // 트래커 통일 전 인라인 링크는 affiliate_click 으로 기록 → 두 타입 모두 조회
    // ⚠️ 소스 필터 필수. get_traffic_summary 의 총계는 살아 있는 소스(mg·vip)만 세는데
    // 여기서 전 소스를 가져오면 "누적 0" 밑에 구 TF 클릭 12건이 나열돼 한 화면에서 숫자가 어긋난다.
    restGet('analytics?or=(event_type.eq.coupang_click,event_type.eq.affiliate_click)&source=in.(mg,vip,playcast)&metadata->>__probe=is.null&select=metadata,source,created_at&order=created_at.desc&limit=200'),
  ]);
  const rows = (Array.isArray(rowsRaw) ? rowsRaw : [])
    .filter((r) => { const m = r.metadata || {}; return m.target === undefined || m.target === 'coupang'; })
    .map((r) => { const m = r.metadata || {}; return { ...r, m: { ...m, product: m.product || m.label || '', url: m.url || m.href || '' } }; });

  // 소스별 누적은 RPC 의 tf_/lf_ 필드(삭제된 소스) 대신 조회한 원본 행에서 센다
  const bySource = {};
  rows.forEach((r) => { const k = abbr(r.source); bySource[k] = (bySource[k] || 0) + 1; });
  const srcTxt = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${fmt(n)}`)
    .join(' · ');
  const lines = [
    `🛒 <b>쿠팡 클릭</b>  <i>${nowKst()}</i>`,
    '',
    `오늘 <b>${fmt(s?.today_clicks)}</b> · 누적 <b>${fmt(s?.total_clicks)}</b>`,
    ...(srcTxt ? [`<i>최근 200건 소스별: ${srcTxt}</i>`] : []),
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
      const src = abbr(r.source);
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

// ── /paperdoc — 페이퍼닥 프로모 클릭 (블로그별·위치별) ──────
const PD_SRC_LABEL = { ...SRC_ABBR, gameflow: '(구)GF', paperdoc: '페이퍼닥' };
// 'inline' = 뭉게 본문 안의 텍스트 링크(클래스 없음) — wp-affiliate.js 가 붙이는 값
// 'inline' = 뭉게 본문 안의 텍스트 링크(클래스 없음) · 'naver' = 네이버 포스팅의 /go/paperdoc 경유
const PD_PLACE_LABEL = { popup: '홈 팝업', banner: '가로 배너', side: '사이드 배너', inline: '본문 링크', naver: '네이버 포스팅', other: '기타' };

/* 애드핏 슬롯 충전률 — /adfit
   "재로드를 붙일까"를 판단할 근거를 만드는 계측이다. 지금까지는 슬롯이 비었는지조차
   알 수 없었다(애드핏은 재고가 없으면 조용히 아무것도 안 그린다).
   ⚠️ 이건 **노출 수치가 아니다.** 애드핏 리포트(adfit-xlsx.mjs)와 숫자가 다르며,
   여기서 보는 건 "우리 페이지에서 슬롯이 채워졌나"라는 클라이언트 관점의 비율이다. */
export async function adfitMessage() {
  const rowsRaw = await restGet(
    'analytics?event_type=eq.adfit_slot&metadata->>unit=neq.__selftest__&select=metadata,source,created_at&order=created_at.desc&limit=1000'
  );
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  if (!rows.length) return '📐 <b>애드핏 슬롯</b>\n\n아직 수집된 이벤트가 없습니다.';

  const nowMs = Date.now();
  const byUnit = {}, byDevice = {}, bySrc = {};
  let fill = 0, total = 0, day = 0, dayFill = 0;
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
  const dayOf = (ts) => new Date(new Date(ts).getTime() + 9 * 3600 * 1000).toISOString().split('T')[0];

  rows.forEach((r) => {
    const m = r.metadata || {};
    // filled 만 성공. nofill(애드핏이 명시적으로 없다고 응답) 과 empty(무응답·차단) 는 갈라서 본다.
    const ok = m.result === 'filled';
    total++; if (ok) fill++;
    if (dayOf(r.created_at) === todayKst) { day++; if (ok) dayFill++; }
    const u = (byUnit[m.unit || '?'] ||= { t: 0, f: 0, nofill: 0, empty: 0 });
    u.t++; if (ok) u.f++; else if (m.result === 'nofill') u.nofill++; else u.empty++;
    const d = (byDevice[m.device || '?'] ||= { t: 0, f: 0 });
    d.t++; if (ok) d.f++;
    // ⚠️ 매체를 합치면 안 된다 — 뭉게는 인아티클, VIP 는 하단 고정 앵커라 서빙 양상이 달라
    //    합계로 보면 서로 상쇄돼 신호가 지워진다(adfit 실적을 매체로 가르는 것과 같은 이유).
    // ⚠️ source 는 metadata 안이 아니라 **최상위 컬럼**이다(m.source 로 읽으면 전부 '?').
    const sv = (bySrc[r.source || '?'] ||= { t: 0, f: 0 });
    sv.t++; if (ok) sv.f++;
  });

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const lines = [
    `📐 <b>애드핏 슬롯 충전률</b>  <i>${nowKst()}</i>`,
    '',
    `<b>전체</b>  ${fmt(fill)}/${fmt(total)} (<b>${pct(fill, total)}%</b>) · 오늘 ${fmt(dayFill)}/${fmt(day)} (${pct(dayFill, day)}%)`,
    `<b>매체별</b>  ` + Object.entries(bySrc).sort((a, b) => b[1].t - a[1].t)
      .map(([k, v]) => `${abbr(k)} ${pct(v.f, v.t)}% <i>(${v.t})</i>`).join(' · '),
    `<b>기기별</b>  ` + Object.entries(byDevice).map(([k, v]) => `${k} ${pct(v.f, v.t)}%`).join(' · '),
    '',
    '<b>유닛별</b>',
  ];
  Object.entries(byUnit).sort((a, b) => b[1].t - a[1].t).slice(0, 8).forEach(([u, v]) => {
    lines.push(`· <code>${escapeHtml(u)}</code> ${pct(v.f, v.t)}% <i>(${v.t}건 · 미노출 ${v.nofill} · 무응답 ${v.empty})</i>`);
  });
  lines.push('', '<i>미노출=애드핏이 광고 없다고 응답 · 무응답=요청 실패/차단 추정</i>');
  return lines.join('\n');
}

export async function paperdocMessage() {
  const rowsRaw = await restGet(
    'analytics?event_type=eq.paperdoc_click&metadata->>__probe=is.null&select=metadata,source,created_at&order=created_at.desc&limit=500'
  );
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
  const dayOf = (ts) => new Date(new Date(ts).getTime() + 9 * 3600 * 1000).toISOString().split('T')[0];

  const nowMs = Date.now();
  // 소스 목록을 고정 배열로 박아 두면 새 소스(뭉게)가 들어와도 0 으로 보인다 → 본 것만 센다
  const bySrc = {};
  const byPlace = {};
  let total = 0, day = 0, week = 0, month = 0;
  rows.forEach((r) => {
    total++;
    const tMs = new Date(r.created_at).getTime();
    const isToday = dayOf(r.created_at) === todayKst;
    if (isToday) day++;
    if (tMs >= nowMs - 7 * 86400000) week++;
    if (tMs >= nowMs - 30 * 86400000) month++;
    const key = r.source || '?';
    const b = (bySrc[key] ||= { total: 0, today: 0 });
    b.total++;
    if (isToday) b.today++;
    const p = (r.metadata && r.metadata.placement) || 'other';
    byPlace[p] = (byPlace[p] || 0) + 1;
  });

  const srcTxt = Object.entries(bySrc)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => `${PD_SRC_LABEL[k] || k} ${fmt(v.total)}`)
    .join(' · ');
  const lines = [
    `📄 <b>페이퍼닥 클릭</b>  <i>${nowKst()}</i>`,
    '',
    `<b>기간별</b>  일간 <b>${fmt(day)}</b> · 주간 <b>${fmt(week)}</b> · 월간 <b>${fmt(month)}</b> · 전체 <b>${fmt(total)}</b>`,
    ...(srcTxt ? [`<b>소스별</b>  ${srcTxt} <i>(누적)</i>`] : []),
  ];

  const places = Object.entries(byPlace).sort((a, b) => b[1] - a[1]);
  if (places.length) {
    lines.push('', '<b>노출 위치별</b>');
    places.forEach(([k, c]) => lines.push(`· ${PD_PLACE_LABEL[k] || k} — <b>${fmt(c)}</b>`));
  }

  const recent = rows.slice(0, 8);
  if (recent.length) {
    lines.push('', '<b>최근 클릭</b>');
    recent.forEach((r) => {
      const m = r.metadata || {};
      const src = PD_SRC_LABEL[r.source] || r.source || '?';
      const place = PD_PLACE_LABEL[m.placement] || m.placement || '기타';
      lines.push(`· [${src}] ${place} ← ${escapeHtml(cut(pageTitle(m), 24))} (${timeAgo(r.created_at)})`);
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
  pageview_mg: '👁 조회',          // 뭉게 자체 트래커 — 라벨이 없어 'pageview_mg' 원문이 노출됐다
  coupang_click: '🛒 쿠팡클릭',
  affiliate_click: '🛒 쿠팡클릭',
  paperdoc_click: '📄 페이퍼닥',
  tool_click: '🧮 계산기',
  newsletter_subscribe: '📬 구독',
  adfit_slot: '📐 광고슬롯',
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
    // get_recent_events 는 metadata 를 펼쳐서(slug/title/path/product) 돌려준다.
    // e.metadata 로 읽으면 항상 undefined 라 모든 이벤트가 '홈페이지'로 표시됐다.
    const m = e.metadata || e;
    const src = abbr(e.source);
    const label = EVENT_LABELS[e.event_type] || e.event_type;
    const what = e.event_type === 'coupang_click' || e.event_type === 'affiliate_click'
      ? cut(m.product || m.label || pageTitle(m), 26)
      : cut(pageTitle(m), 26);
    lines.push(`· [${src}] ${label} — ${escapeHtml(what)} (${timeAgo(e.created_at)})`);
  });
  return lines.join('\n');
}
