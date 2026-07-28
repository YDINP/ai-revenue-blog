// 구글 서비스 계정 인증 (JWT → OAuth2 access token) — GSC·GA4 공용
//
// 필요한 환경변수:
//   GOOGLE_SA_EMAIL       서비스 계정 이메일 (…@….iam.gserviceaccount.com)
//   GOOGLE_SA_PRIVATE_KEY 서비스 계정 개인키 (PEM, 줄바꿈은 \n 이스케이프 그대로 넣어도 됨)
//
// 스코프마다 토큰이 다르므로 캐시는 스코프별로 나눠 둔다. GSC(webmasters.readonly)와
// GA4(analytics.readonly)를 한 토큰에 합치지 않는 이유: 한쪽 API가 GCP에서 비활성이면
// 토큰 발급 자체는 되지만 실패 원인이 섞여 진단이 어려워진다.

import crypto from 'node:crypto';

export function hasGoogleSa() {
  return !!(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY);
}

export const saEmail = () => process.env.GOOGLE_SA_EMAIL || null;

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const cache = new Map();   // scope → { token, exp } (함수 인스턴스가 살아있는 동안 재사용)

export async function googleToken(scope) {
  const hit = cache.get(scope);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const email = process.env.GOOGLE_SA_EMAIL;
  const key = String(process.env.GOOGLE_SA_PRIVATE_KEY).replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope,
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
  if (!r.ok) throw new Error(`구글 인증 실패: ${j.error_description || j.error || r.status}`);
  cache.set(scope, { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
  return j.access_token;
}
