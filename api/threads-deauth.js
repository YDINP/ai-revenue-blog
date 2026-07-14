// Threads 제거(Uninstall/Deauthorize) 콜백
// 유저가 앱 연결을 해제하면 Meta가 signed_request POST를 보냄 → 해당 계정 비활성화.
import { sb } from './_threads.js';

function parseSignedRequest(signed) {
  if (!signed || typeof signed !== 'string' || !signed.includes('.')) return null;
  try {
    return JSON.parse(Buffer.from(signed.split('.')[1], 'base64url').toString());
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // 폼 저장 시 Meta의 URL 검증(GET) 대응
  if (req.method === 'GET') return res.status(200).send('threads deauth callback ok');

  const data = parseSignedRequest(req.body?.signed_request);
  const uid = data?.user_id;
  if (uid) {
    try {
      await sb(`threads_accounts?threads_user_id=eq.${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        body: { active: false },
      });
    } catch (e) {
      console.error('threads-deauth deactivate failed:', e);
    }
  }
  return res.status(200).json({ ok: true });
}
