// 전날(또는 지정일) 종합 리포트 — 뭉게(mungge.com) 기준
// cron(daily-report.js) 과 봇 /report 명령이 공유
//
// 2026-07-30 재편성: TF·LF 는 mungge 로 301 통합돼 자체 조회가 한 자릿수로 떨어졌고,
// 실제 트래픽은 전부 뭉게로 온다. 그런데 뭉게는 source=null(WP 직접 운영)이라 이 리포트에
// 아예 안 잡혀서, 매일 아침 "조회수 3, 방문자 2" 같은 빈 사이트 수치만 오고 있었다.
// → 본문은 뭉게 기준으로 세우고, TF/LF/VIP 잔존 활동은 맨 아래 '레거시' 한 블록으로 접는다.
// 뭉게 수치의 두 소스와 이중계산 방지 원칙은 _mungge.js 주석 참조.

import { blogList } from './_blogs.js';
import { communityHot } from './_community.js';
import { getFileJson } from './_github.js';
import { gscReportLines } from './_gsc-view.js';
import { loadMungge, mgNaverIndex, mgPosts } from './_mungge.js';
import { isSearch } from './_refs.js';
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

// 레거시 블로그 source → 표시 약어
const LEGACY_ABBR = { blog: 'TF', lifeflow: 'LF', playcast: 'VIP', vip: 'VIP' };
const legacyAbbr = (s) => LEGACY_ABBR[s] || s || '?';

// 홈페이지 조회는 사이트 제목으로 기록된다 → '홈' 으로 표시
const postTitle = (t) => (/^(TechFlow|LifeFlow|뭉게)/.test(t) ? '홈' : t);

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

// ── 레거시(TF·LF·VIP) 하루치 — 자체 트래커 이벤트 ──
// 뭉게 이전의 자산이라 조회수는 이제 잔존값이지만, 댓글·좋아요·쿠팡클릭은 아직 여기에만 있다.
async function collectLegacy(day) {
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

  // 이전에는 'lifeflow 가 아니면 전부 TF' 로 셌다 → VIP(playcast) 조회가 TF 로 흡수돼
  // "TF 에 아직 트래픽이 있다"로 오독됐다. source 를 그대로 집계한다.
  // 유입경로·방문자 분해는 뭉게 블록에서만 낸다 — 레거시는 잔존 규모만 알면 되므로 총량만 센다.
  const bySrc = {};
  (pv || []).forEach((r) => {
    const k = legacyAbbr(r.source);
    bySrc[k] = (bySrc[k] || 0) + 1;
  });

  return {
    day,
    views: (pv || []).length,
    bySrc,
    comments: (comments || []).filter((c) => !c.is_admin),
    likes: (likes || []).length,
    clicks: (clicks || []).filter((c) => {
      const m = c.metadata || {};
      return m.target === undefined || m.target === 'coupang';
    }),
  };
}

// ── 전일 대비 급상승/급락 글 (뭉게 기준) ──
function movers(curPages, prevPages, minViews = 3) {
  const cur = {}, prev = {};
  curPages.forEach((p) => (cur[p.path] = { views: p.views, title: p.title }));
  prevPages.forEach((p) => (prev[p.path] = { views: p.views, title: p.title }));
  const rows = [];
  for (const path of new Set([...Object.keys(cur), ...Object.keys(prev)])) {
    const c = cur[path]?.views || 0;
    const p = prev[path]?.views || 0;
    if (Math.max(c, p) < minViews) continue;        // 표본이 너무 작으면 노이즈
    rows.push({ title: cur[path]?.title || prev[path]?.title || path, cur: c, prev: p, diff: c - p });
  }
  return {
    up: rows.filter((r) => r.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 2),
    down: rows.filter((r) => r.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 2),
  };
}

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

// ── 오늘 쓸 만한 소재 (커뮤니티 실시간 화제) ──
async function todaysTopics() {
  const jobs = blogList()
    .filter((b) => b.generator && b.communities?.length)
    .map(async (b) => {
      try {
        const seeds = await getFileJson(b, 'scripts/category-seeds.json').catch(() => null);
        const { posts } = await communityHot(b, seeds, 3);
        return posts.slice(0, 2).map((p) => ({ key: b.key, label: b.label.split(' (')[0], post: p }));
      } catch {
        return [];
      }
    });
  return (await Promise.all(jobs)).flat().slice(0, 4);
}

export async function reportMessage(dayArg) {
  const day = dayArg || kstDay(1);                      // 기본 = 어제(KST)
  const prevDay = kstShift(day, 1);

  const [mg, legacy, prevLegacy, posts, naver, topics, gscLines] = await Promise.all([
    loadMungge(prevDay, day),
    collectLegacy(day),
    collectLegacy(prevDay),
    mgPosts(),
    mgNaverIndex(),
    todaysTopics().catch(() => []),
    gscReportLines().catch(() => []),   // Search Console 미연동이면 빈 배열
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
  if (posts.total) lines.push(`📝 전체 글 <b>${fmt(posts.total)}</b>편`);
  lines.push(
    cur.live
      ? '<i>※ GA4 배치 전 — 자체 트래커 실시간 집계 기준</i>'
      : `<i>※ GA4 배치 기준${mg.syncedLabel() ? ` (${mg.syncedLabel()} KST 동기화)` : ''}</i>`
  );

  // ── 유입 경로 (검색 유입이 핵심) ──
  //
  // ⚠️ GA4 기본 채널그룹은 네이버를 Referral 로 분류한다 → Organic Search 만 세면
  // 검색 유입이 과소집계된다. 소스 호스트 기준으로 재분류한 값을 쓴다(_refs.js).
  const { refs, internal, unit } = mg.refs(day);
  const prevRefs = mg.refs(prevDay).refs;
  const refEntries = Object.entries(refs).sort((a, b) => b[1] - a[1]);
  if (refEntries.length) {
    const base = refEntries.reduce((s, [, n]) => s + n, 0);
    const searchCur = refEntries.filter(([l]) => isSearch(l)).reduce((s, [, n]) => s + n, 0);
    const searchPrev = Object.entries(prevRefs)
      .filter(([l]) => isSearch(l))
      .reduce((s, [, n]) => s + n, 0);
    const pct = (n) => (base ? Math.round((n / base) * 100) : 0);
    lines.push(
      '',
      `<b>유입 경로</b> (${unit === 'sessions' ? '세션' : '조회'} 기준) — 검색 <b>${fmt(searchCur)}</b> (${pct(searchCur)}%)${delta(searchCur, searchPrev)}`
    );
    refEntries.slice(0, 6).forEach(([label, n]) =>
      lines.push(`· ${escapeHtml(label)} ${fmt(n)} (${pct(n)}%)`)
    );
    // 내부 이동은 유입이 아니라 분모에서 뺐다 → 뺀 사실과 크기를 밝힌다(회유 지표로도 유용)
    if (internal) lines.push(`<i>+ 사이트 내 이동 ${fmt(internal)} (유입 집계 제외)</i>`);
  }

  // GA4 가 스스로 어떻게 분류했는지도 한 줄 남긴다 — 위 수치와 어긋나면 네이버 보정 때문이다
  const ch = mg.channels(day);
  if (ch.length) {
    lines.push(
      `<i>GA4 채널: ${ch.slice(0, 5).map((c) => `${escapeHtml(c.label)} ${fmt(c.sessions)}`).join(' · ')}</i>`
    );
  }

  // ── 인기 글 ──
  if (curPages.length) {
    lines.push('', '<b>인기 글 TOP</b>');
    curPages.slice(0, 5).forEach((p, i) =>
      lines.push(`${i + 1}. ${escapeHtml(cut(postTitle(p.title), 34))} — ${fmt(p.views)}`)
    );
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

  // ── 급상승 / 급락 ──
  const mv = movers(curPages, prevPages);
  if (mv.up.length || mv.down.length) {
    lines.push('', '<b>전일 대비 변화</b>');
    mv.up.forEach((r) =>
      lines.push(`▲ ${escapeHtml(cut(postTitle(r.title), 30))} ${fmt(r.prev)}→<b>${fmt(r.cur)}</b>`)
    );
    mv.down.forEach((r) =>
      lines.push(`▼ ${escapeHtml(cut(postTitle(r.title), 30))} ${fmt(r.prev)}→<b>${fmt(r.cur)}</b>`)
    );
  }

  // ── 검색 유입 (Search Console) ──
  lines.push(...gscLines);

  // ── 네이버 색인 (구글 옆에 붙여야 "어느 쪽이 막혔는지"가 한눈에 보인다) ──
  lines.push(...naverIndexLines(naver));

  // ── 레거시 (TF·LF·VIP → 뭉게 301) ──
  // 조회는 잔존값이라 한 줄로 접고, 댓글·좋아요·쿠팡클릭은 아직 여기에만 있으므로 살려 둔다.
  const legacyActive =
    legacy.views || legacy.comments.length || legacy.likes || legacy.clicks.length;
  if (legacyActive) {
    const srcTxt = Object.entries(legacy.bySrc)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${fmt(n)}`)
      .join(' · ');
    lines.push(
      '',
      '<b>레거시</b> <i>(TF·LF·VIP → 뭉게 301)</i>',
      `👁 조회 ${fmt(legacy.views)}${srcTxt ? ` (${srcTxt})` : ''}${delta(legacy.views, prevLegacy.views)}`,
      `💬 댓글 ${fmt(legacy.comments.length)} · ❤️ 좋아요 ${fmt(legacy.likes)} · 🛒 쿠팡클릭 ${fmt(legacy.clicks.length)}`
    );

    if (legacy.comments.length) {
      legacy.comments.slice(0, 3).forEach((c) =>
        lines.push(`  💬 [${legacyAbbr(c.source)}] <b>${escapeHtml(c.nickname)}</b>: ${escapeHtml(cut(c.content, 34))}`)
      );
      if (legacy.comments.length > 3) {
        lines.push(`  …외 ${legacy.comments.length - 3}개 (<code>/comments</code>)`);
      }
    }
    if (legacy.clicks.length) {
      const by = {};
      legacy.clicks.forEach((c) => {
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

  if (!cur.views && !legacyActive) {
    lines.push('', '<i>해당 날짜의 활동 데이터가 없습니다.</i>');
  }

  // ── 오늘 쓸 만한 소재 (커뮤니티 실시간 화제) ──
  if (topics.length) {
    lines.push('', '<b>오늘의 추천 주제</b> — 커뮤니티 화제');
    topics.forEach((t) => lines.push(`· [${t.key.toUpperCase()}] ${escapeHtml(cut(t.post, 40))}`));
    lines.push('<code>/generate</code> 로 바로 쓸 수 있습니다.');
  }

  return lines.join('\n');
}
