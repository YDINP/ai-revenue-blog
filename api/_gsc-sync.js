// GSC 검색 실적 → Supabase gsc_daily 저장(upsert)
// 스케줄: daily-report.js 가 매일 best-effort 호출. 수동 백필: /api/gsc-sync?days=30&secret=
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_shared.js';
import { blogList } from './_blogs.js';
import { hasGsc, gscDay, gscDatePageRows, gscDateTotals } from './_gsc.js';

const pathOf = (url) => (url || '').replace(/^https?:\/\/[^/]+/, '') || '/';

async function upsert(rows) {
  if (!rows.length) return 0;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/gsc_daily?on_conflict=date,source,page`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`gsc_daily upsert ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return rows.length;
}

// GSC 는 2~3일 지연 → 종료일을 2일 전으로, days 만큼 소급해 재집계(후행 보정 포함)
export async function syncGsc({ days = 5 } = {}) {
  if (!hasGsc()) return { skipped: 'no-gsc-env' };
  const end = gscDay(2);
  const start = gscDay(2 + Math.max(1, days) - 1);
  const out = { start, end };
  for (const b of blogList().filter((x) => x.gscSite)) {
    try {
      const [pages, totals] = await Promise.all([
        gscDatePageRows(b.gscSite, start, end),
        gscDateTotals(b.gscSite, start, end),
      ]);
      const rows = [
        ...pages.map((p) => ({
          date: p.date,
          source: b.source,
          page: pathOf(p.page),
          clicks: p.clicks,
          impressions: p.impressions,
          ctr: p.ctr,
          position: p.position,
        })),
        ...totals.map((t) => ({
          date: t.date,
          source: b.source,
          page: '_TOTAL_',
          clicks: t.clicks,
          impressions: t.impressions,
          ctr: t.ctr,
          position: t.position,
        })),
      ];
      out[b.source] = await upsert(rows);
    } catch (e) {
      out[b.source] = `error: ${e.message}`;
    }
  }
  return out;
}
