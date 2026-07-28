// GA4 유입경로 → Supabase ga4_daily 저장(upsert)
// 스케줄: daily-report.js 가 매일 best-effort 호출. 수동 백필: /api/gsc-sync?ga4=sync&days=90&secret=
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_shared.js';
import { blogList } from './_blogs.js';
import { ga4DailyBreakdown, ga4Date, ga4Day, hasGa4 } from './_ga4.js';

async function upsert(rows) {
  if (!rows.length) return 0;
  // 한 번에 너무 크게 보내면 Supabase 가 413 을 낸다 — 페이지 차원은 행이 쉽게 수천 개가 된다
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ga4_daily?on_conflict=date,source,dim,key`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows.slice(i, i + CHUNK)),
    });
    if (!r.ok) throw new Error(`ga4_daily upsert ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  return rows.length;
}

// upsert 페이로드에 updated_at 을 직접 넣는다. 컬럼 기본값 now() 는 INSERT 에만 걸리고
// on conflict UPDATE 에는 안 걸려서, 넣지 않으면 재동기화를 해도 값이 최초 삽입 시각에 멈춘다
// → 대시보드가 "이 수치가 언제 것인지" 표시할 근거를 잃는다.
const stamp = () => new Date().toISOString();

const toRow = (src, dim, dimName) => (r) => ({
  date: ga4Date(r.date),
  source: src,
  dim,
  key: r[dimName] || '(not set)',
  sessions: r.sessions,
  users: r.totalUsers,
  views: r.screenPageViews,
  engaged: r.engagedSessions,
  updated_at: stamp(),
});

export async function syncGa4({ days = 7 } = {}) {
  if (!hasGa4()) return { skipped: 'no-google-sa-env' };
  // GA4 는 당일 데이터도 들어오지만 몇 시간에 걸쳐 계속 갱신된다 → 오늘 포함해 소급 재집계
  const end = ga4Day(0);
  const start = ga4Day(Math.max(1, days) - 1);
  const out = { start, end };

  for (const b of blogList().filter((x) => x.ga4Property)) {
    const src = b.key;
    try {
      const { channel, sourceMedium, page, totals, device, browser, os, pageSource, pageAll } = await ga4DailyBreakdown(b.ga4Property, start, end);
      const rows = [
        ...totals.rows.map((r) => ({
          date: ga4Date(r.date),
          source: src,
          dim: 'total',
          key: '_TOTAL_',
          sessions: r.sessions,
          users: r.totalUsers,
          views: r.screenPageViews,
          engaged: r.engagedSessions,
          updated_at: stamp(),
        })),
        ...channel.rows.map(toRow(src, 'channel', 'sessionDefaultChannelGroup')),
        ...sourceMedium.rows.map(toRow(src, 'source_medium', 'sessionSourceMedium')),
        ...page.rows.map(toRow(src, 'page', 'landingPagePlusQueryString')),
        // dim='page'(랜딩)와 짝. 랜딩은 "어디로 들어왔나", page_all 은 "어디가 열렸나".
        // 홈 랜딩 세션수 대비 홈 조회수가 크면 홈을 거쳐 다른 글로 이동한 사람이 있다는 뜻이다.
        ...pageAll.rows.map(toRow(src, 'page_all', 'pagePath')),
        ...device.rows.map(toRow(src, 'device', 'deviceCategory')),
        ...browser.rows.map(toRow(src, 'browser', 'browser')),
        ...os.rows.map(toRow(src, 'os', 'operatingSystem')),
        // dim='page_source' 의 key 는 "<랜딩경로>\t<소스/매체>". 탭은 GA4 값에 나올 수 없어
        // 구분자로 안전하고, 대시보드는 split('\t') 한 번으로 양쪽을 얻는다.
        ...pageSource.rows.map((r) => ({
          date: ga4Date(r.date),
          source: src,
          dim: 'page_source',
          key: `${r.landingPagePlusQueryString || '(not set)'}\t${r.sessionSourceMedium || '(not set)'}`,
          sessions: r.sessions,
          users: r.totalUsers,
          views: r.screenPageViews,
          engaged: r.engagedSessions,
          updated_at: stamp(),
        })),
      ];
      out[src] = await upsert(rows);
    } catch (e) {
      out[src] = `error: ${e.message}`;
    }
  }
  if (Object.keys(out).length === 2) out.skipped = 'no-ga4-property-configured';
  return out;
}
