// 텔레그램 봇 웹훅 — 대시보드 조회 / 댓글 관리 / 블로그 제어(글·배포)
// setWebhook 시 secret_token=WEBHOOK_SECRET 지정 필수 (SETUP-telegram-comment-bot.md)

import { escapeHtml, getComment, postUrl, supabaseRpc, tg } from './_shared.js';
import {
  commentStatsMessage,
  commentsMessages,
  coupangMessage,
  likesMessage,
  recentMessage,
  sourceMessage,
  statsMessage,
  topPagesMessage,
  trendMessage,
} from './_dashboard.js';
import {
  blogsMessage,
  deleteRequestMessage,
  deployMessage,
  editStart,
  generateMessage,
  generateStart,
  handleFlow,
  handleGenerateCallback,
  newPostStart,
  postsMessage,
  statusMessage,
  toggleDraftMessage,
} from './_control.js';
import { reportMessage } from './_report.js';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const HELP = [
  '<b>블로그 운영 봇</b>',
  '',
  '<b>📊 대시보드 조회 (실시간)</b>',
  '• /stats — 전체 요약 (조회·클릭·좋아요·구독·댓글)',
  '• /report [YYYY-MM-DD] — 일일 종합 리포트 (기본 어제, 매일 09시 자동 발송)',
  '• /tf · /lf — TechFlow / LifeFlow 소스별 요약',
  '• /coupang — 쿠팡 클릭 상세 (어떤 글→어떤 링크)',
  '• /top [n] · /trend · /likes · /recent [n]',
  '',
  '<b>💬 댓글 관리</b>',
  '• /comments [n] — 최근 댓글 (각 메시지에 답장=대댓글)',
  '• /cstats — 댓글 통계 + 7일 트렌드',
  '• 새 댓글 알림에 <b>답장</b> → 관리자 대댓글 등록',
  '• <code>/reply &lt;댓글ID&gt; &lt;내용&gt;</code> · <code>/delete &lt;댓글ID&gt;</code>',
  '',
  '<b>📝 블로그 제어</b> (블로그: <code>tf</code>/<code>lf</code>/<code>pc</code>)',
  '• /blogs — 제어 가능한 블로그 목록',
  '• <code>/posts &lt;블로그&gt; [n]</code> — 최근 글 (발행✅/숨김🚫)',
  '• <code>/publish &lt;블로그&gt; &lt;slug&gt;</code> · <code>/draft &lt;블로그&gt; &lt;slug&gt;</code> — 발행/숨김',
  '• <code>/newpost &lt;블로그&gt;</code> — 새 글 작성 (제목→본문)',
  '• <code>/edit &lt;블로그&gt; &lt;slug&gt;</code> — 본문 교체',
  '• <code>/delpost &lt;블로그&gt; &lt;slug&gt;</code> — 글 삭제 (확인 필요)',
  '• /generate — AI 자동 포스팅 (블로그 선택 → 🔥핫 키워드 / ✍️직접 입력 / 🎲자동)',
  '   <code>/generate tf AI 주제</code> 처럼 인자를 주면 바로 실행',
  '• <code>/deploy &lt;블로그&gt;</code> · <code>/status [블로그]</code>',
  '• /cancel — 진행 중인 작성/수정 취소',
].join('\n');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // ── 인라인 버튼(callback_query) — /generate 대화형 플로우 ──
  const cb = req.body?.callback_query;
  if (cb) {
    const cbChat = String(cb.message?.chat?.id || '');
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminChatId || cbChat !== String(adminChatId)) {
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: '관리자 전용' });
      return res.status(200).json({ ok: true });
    }
    // 로딩 스피너 즉시 해제 (텔레그램은 응답 없으면 버튼이 계속 도는 것처럼 보임)
    await tg('answerCallbackQuery', { callback_query_id: cb.id });
    try {
      const out = await handleGenerateCallback(cbChat, cb.data || '');
      await tg('editMessageText', {
        chat_id: cbChat,
        message_id: cb.message.message_id,
        text: out.text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(out.reply_markup ? { reply_markup: out.reply_markup } : {}),
      });
    } catch (e) {
      console.error('callback error:', e);
      await tg('sendMessage', {
        chat_id: cbChat,
        text: `❌ ${escapeHtml(e.message)}`,
        parse_mode: 'HTML',
      });
    }
    return res.status(200).json({ ok: true });
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
    // ── 블로그 제어 명령 (인자 있는 명령을 먼저 매칭) ──
    const ctl = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]+))?$/);
    if (ctl) {
      const cmd = ctl[1].toLowerCase();
      const rest = (ctl[2] || '').trim();
      const [a1, a2, ...more] = rest.split(/\s+/).filter(Boolean);
      const a3 = more.join(' ');

      const CONTROL = {
        blogs: () => blogsMessage(),
        posts: () => postsMessage(a1, a2 ? parseInt(a2, 10) : 10),
        publish: () => toggleDraftMessage(a1, a2, false),
        draft: () => toggleDraftMessage(a1, a2, true),
        newpost: () => newPostStart(chatId, a1),
        edit: () => editStart(chatId, a1, a2),
        delpost: () => deleteRequestMessage(chatId, a1, a2),
        // 인자 없이 /generate → 버튼 플로우, 인자 주면 즉시 실행
        generate: () => (a1 ? generateMessage(a1, a2, a3) : null),
        deploy: () => deployMessage(a1),
        status: () => statusMessage(a1),
        report: () => reportMessage(/^\d{4}-\d{2}-\d{2}$/.test(a1 || '') ? a1 : undefined),
      };
      if (CONTROL[cmd]) {
        const out = await CONTROL[cmd]();
        if (out === null && cmd === 'generate') {
          const start = generateStart();
          await tg('sendMessage', {
            chat_id: chatId,
            text: start.text,
            parse_mode: 'HTML',
            reply_markup: start.reply_markup,
          });
        } else {
          await reply(out);
        }
        return res.status(200).json({ ok: true });
      }
      if (cmd === 'cancel') {
        await reply((await handleFlow(chatId, '/cancel')) || '진행 중인 작업이 없습니다.');
        return res.status(200).json({ ok: true });
      }
    }

    // ── 진행 중인 다단계 흐름 (새 글 본문 입력, 본문 수정, 삭제 확인) ──
    // 댓글 알림에 답장한 경우는 대댓글 경로가 우선하므로 제외
    const isCommentReply = /#c_[0-9a-f-]{36}/i.test(msg.reply_to_message?.text || '');
    if (!text.startsWith('/') && !isCommentReply) {
      const flowed = await handleFlow(chatId, text);
      if (flowed) {
        await reply(flowed);
        return res.status(200).json({ ok: true });
      }
    }

    // ── 대시보드 실시간 조회 명령 ──
    const cmdMatch = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(\d{1,3}))?$/);
    if (cmdMatch) {
      const cmd = cmdMatch[1].toLowerCase();
      const num = cmdMatch[2] ? parseInt(cmdMatch[2], 10) : undefined;
      const VIEWS = {
        stats: () => statsMessage(),
        tf: () => sourceMessage('blog'),
        lf: () => sourceMessage('lifeflow'),
        top: () => topPagesMessage(num ?? 10),
        trend: () => trendMessage(),
        cstats: () => commentStatsMessage(),
        coupang: () => coupangMessage(),
        likes: () => likesMessage(num ?? 10),
        recent: () => recentMessage(num ?? 10),
      };
      if (VIEWS[cmd]) {
        await reply(await VIEWS[cmd]());
        return res.status(200).json({ ok: true });
      }
      if (cmd === 'comments') {
        // 댓글마다 개별 메시지로 전송 → 각 메시지에 답장하면 그 댓글에 대댓글
        const msgs = await commentsMessages(num ?? 5);
        for (const m of msgs) {
          await tg('sendMessage', { chat_id: chatId, text: m, parse_mode: 'HTML', disable_web_page_preview: true });
        }
        return res.status(200).json({ ok: true });
      }
    }

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
