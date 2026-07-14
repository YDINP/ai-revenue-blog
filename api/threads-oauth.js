// Threads OAuth — 계정 연결용 1회 클릭 엔드포인트
//  ?connect=1&topic=life&persona=...  → Threads 인가 화면으로 redirect
//  ?code=...&state=...                → 콜백: 코드→장기토큰→threads_accounts 저장
// redirect_uri(THREADS_REDIRECT_URI)는 이 엔드포인트 URL과 정확히 일치해야 함.

import { codeToShortToken, exchangeLongLived, insertAccount, updateAccount, getAccountByTopic } from './_threads.js';
import { sendToAdmin } from './_shared.js';

const SCOPES = 'threads_basic,threads_content_publish,threads_manage_insights';

export default async function handler(req, res) {
  const { connect, topic, persona, code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`Threads 인가 거부: ${error_description || error}`);
  }

  // 1) 연결 시작 → Threads 인가 화면으로
  if (connect) {
    if (!process.env.THREADS_APP_ID || !process.env.THREADS_REDIRECT_URI) {
      return res.status(500).send('THREADS_APP_ID / THREADS_REDIRECT_URI 미설정');
    }
    // state에 topic/persona 실어보냄 (콜백에서 복원). 실무는 서명 권장이나 관리자 단독 사용.
    const st = Buffer.from(JSON.stringify({ topic: topic || 'life', persona: persona || '' })).toString('base64url');
    const auth = new URL('https://threads.net/oauth/authorize');
    auth.searchParams.set('client_id', process.env.THREADS_APP_ID);
    auth.searchParams.set('redirect_uri', process.env.THREADS_REDIRECT_URI);
    auth.searchParams.set('scope', SCOPES);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('state', st);
    res.writeHead(302, { Location: auth.toString() });
    return res.end();
  }

  // 2) 콜백 — code → 장기 토큰 → 저장
  if (code) {
    try {
      let meta = { topic: 'life', persona: '' };
      if (state) {
        try { meta = JSON.parse(Buffer.from(String(state), 'base64url').toString()); } catch {}
      }
      const short = await codeToShortToken(String(code)); // { access_token, user_id }
      const long = await exchangeLongLived(short.access_token); // { access_token, expires_in }
      const expiresAt = new Date(Date.now() + (long.expires_in || 5184000) * 1000).toISOString();

      const existing = await getAccountByTopic(meta.topic);
      const row = {
        topic: meta.topic,
        persona: meta.persona || null,
        threads_user_id: String(short.user_id),
        access_token: long.access_token,
        token_expires_at: expiresAt,
        active: true,
      };
      const saved = existing
        ? await updateAccount(existing.id, row)
        : await insertAccount(row);

      await sendToAdmin(
        `✅ Threads 계정 연결 완료\n• topic: <b>${meta.topic}</b>\n• user_id: <code>${short.user_id}</code>\n• 토큰 만료: ${expiresAt.slice(0, 10)}`
      ).catch(() => {});

      return res
        .status(200)
        .send(`<h2>✅ 연결 완료</h2><p>topic: ${meta.topic} / user_id: ${short.user_id}</p><p>텔레그램에서 <code>/threads</code> 로 확인하세요. 이 창은 닫아도 됩니다.</p>`);
    } catch (e) {
      console.error('threads-oauth callback error:', e);
      return res.status(500).send(`연결 실패: ${e.message}`);
    }
  }

  return res.status(400).send('사용법: ?connect=1&topic=life&persona=... (연결 시작)');
}
