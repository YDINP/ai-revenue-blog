// GSC 조회 결과 → 텔레그램 메시지 (/gsc 명령, 일일 리포트 섹션)

import { blogList } from './_blogs.js';
import { gscDay, gscSummary, hasGsc } from './_gsc.js';
import { escapeHtml } from './_shared.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const cut = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n) + '…' : s);
const pct = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`;
const pos = (v) => Number(v || 0).toFixed(1);

// 뭉게가 본 사이트다(TF·LF 는 301 이관) → 항상 먼저 나오게 정렬한다
const gscBlogs = () =>
  blogList()
    .filter((b) => b.gscSite)
    .sort((a, b) => (a.key === 'mg' ? -1 : b.key === 'mg' ? 1 : 0));

const shortLabel = (b) => b.label.split(' (')[0];

// /gsc [days] — 최근 N일(기본 7) 검색 성과
export async function gscMessage(days = 7) {
  if (!hasGsc()) {
    return '⚠️ Search Console 미연동 — <code>GOOGLE_SA_EMAIL</code>, <code>GOOGLE_SA_PRIVATE_KEY</code> 설정이 필요합니다.';
  }
  days = Math.min(Math.max(days, 1), 90);
  // GSC 데이터는 2~3일 지연 → 종료일을 3일 전으로 잡아야 빈 결과가 안 나온다
  const end = gscDay(3);
  const start = gscDay(3 + days - 1);

  const lines = [`🔍 <b>검색 유입</b> — 최근 ${days}일 (${start} ~ ${end})`];

  for (const b of gscBlogs()) {
    try {
      const s = await gscSummary(b.gscSite, start, end, 5);
      lines.push(
        '',
        `<b>${escapeHtml(shortLabel(b))}</b>`,
        `클릭 <b>${fmt(s.clicks)}</b> · 노출 <b>${fmt(s.impressions)}</b> · CTR ${pct(s.ctr)} · 평균순위 ${pos(s.position)}`
      );
      if (s.queries.length) {
        lines.push('🔑 <b>검색어</b>');
        s.queries.forEach((q) =>
          lines.push(
            `· ${escapeHtml(cut(q.key, 26))} — 클릭 ${fmt(q.clicks)} / 노출 ${fmt(q.impressions)} (${pos(q.position)}위)`
          )
        );
      } else {
        lines.push('<i>검색어 데이터 없음 (색인 초기이거나 노출 부족)</i>');
      }
      if (s.pages.length) {
        lines.push('📄 <b>유입 페이지</b>');
        s.pages.forEach((p) => {
          const path = p.key.replace(/^https?:\/\/[^/]+/, '');
          lines.push(`· ${escapeHtml(cut(path, 30))} — 클릭 ${fmt(p.clicks)} / 노출 ${fmt(p.impressions)}`);
        });
      }
    } catch (e) {
      lines.push('', `<b>${escapeHtml(shortLabel(b))}</b>`, `⚠️ ${escapeHtml(e.message)}`);
    }
  }
  return lines.join('\n');
}

// /seo [days] — 검색 데이터에서 "손보면 바로 오를 것" 찾기
//
//  1) CTR 개선 대상 — 노출은 나오는데 클릭이 거의 없는 글 (제목·설명 문제)
//  2) 문턱 앞 검색어 — 8~20위. 조금만 보강하면 1페이지 진입
//  3) 미공략 검색어 — 노출은 있는데 클릭 0. 그 주제 전용 글이 없다는 신호
export async function seoMessage(days = 28) {
  if (!hasGsc()) return '⚠️ Search Console 미연동입니다.';
  days = Math.min(Math.max(days, 7), 90);
  const end = gscDay(3);
  const start = gscDay(3 + days - 1);

  const lines = [`🩺 <b>SEO 기회 진단</b> — 최근 ${days}일 (${start} ~ ${end})`];

  for (const b of gscBlogs()) {
    try {
      const s = await gscSummary(b.gscSite, start, end, 50);
      lines.push('', `<b>${escapeHtml(shortLabel(b))}</b>`);
      if (!s.impressions) {
        lines.push('  노출 데이터 없음');
        continue;
      }

      // 1) 노출 대비 클릭이 바닥인 글
      const lowCtr = s.pages
        .filter((p) => p.impressions >= 20 && p.clicks / p.impressions < 0.02)
        .slice(0, 3);
      if (lowCtr.length) {
        lines.push('📉 <b>CTR 개선 대상</b> (노출은 있는데 클릭이 안 됨 → 제목·설명 손보기)');
        lowCtr.forEach((p) =>
          lines.push(
            `· ${escapeHtml(cut(p.key.replace(/^https?:\/\/[^/]+\/blog\//, ''), 32))}`,
            `    노출 ${fmt(p.impressions)} · 클릭 ${fmt(p.clicks)} · ${pos(p.position)}위`
          )
        );
      }

      // 2) 8~20위 = 조금만 보강하면 1페이지
      const striking = s.queries
        .filter((q) => q.position >= 8 && q.position <= 20 && q.impressions >= 5)
        .sort((a, b2) => b2.impressions - a.impressions)
        .slice(0, 4);
      if (striking.length) {
        lines.push('🎯 <b>문턱 앞 검색어</b> (8~20위 → 보강하면 1페이지)');
        striking.forEach((q) =>
          lines.push(`· ${escapeHtml(cut(q.key, 26))} — ${pos(q.position)}위 · 노출 ${fmt(q.impressions)}`)
        );
      }

      // 3) 노출은 있는데 클릭 0 = 그 주제 전용 글이 없다는 신호
      const gaps = s.queries
        .filter((q) => q.clicks === 0 && q.impressions >= 8)
        .sort((a, b2) => b2.impressions - a.impressions)
        .slice(0, 4);
      if (gaps.length) {
        lines.push('🆕 <b>미공략 검색어</b> (노출만 있고 클릭 0 → 전용 글 없음)');
        gaps.forEach((q) =>
          lines.push(`· ${escapeHtml(cut(q.key, 26))} — 노출 ${fmt(q.impressions)} · ${pos(q.position)}위`)
        );
      }

      if (!lowCtr.length && !striking.length && !gaps.length) {
        lines.push('  <i>표본이 부족합니다 (노출이 더 쌓여야 진단 가능)</i>');
      }
    } catch (e) {
      lines.push('', `<b>${escapeHtml(shortLabel(b))}</b>`, `⚠️ ${escapeHtml(e.message)}`);
    }
  }
  lines.push('', '<i>미공략 검색어는</i> <code>/generate</code> <i>로 바로 글을 쓸 수 있습니다.</i>');
  return lines.join('\n');
}

// 일일 리포트용 요약 (최근 7일 vs 그 이전 7일 비교 + 상위 검색어)
//
// 뭉게는 노출 0 이어도 반드시 한 줄 낸다 — 이관 직후엔 "0" 자체가 핵심 신호(구글이 아직 새
// 도메인을 모른다)인데, 활동 없는 사이트처럼 건너뛰면 리포트에서 그 사실이 사라진다.
// 레거시(TF·LF·VIP)는 잔존 노출이 있을 때만 한 줄로 접는다.
export async function gscReportLines() {
  if (!hasGsc()) return [];
  const end = gscDay(3);
  const start = gscDay(9);           // 최근 7일
  const prevEnd = gscDay(10);
  const prevStart = gscDay(16);      // 직전 7일

  const main = [];
  const legacy = [];
  for (const b of gscBlogs()) {
    const isMg = b.key === 'mg';
    try {
      const [cur, prev] = await Promise.all([
        gscSummary(b.gscSite, start, end, isMg ? 5 : 3),
        gscSummary(b.gscSite, prevStart, prevEnd, 0).catch(() => null),
      ]);
      if (!isMg && !cur.impressions && !cur.clicks) continue;
      const d = prev && prev.clicks
        ? ` (직전 7일 대비 ${cur.clicks >= prev.clicks ? '▲' : '▼'}${Math.abs(
            Math.round(((cur.clicks - prev.clicks) / prev.clicks) * 100)
          )}%)`
        : '';
      const head = `클릭 ${fmt(cur.clicks)}${d} · 노출 ${fmt(cur.impressions)} · CTR ${pct(
        cur.ctr
      )} · 평균순위 ${pos(cur.position)}`;

      if (!isMg) {
        legacy.push(`  <i>${escapeHtml(shortLabel(b))} — 클릭 ${fmt(cur.clicks)} · 노출 ${fmt(cur.impressions)}</i>`);
        continue;
      }
      main.push(head);
      if (cur.impressions || cur.clicks) {
        cur.queries.slice(0, 5).forEach((q) =>
          main.push(`  🔑 ${escapeHtml(cut(q.key, 24))} — 클릭 ${fmt(q.clicks)} / 노출 ${fmt(q.impressions)} (${pos(q.position)}위)`)
        );
      } else {
        main.push('  <i>노출 0 — 구글이 아직 이 도메인을 검색결과에 안 올리고 있습니다</i>');
      }
    } catch (e) {
      if (isMg) main.push(`⚠️ ${escapeHtml(e.message)}`);
      /* 레거시는 연동 전이거나 권한 없으면 조용히 건너뜀 */
    }
  }
  if (!main.length && !legacy.length) return [];
  const out = ['', '<b>검색 유입 (최근 7일, Search Console)</b>', ...main];
  if (legacy.length) out.push('  <b>레거시</b>', ...legacy);
  return out;
}
