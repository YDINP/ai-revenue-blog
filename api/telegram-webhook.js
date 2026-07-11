// 텔레그램 봇 웹훅 — 알림 메시지에 답장하거나 /reply·/delete 명령으로 댓글 관리
// setWebhook 시 secret_token=WEBHOOK_SECRET 지정 필수 (SETUP-telegram-comment-bot.md)

import { escapeHtml, getComment, postUrl, supabaseRpc, tg } from './_shared.js';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const HELP = [
  '<b>블로그 댓글봇 사용법</b>',
  '',
  '• 새 댓글 알림 메시지에 <b>답장</b> → 그 댓글에 관리자 대댓글 등록',
  '• <code>/reply &lt;댓글ID&gt; &lt;내용&gt;</code> — ID 직접 지정 대댓글',
  '• <code>/delete &lt;댓글ID&gt;</code> — 댓글 삭제 (대댓글 포함)',
  '• <code>/id</code> — 현재 채팅 ID 확인',
  '',
  '댓글ID는 알림 메시지 하단 <code>#c_...</code> 값입니다.',
].join('\n');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const msg = req.body?.message;
  const text = msg?.text?.trim();
  // 텔레그램은 200 외 응답을 재전송하므로, 처리 불가 업데이트도 200으로 종료
  if (!msg || !text) return res.status(200).json({ ok: true });

  const chatId = String(msg.chat.id);
  const reply = (html) =>
    tg('sendMessage', {
      chat_id: chatId,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_to_message_id: msg.message_id,
    });

  // /id, /start 는 채팅 ID 확인용 — 인증 전에도 허용 (최초 설정에 필요)
  if (text === '/id' || text === '/start') {
    await reply(`이 채팅의 ID: <code>${chatId}</code>\nVercel 환경변수 <code>TELEGRAM_ADMIN_CHAT_ID</code>에 설정하세요.`);
    return res.status(200).json({ ok: true });
  }

  const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChat || chatId !== String(adminChat)) {
    await reply('⛔ 관리자 전용 봇입니다.');
    return res.status(200).json({ ok: true });
  }

  if (text === '/help') {
    await reply(HELP);
    return res.status(200).json({ ok: true });
  }

  try {
    // 1) /delete <uuid>
    const del = text.match(/^\/delete(?:@\w+)?\s+(\S+)/i);
    if (del) {
      const id = (del[1].match(UUID_RE) || [])[0];
      if (!id) return await fail(reply, res, '댓글ID(UUID)를 인식하지 못했습니다.');
      const { data } = await supabaseRpc('admin_delete_comment', {
        p_id: id,
        p_admin_key: requireAdminKey(),
      });
      if (data?.success) await reply(`🗑 삭제 완료 (${data.deleted ?? 1}개)`);
      else await reply(`❌ 삭제 실패: ${escapeHtml(JSON.stringify(data))}`);
      return res.status(200).json({ ok: true });
    }

    // 2) 대댓글 대상/내용 결정: /reply <uuid> <내용> 또는 알림 메시지에 답장
    let targetId = null;
    let content = null;

    const rep = text.match(/^\/reply(?:@\w+)?\s+(\S+)\s+([\s\S]+)/i);
    if (rep) {
      targetId = (rep[1].match(UUID_RE) || [])[0];
      content = rep[2].trim();
    } else if (msg.reply_to_message?.text) {
      targetId = (msg.reply_to_message.text.match(/#c_([0-9a-f-]{36})/i) || [])[1];
      content = text;
    }

    if (!targetId || !content) {
      await reply(HELP);
      return res.status(200).json({ ok: true });
    }

    // 대상 댓글 조회 → slug/source 확보 (admin_reply 필수 파라미터)
    const comment = await getComment(targetId);
    if (!comment) {
      return await fail(reply, res, `댓글을 찾을 수 없습니다 (삭제됨?): <code>${targetId}</code>`);
    }

    const { data } = await supabaseRpc('admin_reply', {
      p_parent_id: comment.id,
      p_slug: comment.post_slug,
      p_source: comment.source,
      p_content: content,
      p_admin_key: requireAdminKey(),
    });

    if (data?.success) {
      const url = postUrl(comment.source, comment.post_slug);
      await reply(
        `✅ <b>${escapeHtml(comment.nickname)}</b>님 댓글에 대댓글 등록 완료` +
          (url ? `\n📄 <a href="${url}#comments">글에서 확인</a>` : '')
      );
    } else {
      await reply(`❌ 등록 실패: ${escapeHtml(JSON.stringify(data))}`);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('telegram-webhook error:', e);
    await reply(`❌ 오류: ${escapeHtml(e.message)}`).catch(() => {});
    return res.status(200).json({ ok: false });
  }
}

function requireAdminKey() {
  const key = process.env.COMMENT_ADMIN_KEY;
  if (!key) throw new Error('COMMENT_ADMIN_KEY not set');
  return key;
}

async function fail(reply, res, html) {
  await reply(`❌ ${html}`);
  return res.status(200).json({ ok: true });
}
