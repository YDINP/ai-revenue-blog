// Google Analytics 4 — 유입경로(세션 소스/매체·채널·랜딩페이지) 조회
//
// 왜 필요한가: mungge.com 은 WordPress 직접 운영이라 자체 트래커(analytics-ingest)가 없고,
// Site Kit 이 심은 GA4 태그로만 데이터가 쌓인다. GSC 는 "구글 검색" 유입만 보여주므로
// 네이버·직접·추천·소셜 유입은 GA4 를 읽어야 알 수 있다.
//
// 인증: GSC 와 같은 서비스 계정. 다만 GA4 는 속성별 권한이라 GA4 관리 > 속성 액세스 관리에서
// 서비스 계정 이메일을 '뷰어'로 추가해야 한다. GCP 프로젝트에서 아래 API 활성화도 필요:
//   - Google Analytics Data API   (analyticsdata.googleapis.com)
//   - Google Analytics Admin API  (analyticsadmin.googleapis.com, 속성 탐색용)

import { googleToken, hasGoogleSa, saEmail } from './_google-auth.js';

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export const hasGa4 = hasGoogleSa;
export { saEmail };

async function callGoogle(url, init = {}) {
  const token = await googleToken(SCOPE);
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = j.error || {};
    // SERVICE_DISABLED 는 "API 를 켜라"는 뜻이고 PERMISSION_DENIED 는 "속성에 계정을 추가하라"는
    // 뜻이다. 둘 다 403 이라 메시지를 그대로 흘려야 사용자가 어느 쪽인지 구분할 수 있다.
    throw new Error(`GA4 ${r.status} ${err.status || ''}: ${err.message || 'unknown'}`.trim());
  }
  return j;
}

// 서비스 계정이 접근 가능한 GA4 계정/속성 목록 — 속성 ID(숫자)를 몰라도 여기서 찾는다
export async function ga4Properties() {
  const j = await callGoogle('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200');
  const out = [];
  for (const a of j.accountSummaries || []) {
    for (const p of a.propertySummaries || []) {
      out.push({
        account: a.displayName,
        property: p.displayName,
        // 'properties/123456789' → '123456789'
        propertyId: String(p.property || '').split('/').pop(),
        propertyType: p.propertyType,
      });
    }
  }
  return out;
}

// GA4 Data API runReport 원본 호출
//   dimensions/metrics 는 문자열 배열, 응답은 평면 배열로 정규화해 돌려준다
export async function ga4Report(propertyId, { startDate, endDate, dimensions = [], metrics = [], limit = 1000, orderBys, keepEmptyRows = false }) {
  const j = await callGoogle(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: 'POST',
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        limit,
        keepEmptyRows,
        ...(orderBys ? { orderBys } : {}),
      }),
    }
  );
  const dimNames = (j.dimensionHeaders || []).map((h) => h.name);
  const metNames = (j.metricHeaders || []).map((h) => h.name);
  const rows = (j.rows || []).map((r) => {
    const o = {};
    dimNames.forEach((n, i) => (o[n] = r.dimensionValues?.[i]?.value ?? ''));
    metNames.forEach((n, i) => (o[n] = Number(r.metricValues?.[i]?.value ?? 0)));
    return o;
  });
  return { rows, rowCount: j.rowCount || rows.length, dimensions: dimNames, metrics: metNames };
}

// GA4 date 차원은 'YYYYMMDD' — Postgres date 로 넣으려면 하이픈을 넣어야 한다
export const ga4Date = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

// N일 전 날짜(YYYY-MM-DD). GA4 는 상대표기('7daysAgo')도 받지만 저장 키를 만들려면 절대날짜가 낫다.
export const ga4Day = (offsetDays) =>
  new Date(Date.now() - offsetDays * 86400000).toISOString().split('T')[0];

const MET = ['sessions', 'totalUsers', 'screenPageViews', 'engagedSessions'];

// 대시보드가 쓰는 리포트를 한 번에 — 일별 × (채널 / 소스·매체 / 랜딩페이지 / 기기 / 브라우저 / OS)
// GA4 는 하루 지연이 거의 없지만 당일은 계속 변하므로 소급 재집계를 전제로 upsert 한다.
// 기기·브라우저·OS 는 TF/LF 가 analytics 의 user_agent 로 만드는 항목과 짝을 맞추기 위한 것.
// 뭉게는 이벤트 단위 데이터가 없어 GA4 차원으로만 같은 화면을 채울 수 있다.
export async function ga4DailyBreakdown(propertyId, startDate, endDate, { pageLimit = 3000 } = {}) {
  const daily = (dim, limit) =>
    ga4Report(propertyId, { startDate, endDate, dimensions: dim ? ['date', dim] : ['date'], metrics: MET, limit });
  const [channel, sourceMedium, page, totals, device, browser, os] = await Promise.all([
    daily('sessionDefaultChannelGroup', 5000),
    daily('sessionSourceMedium', 5000),
    daily('landingPagePlusQueryString', pageLimit),
    daily(null, 400),
    daily('deviceCategory', 2000),
    daily('browser', 2000),
    daily('operatingSystem', 2000),
  ]);
  return { channel, sourceMedium, page, totals, device, browser, os };
}
