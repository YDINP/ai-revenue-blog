// 텔레그램 봇 웹훅 — 대시보드 조회 / 댓글 관리 / 블로그 제어(글·배포)
// setWebhook 시 secret_token=WEBHOOK_SECRET 지정 필수 (SETUP-telegram-comment-bot.md)

import { escapeHtml, getComment, postUrl, sourceLabel, supabaseRpc, tg, setActiveBot } from './_shared.js';
import {
  commentStatsMessage,
  commentsMessages,
  coupangMessage,
  munggeMessage,
  paperdocMessage,
  likesMessage,
  recentMessage,
  adfitMessage,
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
import { feedbackCards, handleFeedbackCallback } from './_feedback.js';
import { gscMessage, seoMessage } from './_gsc-view.js';
import { moneyMessage } from './_money.js';
import { reportMessage, vipReportMessage } from './_report.js';
import { runNewsletter } from './_newsletter.js';
import { indexMessage } from './_seo.js';
import {
  threadsStatusMessage,
  threadsMenu,
  threadsGenMessage,
  threadsQueueCards,
  threadsQueueList,
  threadsPostNow,
  threadsInsightsMessage,
  handleThreadsCallback,
  handleReplyCallback,
  handleHottimeCallback,
  handleEngageCallback,
  findAndQueue,
  maybeHandleThreadsFlow,
} from './_threads-bot.js';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const HELP = [
  '<b>블로그 운영 봇</b> — 기준 사이트: <b>뭉게</b>(mungge.com)',
  '',
  '<b>📊 대시보드 조회 (실시간)</b>',
  '• /stats — 전체 요약 (뭉게 조회·방문·검색유입 + 구독·댓글)',
  '• /mg [일수] — 뭉게 상세 (일별 추이·유입경로·인기글·최근발행, 기본 7일)',
  '• /report — 뭉게/VIP 선택 메뉴 → 보고서 (버튼으로 뭉게↔VIP 전환)',
  '   <code>/report mg|pc</code> 바로 열기 · <code>/report YYYY-MM-DD</code> 뭉게 특정일',
  '• /gsc [일수] — 구글 검색 유입 (검색어·노출·CTR·평균순위, 기본 7일)',
  '• /top [n] — 인기 글 (뭉게 최근 30일)',
  '• /trend — 최근 7일 조회수 추이',
  '• /newsletter [force] — 새 글 뉴스레터 수동 발송 (force=이미 보낸 글도 재발송)',
  '',
  '<b>💰 수익·상호작용</b>',
  '• /coupang — 쿠팡 클릭 상세 (어떤 글→어떤 링크)',
  '• /paperdoc — 페이퍼닥 클릭 (소스별·위치별)',
  '• /likes · /recent [n] — 추천 Top · 최근 이벤트 피드',
  '',
  '<b>💬 댓글 관리</b>',
  '• /comments [n] — 최근 댓글 (각 메시지에 답장=대댓글)',
  '• /cstats — 댓글 통계 + 7일 트렌드',
  '• 새 댓글 알림에 <b>답장</b> → 관리자 대댓글 등록',
  '• <code>/reply &lt;댓글ID&gt; &lt;내용&gt;</code> · <code>/delete &lt;댓글ID&gt;</code>',
  '',
  '<b>🗳 사이트 피드백</b> (입시 아카이브 등)',
  '• /feedback [n] — 최근 피드백 (기본 10건, 카드마다 🗑 삭제 버튼)',
  '• <code>/feedback &lt;사이트&gt; [n]</code> — 사이트별 (예: <code>/feedback ipsi-archive 5</code>)',
  '',
  '<b>💰 수익화·SEO</b>',
  '• /seo [일수] — SEO 기회 진단 (CTR 개선 대상·문턱 앞 검색어·미공략 검색어)',
  '• /money [블로그] [n] — 트래픽 있는데 쿠팡 링크 없는 글',
  '• <code>/index &lt;블로그&gt; [slug]</code> — IndexNow 색인 요청 (빙·네이버)',
  '',
  '<b>📝 블로그 제어</b> (블로그: <code>mg</code>=뭉게 · <code>pc</code>=VIP)',
  '• /blogs — 제어 가능한 블로그 목록',
  '• <code>/posts &lt;블로그&gt; [n]</code> — 최근 글 (발행✅/숨김🚫)',
  '• <code>/publish &lt;블로그&gt; &lt;slug&gt;</code> · <code>/draft &lt;블로그&gt; &lt;slug&gt;</code> — 발행/숨김',
  '• <code>/newpost &lt;블로그&gt;</code> — 새 글 작성 (제목→본문)',
  '• <code>/edit &lt;블로그&gt; &lt;slug&gt;</code> — 본문 교체',
  '• <code>/delpost &lt;블로그&gt; &lt;slug&gt;</code> — 글 삭제 (확인 필요)',
  '• /generate — AI 자동 포스팅 (블로그 선택 → 🔥핫 키워드 / ✍️직접 입력 / 🎲자동)',
  '   <code>/generate pc 게임 주제</code> 처럼 인자를 주면 바로 실행',
  '   <i>※ 뭉게는 WordPress 직접 운영이라 repo 명령이 없어요 — 발행은 로컬 daily-run.mjs</i>',
  '• <code>/deploy &lt;블로그&gt;</code> · <code>/status [블로그]</code>',
  '• /cancel — 진행 중인 작성/수정 취소',
].join('\n');

// ── /report 블로그 선택 메뉴 · 보고서 네비 키보드 ──
const REPORT_MENU = {
  text: '📊 <b>어느 보고서를 볼까요?</b>',
  kb: {
    inline_keyboard: [[
      { text: '🌐 뭉게', callback_data: 'rep:mg' },
      { text: '⭐ VIP', callback_data: 'rep:pc' },
    ]],
  },
};
// 보고서 하단 키보드: 반대편 블로그로 토글 + 메뉴로 돌아가기
const reportNavKb = (blog) => ({
  inline_keyboard: [[
    blog === 'mg'
      ? { text: '⭐ VIP 보기', callback_data: 'rep:pc' }
      : { text: '🌐 뭉게 보기', callback_data: 'rep:mg' },
    { text: '◀ 메뉴', callback_data: 'rep:menu' },
  ]],
});
const blogReportText = (blog) => (blog === 'pc' ? vipReportMessage() : reportMessage());

export default async function handler(req, res) {
  // ── 관리자 진단/복구 (인바운드 명령이 안 먹힐 때) — 웹훅 등록 상태 조회·재등록 ──
  //   GET /api/telegram-webhook?action=webhook-info&secret=<CRON_SECRET>
  //   GET /api/telegram-webhook?action=set-webhook&secret=<CRON_SECRET>[&bot=vip|threads]
  {
    const u = new URL(req.url, 'http://x');
    const action = u.searchParams.get('action');
    if (action === 'webhook-info' || action === 'set-webhook') {
      if (!process.env.CRON_SECRET || u.searchParams.get('secret') !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const which = u.searchParams.get('bot') || 'main';
      const token =
        which === 'vip' ? process.env.TELEGRAM_VIP_BOT_TOKEN
        : which === 'threads' ? process.env.TELEGRAM_THREADS_BOT_TOKEN
        : process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return res.status(500).json({ error: `no token for bot=${which}` });
      const api = (m, body) =>
        fetch(`https://api.telegram.org/bot${token}/${m}`,
          body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined
        ).then((r) => r.json());
      if (action === 'webhook-info') {
        return res.status(200).json(await api('getWebhookInfo'));
      }
      const hookUrl =
        'https://ai-revenue-blog.vercel.app/api/telegram-webhook' + (which === 'main' ? '' : `?bot=${which}`);
      const setRes = await api('setWebhook', {
        url: hookUrl,
        secret_token: process.env.WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query'],
      });
      return res.status(200).json({ bot: which, url: hookUrl, setWebhook: setRes, info: await api('getWebhookInfo') });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // 어느 봇으로 들어온 업데이트인지(?bot=vip|threads, 없으면 main) → 응답도 같은 봇으로 나가게 한다.
  setActiveBot(req.query && req.query.bot);

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

    // ── 리포트 메뉴/전환 (rep:menu|mg|pc) — 뭉게↔VIP 를 같은 메시지에서 왔다갔다 ──
    if ((cb.data || '').startsWith('rep:')) {
      const which = (cb.data || '').slice(4);
      try {
        const edit = (text, reply_markup) =>
          tg('editMessageText', {
            chat_id: cbChat,
            message_id: cb.message.message_id,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup,
          });
        if (which === 'menu') {
          await edit(REPORT_MENU.text, REPORT_MENU.kb);
        } else {
          const blog = which === 'pc' ? 'pc' : 'mg';
          await edit(await blogReportText(blog), reportNavKb(blog));
        }
      } catch (e) {
        console.error('report callback error:', e);
        await tg('sendMessage', { chat_id: cbChat, text: `❌ ${escapeHtml(e.message)}`, parse_mode: 'HTML' });
      }
      return res.status(200).json({ ok: true });
    }

    // ── 피드백 콜백 (fb:del|ok|no:ID) — 삭제는 확인 한 단계 거침 ──
    if ((cb.data || '').startsWith('fb:')) {
      try {
        const out = await handleFeedbackCallback(cb.data || '');
        await tg('editMessageText', {
          chat_id: cbChat,
          message_id: cb.message.message_id,
          text: out.text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: out.reply_markup ?? { inline_keyboard: [] },
        });
      } catch (e) {
        console.error('feedback callback error:', e);
        await tg('sendMessage', { chat_id: cbChat, text: `❌ 피드백 처리 실패: ${e.message}` });
      }
      return res.status(200).json({ ok: true });
    }

    // ── Threads 초안 콜백 (thr:pub|edit|sched|rej:ID) ──
    if ((cb.data || '').startsWith('thr:')) {
      try {
        const out = await handleThreadsCallback(cbChat, cb.data || '');
        if (out.force_reply) {
          await tg('sendMessage', { chat_id: cbChat, text: out.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { force_reply: true, input_field_placeholder: '키워드 입력…' } });
        } else {
          await tg('editMessageText', {
            chat_id: cbChat,
            message_id: cb.message.message_id,
            text: out.text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(out.reply_markup ? { reply_markup: out.reply_markup } : {}),
          });
        }
      } catch (e) {
        console.error('threads callback error:', e);
        await tg('sendMessage', { chat_id: cbChat, text: `❌ ${escapeHtml(e.message)}`, parse_mode: 'HTML' });
      }
      return res.status(200).json({ ok: true });
    }

    // ── 댓글 대댓글 콜백 (rpl:send|reply|ign:ID) ──
    if ((cb.data || '').startsWith('rpl:')) {
      try {
        const out = await handleReplyCallback(cbChat, cb.data || '');
        if (out.force_reply) {
          // ✍️ 답장 — 입력창 자동 오픈(포커스). 사용자가 여기 답하면 threads_reply 플로우가 처리.
          await tg('sendMessage', {
            chat_id: cbChat,
            text: out.text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { force_reply: true, input_field_placeholder: '대댓글 입력…' },
          });
        } else {
          await tg('editMessageText', {
            chat_id: cbChat,
            message_id: cb.message.message_id,
            text: out.text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          });
        }
      } catch (e) {
        console.error('reply callback error:', e);
        await tg('sendMessage', { chat_id: cbChat, text: `❌ ${escapeHtml(e.message)}`, parse_mode: 'HTML' });
      }
      return res.status(200).json({ ok: true });
    }

    // ── 핫타임 버튼 (ht:queue|pass) ──
    if ((cb.data || '').startsWith('ht:')) {
      try {
        const out = await handleHottimeCallback(cbChat, cb.data || '');
        if (cb.data === 'ht:queue') {
          await tg('sendMessage', { chat_id: cbChat, text: out.text, parse_mode: 'HTML', disable_web_page_preview: true, ...(out.reply_markup ? { reply_markup: out.reply_markup } : {}) });
        } else {
          await tg('editMessageText', { chat_id: cbChat, message_id: cb.message.message_id, text: out.text, parse_mode: 'HTML', ...(out.reply_markup ? { reply_markup: out.reply_markup } : {}) });
        }
      } catch (e) {
        await tg('sendMessage', { chat_id: cbChat, text: `❌ ${escapeHtml(e.message)}`, parse_mode: 'HTML' });
      }
      return res.status(200).json({ ok: true });
    }

    // ── 인게이지 답글 버튼 (eng:send|reply|pass) ──
    if ((cb.data || '').startsWith('eng:')) {
      try {
        const out = await handleEngageCallback(cbChat, cb.data || '');
        if (out.force_reply) {
          await tg('sendMessage', { chat_id: cbChat, text: out.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { force_reply: true, input_field_placeholder: '답글 입력…' } });
        } else {
          await tg('editMessageText', { chat_id: cbChat, message_id: cb.message.message_id, text: out.text, parse_mode: 'HTML', disable_web_page_preview: true });
        }
      } catch (e) {
        await tg('sendMessage', { chat_id: cbChat, text: `❌ ${escapeHtml(e.message)}`, parse_mode: 'HTML' });
      }
      return res.status(200).json({ ok: true });
    }

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

  // ── /feedback [사이트] [n] — 사이트 피드백 목록 (카드마다 삭제 버튼) ──
  const fbCmd = text.match(/^\/feedback(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (fbCmd) {
    try {
      const parts = (fbCmd[1] || '').trim().split(/\s+/).filter(Boolean);
      const site = parts.find((p) => !/^\d+$/.test(p)) || null;
      const n = Number(parts.find((p) => /^\d+$/.test(p)));
      const { header, cards } = await feedbackCards({
        limit: Number.isFinite(n) ? n : 10,
        site,
      });
      await reply(header);
      for (const c of cards) {
        await tg('sendMessage', {
          chat_id: chatId,
          text: c.text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: c.reply_markup,
        });
      }
    } catch (e) {
      console.error('feedback list error:', e);
      await reply(`❌ 피드백 조회 실패: ${escapeHtml(e.message)}`);
    }
    return res.status(200).json({ ok: true });
  }

  // ── /post <내용> — 큐 안 거치고 즉석 발행 (life 계정) ──
  const postCmd = text.match(/^\/post(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (postCmd) {
    await reply(await threadsPostNow(postCmd[1] || ''));
    return res.status(200).json({ ok: true });
  }

  // ── /find <키워드> — 공개글 검색 → 답글 후보 카드 (수동 답글) ──
  const findCmd = text.match(/^\/find(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (findCmd) {
    await reply('🔎 검색 중…');
    await reply(await findAndQueue(findCmd[1] || '', chatId));
    return res.status(200).json({ ok: true });
  }

  // ── /threads 명령군 ──
  const thr = text.match(/^\/threads(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (thr) {
    try {
      const parts = (thr[1] || '').trim().split(/\s+/).filter(Boolean);
      const sub = (parts[0] || '').toLowerCase();
      if (sub === 'gen') {
        await reply(await threadsGenMessage(parts[1], parts[2], parts[3]));
      } else if (sub === 'queue') {
        const list = await threadsQueueList(parts[1] || 'life');
        await tg('sendMessage', {
          chat_id: chatId, text: list.text, parse_mode: 'HTML',
          disable_web_page_preview: true, ...(list.reply_markup ? { reply_markup: list.reply_markup } : {}),
        });
      } else if (sub === 'insights') {
        await reply(await threadsInsightsMessage(parts[1] ? parseInt(parts[1], 10) : 7));
      } else if (sub === 'status') {
        await reply(await threadsStatusMessage());
      } else {
        const menu = threadsMenu();
        await tg('sendMessage', { chat_id: chatId, text: menu.text, parse_mode: 'HTML', reply_markup: menu.reply_markup });
      }
    } catch (e) {
      console.error('threads command error:', e);
      await reply(`❌ ${escapeHtml(e.message)}`);
    }
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

      // ── /report → 블로그 선택 메뉴 (인자로 mg|pc|날짜 주면 바로 해당 보고서) ──
      if (cmd === 'report') {
        const blog = /^(pc|vip|playcast)$/i.test(a1 || '') ? 'pc'
          : /^(mg|mungge|뭉게)$/i.test(a1 || '') ? 'mg' : null;
        const day = /^\d{4}-\d{2}-\d{2}$/.test(a1 || '') ? a1 : undefined;
        if (!blog && !day) {
          await tg('sendMessage', { chat_id: chatId, text: REPORT_MENU.text, parse_mode: 'HTML', reply_markup: REPORT_MENU.kb });
          return res.status(200).json({ ok: true });
        }
        const b = blog || 'mg';
        const textOut = b === 'pc' ? await vipReportMessage() : await reportMessage(day);
        await tg('sendMessage', { chat_id: chatId, text: textOut, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: reportNavKb(b) });
        return res.status(200).json({ ok: true });
      }

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
        newsletter: async () => {
          const force = (a1 || '').toLowerCase() === 'force';
          const res = await runNewsletter({ force });
          const lines = res.map((r) => {
            if (r.error) return `• ${r.source}: ⚠️ ${escapeHtml(r.error)}`;
            if (r.skipped) return `• ${r.source}: (건너뜀)`;
            const note = r.note ? ` (${escapeHtml(r.note)})` : '';
            return `• ${escapeHtml(sourceLabel(r.source))}: 새 ${r.new || 0}편 → ${r.sent || 0}명 발송${note}`;
          });
          return `📩 <b>뉴스레터 ${force ? '강제 ' : ''}발송</b>\n\n${lines.join('\n')}`;
        },
        gsc: () => gscMessage(a1 ? parseInt(a1, 10) : 7),
        seo: () => seoMessage(a1 ? parseInt(a1, 10) : 28),
        money: () => moneyMessage(/^\d+$/.test(a1 || '') ? null : a1, /^\d+$/.test(a1 || '') ? parseInt(a1, 10) : 8),
        index: () => indexMessage(a1, a2),
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
      // Threads 초안 수정 플로우 우선
      const tflow = await maybeHandleThreadsFlow(chatId, text);
      if (tflow) {
        await reply(tflow.note);
        if (tflow.card) {
          await tg('sendMessage', {
            chat_id: chatId, text: tflow.card.text, parse_mode: 'HTML',
            disable_web_page_preview: true, reply_markup: tflow.card.reply_markup,
          });
        }
        return res.status(200).json({ ok: true });
      }
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
        // 뭉게 = 유일한 기준 사이트. /tf·/lf 는 301 이관으로 삭제됨(2026-07-30).
        mg: () => munggeMessage(num ?? 7),
        mungge: () => munggeMessage(num ?? 7),
        top: () => topPagesMessage(num ?? 10),
        trend: () => trendMessage(),
        cstats: () => commentStatsMessage(),
        coupang: () => coupangMessage(),
        paperdoc: () => paperdocMessage(),
        likes: () => likesMessage(num ?? 10),
        recent: () => recentMessage(num ?? 10),
        adfit: () => adfitMessage(),
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
