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
  // migrationOnly(구 도메인 TF)는 GSC 조회 통로만 필요하고 gsc_daily 에는 넣지 않는다 —
  // 넣으면 대시보드가 죽은 사이트를 다시 1급 지표로 세운다(07-30에 엔트리를 지운 이유).
  for (const b of blogList().filter((x) => x.gscSite && !x.migrationOnly)) {
    // WordPress 직접 운영 블로그(mungge)는 레지스트리 source 가 null 이다 — 일일리포트·뉴스레터·
    // 자동포스팅에서 빠지려면 null 이어야 하지만, gsc_daily.source 는 NOT NULL 이라 그대로 넣으면
    // 매번 23502 로 저장이 통째로 실패한다. 저장용 키만 blog key 로 폴백한다.
    const src = b.source || b.key;
    try {
      const [pages, totals] = await Promise.all([
        gscDatePageRows(b.gscSite, start, end),
        gscDateTotals(b.gscSite, start, end),
      ]);
      const rows = [
        ...pages.map((p) => ({
          date: p.date,
          source: src,
          page: pathOf(p.page),
          clicks: p.clicks,
          impressions: p.impressions,
          ctr: p.ctr,
          position: p.position,
        })),
        ...totals.map((t) => ({
          date: t.date,
          source: src,
          page: '_TOTAL_',
          clicks: t.clicks,
          impressions: t.impressions,
          ctr: t.ctr,
          position: t.position,
        })),
      ];
      out[src] = await upsert(rows);
    } catch (e) {
      out[src] = `error: ${e.message}`;
    }
  }
  return out;
}
