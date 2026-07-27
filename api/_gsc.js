// Google Search Console — 검색어/노출/클릭/CTR/평균순위
//
// 인증: 서비스 계정(JWT → OAuth2 access token). 외부 라이브러리 없이 crypto 로 서명한다.
// 필요한 환경변수:
//   GOOGLE_SA_EMAIL       서비스 계정 이메일 (…@….iam.gserviceaccount.com)
//   GOOGLE_SA_PRIVATE_KEY 서비스 계정 개인키 (PEM, 줄바꿈은 \n 이스케이프 그대로 넣어도 됨)
// 서비스 계정 이메일을 각 사이트의 Search Console 사용자로 추가해야 조회된다.

import crypto from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export function hasGsc() {
  return !!(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY);
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cachedToken = null;   // 함수 인스턴스가 살아있는 동안 재사용 (만료 1분 전까지)

async function accessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;

  const email = process.env.GOOGLE_SA_EMAIL;
  const key = String(process.env.GOOGLE_SA_PRIVATE_KEY).replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(key));

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`GSC 인증 실패: ${j.error_description || j.error || r.status}`);
  cachedToken = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

// site: 'https://ai-revenue-blog.vercel.app/' (URL 프리픽스 속성)
async function query(site, body) {
  const token = await accessToken();
  const call = async (s) => {
    const r = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(s)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    return { ok: r.ok, status: r.status, json: await r.json() };
  };

  let res = await call(site);
  const tried = [site];

  // 같은 사이트라도 GSC 속성이 URL 프리픽스가 아니라 도메인 속성(sc-domain:)으로만
  // 등록돼 있는 경우가 흔하다. 그러면 403/404가 나고 조용히 0으로 보이므로 1회 폴백한다.
  if (!res.ok && (res.status === 403 || res.status === 404) && /^https?:\/\//.test(site)) {
    const alt = `sc-domain:${new URL(site).hostname}`;
    tried.push(alt);
    try {
      res = await call(alt);
    } catch (_) { /* 폴백 실패 시 아래에서 원래 오류를 던진다 */ }
  }

  if (!res.ok) {
    // 폴백을 타면 오류 메시지에 sc-domain만 남아 "어느 속성을 설정했는지"가 가려진다.
    // 서비스계정을 어느 속성에 추가해야 하는지 바로 알 수 있게 시도한 형식을 모두 적는다.
    throw new Error(`GSC ${res.status}: ${res.json.error?.message || 'unknown'} (시도한 속성: ${tried.join(' , ')})`);
  }
  return res.json.rows || [];
}

const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);

// 특정 기간의 총계 + 상위 검색어/페이지
// ⚠️ GSC 데이터는 2~3일 지연된다 → 어제 데이터는 대개 비어 있고, 3일 전까지가 안전
export async function gscSummary(site, startDate, endDate, limit = 5) {
  const [totals, queries, pages] = await Promise.all([
    query(site, { startDate, endDate, dimensions: [], type: 'web' }),
    query(site, { startDate, endDate, dimensions: ['query'], rowLimit: limit, type: 'web' }),
    query(site, { startDate, endDate, dimensions: ['page'], rowLimit: limit, type: 'web' }),
  ]);
  const t = totals[0] || {};
  return {
    clicks: t.clicks || 0,
    impressions: t.impressions || 0,
    ctr: t.ctr || 0,
    position: t.position || 0,
    queries: queries.map((r) => ({
      key: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    })),
    // GSC 는 같은 글의 앵커 URL(#heading-1)을 별도 페이지로 집계한다. 이걸 그대로 두면
    // "노출은 있는데 클릭 0" 으로 잡혀 멀쩡한 글이 CTR 개선 대상으로 오진된다 → 본문 URL로 합산
    pages: Object.values(
      pages.reduce((acc, r) => {
        const url = r.keys[0].split('#')[0];
        const a = (acc[url] ||= { key: url, clicks: 0, impressions: 0, _pos: 0 });
        a.clicks += r.clicks;
        a.impressions += r.impressions;
        a._pos += (r.position || 0) * (r.impressions || 0);
        return acc;
      }, {})
    )
      .map((p) => ({ ...p, position: p.impressions ? p._pos / p.impressions : 0 }))
      .sort((a, b) => b.impressions - a.impressions),
  };
}

// 날짜 유틸 — GSC 는 UTC 기준 날짜 문자열(YYYY-MM-DD)
export function gscDay(offsetDays) {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().split('T')[0];
}

// [date × page] 행 — Supabase 저장용. 앵커 URL(#heading)은 본문 URL로 합산.
export async function gscDatePageRows(site, startDate, endDate, rowLimit = 5000) {
  const rows = await query(site, {
    startDate,
    endDate,
    dimensions: ['date', 'page'],
    rowLimit,
    type: 'web',
  });
  const acc = {};
  for (const r of rows) {
    const date = r.keys[0];
    const page = r.keys[1].split('#')[0];
    const k = `${date}|${page}`;
    const a = (acc[k] ||= { date, page, clicks: 0, impressions: 0, _pos: 0 });
    a.clicks += r.clicks || 0;
    a.impressions += r.impressions || 0;
    a._pos += (r.position || 0) * (r.impressions || 0);
  }
  return Object.values(acc).map((a) => ({
    date: a.date,
    page: a.page,
    clicks: a.clicks,
    impressions: a.impressions,
    ctr: a.impressions ? a.clicks / a.impressions : 0,
    position: a.impressions ? a._pos / a.impressions : 0,
  }));
}

// [date] 사이트 일별 합계
export async function gscDateTotals(site, startDate, endDate) {
  const rows = await query(site, { startDate, endDate, dimensions: ['date'], type: 'web' });
  return rows.map((r) => ({
    date: r.keys[0],
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0,
  }));
}

export { sum };
