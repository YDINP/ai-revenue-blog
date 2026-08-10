// 전날(또는 지정일) 종합 리포트 — 뭉게(mungge.com) 기준
// cron(daily-report.js) 과 봇 /report 명령이 공유
//
// 2026-07-30 재편성: TF·LF 는 mungge 로 301 통합돼 리다이렉트 셸만 남았다. 소스로서의
// TF/LF 는 제거했고(api/_blogs.js), 이 리포트는 뭉게 하나만 본다.
// 뭉게 수치의 두 소스(GA4 배치 / 자체 트래커)와 이중계산 방지 원칙은 _mungge.js 주석 참조.
//
// 뭉게에서 쌓이는 부가 활동:
//   · 좋아요  — analytics `like` (source='mg', scripts/wp-like.js)
//   · 쿠팡클릭 — analytics `coupang_click` (source='mg', scripts/wp-affiliate.js)
//   · 댓글    — WordPress 자체 댓글이라 Supabase 가 아니라 WP REST 로 읽는다(mgComments)

import { gscReportLines } from './_gsc-view.js';
import { gscSummary, gscDay } from './_gsc.js';
import { resolveBlog } from './_blogs.js';
import { loadMungge, mgComments, mgNaverIndex, mgPosts } from './_mungge.js';
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  escapeHtml,
  kstDay,
  kstRange,
  kstShift,
} from './_shared.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const cut = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n) + '…' : s);

// 홈페이지 조회는 사이트 제목으로 기록된다 → '홈' 으로 표시
const postTitle = (t) => (/^뭉게/.test(t) ? '홈' : t);

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

// ── 뭉게 하루치 부가 활동 (좋아요·쿠팡클릭) ──
// 조회수·유입경로는 loadMungge(GA4/자체 트래커)가 담당하고, 여기서는 analytics 이벤트로만
// 남는 상호작용을 센다. source='mg' 로 좁혀야 VIP·과거 TF/LF 행이 섞이지 않는다.
async function collectMgEvents(day) {
  const { start, end } = kstRange(day);
  const range = `created_at=gte.${start}&created_at=lt.${end}`;

  const [likes, clicks] = await Promise.all([
    rest(`analytics?event_type=eq.like&source=eq.mg&${range}&select=metadata`).catch(() => []),
    rest(
      `analytics?or=(event_type.eq.coupang_click,event_type.eq.affiliate_click)&source=eq.mg&${range}&select=metadata`
    ).catch(() => []),
  ]);

  return {
    day,
    likes: (likes || []).length,
    // affiliate_click 은 쿠팡 외 대상도 쓰이므로 target 으로 한 번 더 거른다
    clicks: (clicks || []).filter((c) => {
      const m = c.metadata || {};
      return m.target === undefined || m.target === 'coupang';
    }),
  };
}

// ── 전일 대비 급상승/급락 글 (뭉게 기준) ──
// ── 네이버 색인 (로컬 측정치) ──
//
// 네이버 검색결과는 클라이언트 렌더라 서버리스에서 못 읽는다. 측정은 로컬
// scripts/naver-index-check.mjs 가 하고, 결과를 analytics(event_type=naver_index)에 남긴다.
// 여기서는 그 최신치를 읽어 리포트에 붙이기만 한다.
// → 값이 오래됐으면 "색인이 안 늘었다"가 아니라 "측정이 안 돌았다"이므로 반드시 구분해 표기한다.
function naverIndexLines(idx) {
  if (!idx?.cur) return [];
  const { cur, prev } = idx;
  const indexed = Number(cur.indexed || 0);
  const total = Number(cur.sitemap || 0);
  const rate = total ? ((indexed / total) * 100).toFixed(1) : '0.0';
  const d = prev ? indexed - Number(prev.indexed || 0) : null;
  const dTxt = d === null ? '' : ` (전회 ${d >= 0 ? '+' : ''}${d})`;
  const out = ['', `<b>네이버 색인</b> — <b>${fmt(indexed)}</b>/${fmt(total)} (${rate}%)${dTxt}`];

  const ageH = (Date.now() - new Date(cur.at).getTime()) / 3600000;
  if (ageH > 48) {
    out.push(`  ⚠️ 마지막 측정 ${Math.floor(ageH / 24)}일 전 — 로컬 측정 스크립트가 안 돌고 있습니다`);
  }
  if (cur.blocked) out.push('  ⚠️ 측정 시 네이버 자동접근 차단(보안문자) — 수치 신뢰 불가');
  return out;
}

// ── Ahrefs Site Audit — 기술 SEO 이슈 요약(Vercel env AHREFS_API_KEY 있을 때만) ──
// 응답 스키마가 확정 전이라 필드명을 방어적으로 탐색한다. 키 없거나 실패하면 [](섹션 생략).
async function ahrefsAuditLines() {
  const key = process.env.AHREFS_API_KEY;
  if (!key) return [];
  const pid = process.env.AHREFS_PROJECT_ID || '10214302';
  const date = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let json;
  try {
    const r = await fetch(
      `https://api.ahrefs.com/v3/site-audit/issues?date=${encodeURIComponent(date)}&project_id=${encodeURIComponent(pid)}`,
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }
    );
    if (!r.ok) return [];
    json = await r.json();
  } catch { return []; }
  const rows = Array.isArray(json) ? json
    : Array.isArray(json?.issues) ? json.issues
    : Array.isArray(json?.data) ? json.data : [];
  if (!rows.length) return [];
  const pagesOf = (r) => Number(r.urls_count ?? r.pages ?? r.affected_pages ?? r.count ?? 0) || 0;
  const sev = {};
  for (const r of rows) { const s = String(r.severity || r.priority || 'issue').toLowerCase(); sev[s] = (sev[s] || 0) + 1; }
  const sevTxt = Object.entries(sev).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
  const out = ['', `<b>🔧 Ahrefs 사이트감사</b> — 이슈 ${rows.length}건${sevTxt ? ` (${sevTxt})` : ''}`];
  for (const r of [...rows].sort((a, b) => pagesOf(b) - pagesOf(a)).slice(0, 3)) {
    const name = r.name || r.issue || r.title || r.type || '(이슈)';
    const n = pagesOf(r);
    out.push(`· ${escapeHtml(cut(String(name), 30))}${n ? ` — ${fmt(n)}p` : ''}`);
  }
  return out;
}

// ── 📈 SEO 추이 (구글 색인 커버리지 · GSC 주간추세 · Bing) ────────────────────
// gsc-coverage 크론이 쌓은 최신 스냅샷 + gsc_daily 7일 창을 "읽기만" 한다.
// 느린 URL 검사는 gsc-coverage.js 가 리포트보다 20분 먼저 별도로 돈다(타임아웃 분리).
async function seoTrendLines() {
  const out = [];
  // 1) 구글 색인 커버리지 추이 (오늘 vs 직전 스냅샷)
  try {
    const rows = await rest(
      'gsc_coverage?site=eq.mg&order=date.desc&limit=2&select=date,indexed,crawled_not_indexed,unknown,total,unknown_urls'
    );
    if (rows.length) {
      const cur = rows[0], prev = rows[1];
      const d = (k) => (prev ? cur[k] - prev[k] : 0);
      const sign = (n) => (n > 0 ? ` <b>▲${n}</b>` : n < 0 ? ` <b>▼${Math.abs(n)}</b>` : '');
      out.push(
        '',
        `📈 <b>SEO 추이</b> — 구글 색인 (표본 ${cur.total}편 · ${cur.date})`,
        `색인 <b>${fmt(cur.indexed)}</b>${sign(d('indexed'))} · 크롤·미색인 <b>${fmt(cur.crawled_not_indexed)}</b>${sign(d('crawled_not_indexed'))} · 미발견 <b>${fmt(cur.unknown)}</b>${sign(d('unknown'))}`
      );
      const uk = Array.isArray(cur.unknown_urls) ? cur.unknown_urls : [];
      if (uk.length) {
        out.push('🔎 <b>미발견</b> (IndexNow 제출됨 · 구글 색인요청 대상):');
        uk.slice(0, 5).forEach((u) => out.push(`· ${escapeHtml(cut(String(u).replace('https://mungge.com/', ''), 40))}`));
        if (uk.length > 5) out.push(`  …외 ${uk.length - 5}편`);
      }
    } else {
      out.push('', '📈 <b>SEO 추이</b> — 색인 커버리지 데이터 없음 (gsc-coverage 첫 수집 대기)');
    }
  } catch (e) {
    out.push('', `📈 <b>SEO 추이</b> — 색인 조회 실패: ${escapeHtml(e.message)}`);
  }

  // 2) GSC 노출·클릭·순위 주간 추세 (최근 7일 vs 직전 7일)
  try {
    const sum = async (fromDay, toDay) => {
      const rows = await rest(
        `gsc_daily?source=eq.mg&date=gte.${toDay}&date=lte.${fromDay}&select=clicks,impressions,position`
      );
      let c = 0, im = 0, pw = 0;
      for (const r of rows) { c += r.clicks || 0; im += r.impressions || 0; pw += (r.position || 0) * (r.impressions || 0); }
      return { clicks: c, impressions: im, position: im ? pw / im : 0, ctr: im ? c / im : 0 };
    };
    const last = await sum(kstDay(1), kstDay(7));
    const prior = await sum(kstDay(8), kstDay(14));
    // ▲=개선, ▼=악화 로 통일한다. 순위(position)는 값이 낮을수록 좋으므로 lowerBetter 로 방향을 뒤집는다.
    const dl = (c, p, lowerBetter = false) => {
      if (!p) return '';
      const pct = Math.round(((c - p) / p) * 100);
      if (pct === 0) return ' (±0%)';
      const improved = lowerBetter ? c < p : c > p;
      return ` (${improved ? '▲' : '▼'}${Math.abs(pct)}%)`;
    };
    out.push(
      '🗓 <b>주간 추세</b> (최근7일 vs 직전7일)',
      `클릭 <b>${fmt(last.clicks)}</b>${dl(last.clicks, prior.clicks)} · 노출 <b>${fmt(last.impressions)}</b>${dl(last.impressions, prior.impressions)}`,
      `CTR ${(last.ctr * 100).toFixed(1)}% · 평균순위 ${last.position.toFixed(1)}${dl(last.position, prior.position, true)}`
    );
  } catch (e) {
    out.push(`🗓 <b>주간 추세</b> — 조회 실패: ${escapeHtml(e.message)}`);
  }

  // 3) Bing — 미연동(키 필요). IndexNow 로 제출은 되지만 색인·노출 수치는 Bing Webmaster API 키가 있어야 읽힌다.
  out.push('🅱️ <b>Bing</b> — 미연동 (색인·노출은 API 키 필요 · IndexNow 제출은 진행 중)');
  return out;
}

export async function reportMessage(dayArg) {
  const day = dayArg || kstDay(1);                      // 기본 = 어제(KST)
  const prevDay = kstShift(day, 1);

  const [mg, ev, prevEv, posts, comments, naver, gscLines, ahrefsLines] = await Promise.all([
    loadMungge(prevDay, day),
    collectMgEvents(day),
    collectMgEvents(prevDay),
    mgPosts(),
    mgComments({ perPage: 10 }).catch(() => ({ total: 0, recent: [] })),
    mgNaverIndex(),
    gscReportLines().catch(() => []),   // Search Console 미연동이면 빈 배열
    ahrefsAuditLines().catch(() => []), // Ahrefs 키 미설정/실패면 빈 배열
  ]);

  const cur = mg.stats(day);
  const prev = mg.stats(prevDay);
  const curPages = mg.topPages(day, 30);
  const prevPages = mg.topPages(prevDay, 30);

  // day 는 이미 KST 달력 날짜(YYYY-MM-DD)이므로 UTC 자정으로 파싱해 getUTCDay 로 요일을 뽑는다.
  // getDay()/+09:00 조합은 서버 로컬 TZ(UTC 러너)에서 하루 밀림 → 07-13(월)이 일요일로 표기됐음.
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(`${day}T00:00:00Z`).getUTCDay()];
  const engRate = cur.sessions ? Math.round((cur.engaged / cur.sessions) * 100) : 0;

  const lines = [
    `📊 <b>일일 리포트</b> — ${day} (${wd})`,
    `🌐 <b>뭉게</b> (mungge.com)`,
    '',
    `👁 조회수 <b>${fmt(cur.views)}</b>${delta(cur.views, prev.views)}`,
    `🧑 방문자 <b>${fmt(cur.users)}</b>${delta(cur.users, prev.users)}`,
  ];
  // 세션·참여율은 GA4 만 주는 지표 — 폴백 날에는 0 이므로 아예 빼는 게 정확하다.
  // 참여세션은 동기화 시점에 따라 아직 0 으로 들어오는 날이 있어(예: 07-29) 0 이면 생략한다
  // — '참여율 0%' 로 찍으면 체류가 전멸한 것처럼 읽힌다.
  if (!cur.live) {
    lines.push(
      `📈 세션 <b>${fmt(cur.sessions)}</b>` +
        (cur.engaged ? ` · 참여 ${fmt(cur.engaged)} (참여율 ${engRate}%)` : '')
    );
  }
  lines.push(
    cur.live
      ? '<i>※ GA4 배치 전 — 자체 트래커 실시간 집계 기준</i>'
      : `<i>※ GA4 배치 기준${mg.syncedLabel() ? ` (${mg.syncedLabel()} KST 동기화)` : ''}</i>`
  );

  // ── 🔥 전일 hot 포스팅 (인기 글 순위 + 전일 대비 증감 통합) ──
  // 전일 조회순 상위 글을 뽑되, 각 줄에 하루 전 대비 변화(▲증가/▼감소/🆕신규 등장)를 붙인다.
  // 예전엔 '인기 글 TOP'(현재 조회)과 '전일 대비 변화'(prev→cur)를 따로 찍었는데, 같은 글이
  // 두 목록에 중복되고 한눈에 안 들어와서 하나로 합쳤다.
  if (curPages.length) {
    const prevByPath = Object.create(null);
    prevPages.forEach((p) => (prevByPath[p.path] = p.views));
    lines.push('', '🔥 <b>전일 hot 포스팅</b> <i>(조회수 · 전일대비)</i>');
    curPages.slice(0, 7).forEach((p, i) => {
      const before = prevByPath[p.path];
      let tag;
      if (before === undefined || before === 0) tag = ' 🆕';
      else {
        const diff = p.views - before;
        tag = diff > 0 ? ` ▲${fmt(diff)}` : diff < 0 ? ` ▼${fmt(-diff)}` : ' ±0';
      }
      lines.push(`${i + 1}. ${escapeHtml(cut(postTitle(p.title), 30))} <b>${fmt(p.views)}</b>${tag}`);
    });
  }

  // ── 어제 발행한 글 + 초기 성과 ──
  const fresh = (posts.recent || []).filter((p) => p.day === day);
  if (fresh.length) {
    const withViews = fresh
      .map((p) => ({ ...p, views: mg.viewsOfPath(day, p.path) }))
      .sort((a, b) => b.views - a.views);
    lines.push('', `<b>새로 발행한 글</b> ${withViews.length}편`);
    withViews.slice(0, 5).forEach((p) =>
      lines.push(`· ${escapeHtml(cut(p.title, 34))} — 조회 ${fmt(p.views)}`)
    );
    if (withViews.length > 5) lines.push(`  …외 ${withViews.length - 5}편`);
  }

  // ── 검색 유입 (Search Console) ──
  lines.push(...gscLines);

  // ── 📈 SEO 추이 (색인 커버리지·주간추세·Bing) ──
  lines.push(...(await seoTrendLines()));

  // ── 네이버 색인 (구글 옆에 붙여야 "어느 쪽이 막혔는지"가 한눈에 보인다) ──
  lines.push(...naverIndexLines(naver));

  // ── Ahrefs 사이트 감사 (기술 SEO 이슈) ──
  lines.push(...ahrefsLines);

  // ── 상호작용 (좋아요·쿠팡클릭·댓글) ──
  // 조회수와 달리 이건 "읽고 나서 뭘 했나"라 별 블록으로 세운다.
  const dayComments = (comments.recent || []).filter((c) => c.day === day);
  const hasEvents = ev.likes || ev.clicks.length || dayComments.length;
  if (hasEvents) {
    lines.push(
      '',
      '<b>상호작용</b>',
      `❤️ 좋아요 ${fmt(ev.likes)} · 🛒 쿠팡클릭 ${fmt(ev.clicks.length)}${delta(ev.clicks.length, prevEv.clicks.length)} · 💬 댓글 ${fmt(dayComments.length)}`
    );

    if (dayComments.length) {
      dayComments.slice(0, 3).forEach((c) =>
        lines.push(`  💬 <b>${escapeHtml(c.nickname)}</b>: ${escapeHtml(cut(c.content, 34))}`)
      );
      if (dayComments.length > 3) lines.push(`  …외 ${dayComments.length - 3}개`);
    }
    if (ev.clicks.length) {
      const by = {};
      ev.clicks.forEach((c) => {
        const m = c.metadata || {};
        const p = m.product || m.label || '(상품 미상)';
        by[p] = (by[p] || 0) + 1;
      });
      Object.entries(by)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .forEach(([p, n]) => lines.push(`  🛒 ${escapeHtml(cut(p, 32))} — ${fmt(n)}`));
    }
  }

  if (!cur.views && !hasEvents) {
    lines.push('', '<i>해당 날짜의 활동 데이터가 없습니다.</i>');
  }

  return lines.join('\n');
}

// ── VIP(Playcast) 리포트 ─────────────────────────────────────────────────────
// 뭉게와 달리 Playcast(virtual-in-playing)는 이 repo 밖 사이트라 조회수/댓글(GA4·WP)이
// 안 닿는다. 닿는 건 GSC 검색 실적뿐이라 그걸로 구성한다(트래픽 수치 없음은 명시).
export async function vipReportMessage() {
  const pc = resolveBlog('pc');
  const end = gscDay(3);              // GSC 는 2~3일 지연 → 3일 전까지가 안전한 마지막 날
  const start = gscDay(3 + 7 - 1);    // 최근 7일
  const lines = [
    '📊 <b>VIP 리포트</b> — Playcast',
    '🎬 virtual-in-playing.vercel.app',
    `<i>※ GA4 미연동 — GSC 검색 실적 기준 (최근 7일 ${start} ~ ${end})</i>`,
  ];
  try {
    const s = await gscSummary(pc.gscSite, start, end, 5);
    lines.push(
      '',
      '🔍 <b>검색 유입</b>',
      `클릭 <b>${fmt(s.clicks)}</b> · 노출 <b>${fmt(s.impressions)}</b> · CTR ${(s.ctr * 100).toFixed(1)}% · 평균순위 ${s.position.toFixed(1)}`
    );
    if (s.queries.length) {
      lines.push('', '🔑 <b>검색어</b>');
      s.queries.forEach((q) =>
        lines.push(`· ${escapeHtml(cut(q.key, 26))} — 클릭 ${fmt(q.clicks)} / 노출 ${fmt(q.impressions)} (${q.position.toFixed(0)}위)`)
      );
    } else {
      lines.push('<i>검색어 데이터 없음 (색인 초기이거나 노출 부족)</i>');
    }
    if (s.pages.length) {
      lines.push('', '📄 <b>유입 페이지</b>');
      s.pages.slice(0, 5).forEach((p) =>
        lines.push(`· ${escapeHtml(cut(p.key.replace(/^https?:\/\/[^/]+/, ''), 30))} — 클릭 ${fmt(p.clicks)} / 노출 ${fmt(p.impressions)}`)
      );
    }
  } catch (e) {
    lines.push('', `⚠️ GSC 조회 실패: ${escapeHtml(e.message)}`);
  }
  return lines.join('\n');
}
