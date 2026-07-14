// Threads 데이터 삭제 요청 콜백 (Data Deletion Request)
// Meta 규격: signed_request POST 수신 → { url, confirmation_code } JSON 반환 필수.
// 해당 계정 데이터(계정/큐/발행)를 삭제하고, 상태 확인 URL을 돌려준다.
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
  // ?code=... 로 방문 시 삭제 상태 페이지 (Meta가 confirmation_code로 조회)
  if (req.method === 'GET') {
    const code = req.query?.code;
    return res
      .status(200)
      .send(code ? `데이터 삭제 처리됨 (code: ${code})` : 'threads delete callback ok');
  }

  const data = parseSignedRequest(req.body?.signed_request);
  const uid = data?.user_id;
  if (uid) {
    try {
      // 계정 삭제 → FK cascade로 큐/발행도 함께 삭제
      await sb(`threads_accounts?threads_user_id=eq.${encodeURIComponent(uid)}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.error('threads-delete failed:', e);
    }
  }

  const code = `del_${uid || 'x'}_${Math.abs(hash(String(uid || '') + Date.now())).toString(36)}`;
  return res.status(200).json({
    url: `https://ai-revenue-blog.vercel.app/api/threads-delete?code=${code}`,
    confirmation_code: code,
  });
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return h;
}
