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
  const r = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(`GSC ${r.status}: ${j.error?.message || 'unknown'}`);
  return j.rows || [];
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

export { sum };
