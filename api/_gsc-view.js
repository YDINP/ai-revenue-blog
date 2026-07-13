// GSC 조회 결과 → 텔레그램 메시지 (/gsc 명령, 일일 리포트 섹션)

import { blogList } from './_blogs.js';
import { gscDay, gscSummary, hasGsc } from './_gsc.js';
import { escapeHtml } from './_shared.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const cut = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n) + '…' : s);
const pct = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`;
const pos = (v) => Number(v || 0).toFixed(1);

const gscBlogs = () => blogList().filter((b) => b.gscSite);

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
        `<b>${escapeHtml(b.label.split(' (')[0])}</b>`,
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
      lines.push('', `<b>${escapeHtml(b.label.split(' (')[0])}</b>`, `⚠️ ${escapeHtml(e.message)}`);
    }
  }
  return lines.join('\n');
}

// 일일 리포트용 요약 (최근 7일 vs 그 이전 7일 비교 + 상위 검색어 3개)
export async function gscReportLines() {
  if (!hasGsc()) return [];
  const end = gscDay(3);
  const start = gscDay(9);           // 최근 7일
  const prevEnd = gscDay(10);
  const prevStart = gscDay(16);      // 직전 7일

  const out = [];
  for (const b of gscBlogs()) {
    try {
      const [cur, prev] = await Promise.all([
        gscSummary(b.gscSite, start, end, 3),
        gscSummary(b.gscSite, prevStart, prevEnd, 0).catch(() => null),
      ]);
      if (!cur.impressions && !cur.clicks) continue;
      const d = prev && prev.clicks
        ? ` (직전 7일 대비 ${cur.clicks >= prev.clicks ? '▲' : '▼'}${Math.abs(
            Math.round(((cur.clicks - prev.clicks) / prev.clicks) * 100)
          )}%)`
        : '';
      out.push(
        `<b>${escapeHtml(b.label.split(' (')[0])}</b> — 클릭 ${fmt(cur.clicks)}${d} · 노출 ${fmt(
          cur.impressions
        )} · CTR ${pct(cur.ctr)} · 평균순위 ${pos(cur.position)}`
      );
      cur.queries.slice(0, 3).forEach((q) =>
        out.push(`  🔑 ${escapeHtml(cut(q.key, 24))} — 클릭 ${fmt(q.clicks)} (${pos(q.position)}위)`)
      );
    } catch {
      /* 연동 전이거나 권한 없으면 조용히 건너뜀 */
    }
  }
  if (!out.length) return [];
  return ['', '<b>검색 유입 (최근 7일, Search Console)</b>', ...out];
}
