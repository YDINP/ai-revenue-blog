// Threads 텔레그램 봇 명령/콜백 핸들러
import { escapeHtml } from './_shared.js';
import { dispatchWorkflow } from './_github.js';
import { setState, getState, clearState } from './_state.js';
import {
  getAccounts, sb, getQueue, updateQueue, publishDraft,
  getReply, updateReply, publishReply, publish, insertPost,
} from './_threads.js';

const REPO = 'YDINP/ai-revenue-blog';
const WORKFLOW = 'generate-threads.yml';
const BRANCH = 'master';

const preview = (s, n = 120) => {
  const t = String(s || '').replace(/\n/g, ' ⏎ ');
  return escapeHtml(t.length > n ? t.slice(0, n) + '…' : t);
};

// ── 상태 요약 ──
export async function threadsStatusMessage() {
  const accounts = await getAccounts(false);
  if (!accounts.length) return '연결된 Threads 계정이 없습니다. OAuth 연결 링크로 계정을 추가하세요.';
  const drafts = await sb('threads_queue?status=eq.draft&select=account_id');
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const pub = await sb(`threads_posts?published_at=gte.${since}&select=account_id`);
  const cnt = (arr, id) => arr.filter((r) => r.account_id === id).length;
  const lines = ['<b>🧵 Threads 계정</b>', ''];
  for (const a of accounts) {
    const exp = a.token_expires_at ? a.token_expires_at.slice(0, 10) : '?';
    lines.push(
      `• <b>${escapeHtml(a.topic)}</b> ${a.active ? '' : '(비활성) '}— 모드 <code>${a.publish_mode}</code>\n` +
        `  초안 ${cnt(drafts, a.id)} · 24h발행 ${cnt(pub, a.id)} · 토큰~${exp}`
    );
  }
  lines.push('', '명령: <code>/threads gen &lt;topic&gt; [n] [blog|coupang]</code> · <code>/threads queue &lt;topic&gt;</code> · <code>/threads insights</code>');
  return lines.join('\n');
}

// ── 초안 생성 dispatch ──
export async function threadsGenMessage(topic = 'life', count = '2', linkmode = 'blog') {
  const t = (topic || 'life').toLowerCase();
  const lm = ['blog', 'coupang'].includes((linkmode || '').toLowerCase()) ? linkmode.toLowerCase() : 'blog';
  const n = ['1', '2', '3', '5'].includes(String(count)) ? String(count) : '2';
  await dispatchWorkflow(REPO, WORKFLOW, BRANCH, { topic: t, count: n, linkmode: lm });
  return `🧵 <b>${escapeHtml(t)}</b> 초안 ${n}개 생성 요청됨 (링크:${lm}).\n30~60초 뒤 승인 카드가 도착합니다.`;
}

// ── 초안 카드 (승인 버튼) ──
export function threadsCard(row) {
  const link = row.link_url ? `\n🔗 <code>${row.link_kind}</code>: ${escapeHtml(row.link_url.slice(0, 60))}…` : '';
  return {
    text: `🧵 <b>초안 #${row.id}</b> (${escapeHtml(row.link_kind || 'none')})\n\n${escapeHtml(row.text)}${link}`,
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ 발행', callback_data: `thr:pub:${row.id}` },
        { text: '✍️ 수정', callback_data: `thr:edit:${row.id}` },
        { text: '⏰ 예약', callback_data: `thr:sched:${row.id}` },
        { text: '🗑 버림', callback_data: `thr:rej:${row.id}` },
      ]],
    },
  };
}

// ── 대기 초안 카드 목록 ──
export async function threadsQueueCards(topic) {
  let q = 'threads_queue?status=eq.draft&select=*&order=id.desc&limit=10';
  if (topic) {
    const accts = await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&select=id`);
    const ids = accts.map((a) => a.id);
    if (!ids.length) return [{ text: `'${escapeHtml(topic)}' 계정이 없습니다.` }];
    q = `threads_queue?status=eq.draft&account_id=in.(${ids.join(',')})&select=*&order=id.desc&limit=10`;
  }
  const rows = await sb(q);
  if (!rows.length) return [{ text: '대기 중인 초안이 없습니다. <code>/threads gen</code> 로 생성하세요.' }];
  return rows.map(threadsCard);
}

// ── 대기 초안 목록 (한 메시지 + 선택 버튼) ──
export async function threadsQueueList(topic = 'life') {
  let ids = null;
  const accts = await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&select=id`);
  ids = accts.map((a) => a.id);
  if (!ids.length) return { text: `'${escapeHtml(topic)}' 계정이 없습니다.` };
  const rows = await sb(`threads_queue?status=eq.draft&account_id=in.(${ids.join(',')})&select=id,text,link_kind&order=id.desc&limit=20`);
  if (!rows.length) return { text: '큐에 초안이 없어. <code>/threads gen life 2</code> 로 채워줘.' };

  const lines = [`🧵 <b>큐 초안 ${rows.length}개</b> — 눌러서 발행/예약`, ''];
  const btns = [];
  for (const r of rows) {
    const tag = r.link_kind === 'none' ? '💬' : '📄';
    lines.push(`${tag} <b>#${r.id}</b> ${preview(r.text, 40)}`);
    btns.push({ text: `${tag}#${r.id}`, callback_data: `thr:show:${r.id}` });
  }
  const kb = [];
  for (let i = 0; i < btns.length; i += 3) kb.push(btns.slice(i, i + 3));
  kb.push([
    { text: '🔀 랜덤 발행', callback_data: `thr:rand:${topic}` },
    { text: '✖ 닫기', callback_data: 'thr:close' },
  ]);
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: kb } };
}

// ── 즉석 발행 (/post) — 큐 안 거치고 바로 Threads 발행 ──
export async function threadsPostNow(rawText, topic = 'life') {
  const body = String(rawText || '').trim();
  if (!body) return '사용법: <code>/post 올릴 내용</code> (여러 줄 OK). 링크 없이 본문만 바로 발행돼요.';
  const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
  if (!acct?.access_token) return `❌ '${escapeHtml(topic)}' 계정 토큰 없음`;
  try {
    const mediaId = await publish(acct, { text: body });
    await insertPost({ account_id: acct.id, threads_media_id: mediaId }).catch(() => {});
    await sb(`threads_accounts?id=eq.${acct.id}`, { method: 'PATCH', body: { hottime_started_at: null } }).catch(() => {}); // 상호작용 처리
    return `✅ 바로 발행 완료! (media ${mediaId})`;
  } catch (e) {
    return `❌ 발행 실패: ${escapeHtml(e.message)}`;
  }
}

// ── 다음 골든타임(KST 08:00 / 23:00) UTC ISO ──
function nextGoldenSlotUtc() {
  const now = Date.now();
  const KST = 9 * 3600 * 1000;
  const kstNow = new Date(now + KST);
  const y = kstNow.getUTCFullYear(), mo = kstNow.getUTCMonth(), d = kstNow.getUTCDate();
  const slots = [8, 23];
  for (let addDay = 0; addDay < 2; addDay++) {
    for (const h of slots) {
      const kstMs = Date.UTC(y, mo, d + addDay, h, 0, 0);
      const utcMs = kstMs - KST;
      if (utcMs > now + 60 * 1000) return new Date(utcMs).toISOString();
    }
  }
  return new Date(now + 3600 * 1000).toISOString();
}

// ── 인사이트 요약 ──
export async function threadsInsightsMessage(days = 7) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const rows = await sb(`threads_posts?published_at=gte.${since}&select=*&order=published_at.desc&limit=20`);
  if (!rows.length) return `최근 ${days}일 발행 없음.`;
  const sum = rows.reduce((a, r) => ({ v: a.v + (r.views || 0), l: a.l + (r.likes || 0), c: a.c + (r.replies || 0) }), { v: 0, l: 0, c: 0 });
  const lines = [`<b>🧵 Threads 성과 (최근 ${days}일, ${rows.length}건)</b>`, `합계 — 노출 ${sum.v} · 좋아요 ${sum.l} · 댓글 ${sum.c}`, ''];
  for (const r of rows.slice(0, 8)) {
    lines.push(`• #${r.id} ${r.published_at.slice(5, 16).replace('T', ' ')} — 👁${r.views || 0} ♥${r.likes || 0} 💬${r.replies || 0}`);
  }
  return lines.join('\n');
}

// ── 콜백 처리 (thr:list|show|rand|pub|edit|sched|rej) → {text, reply_markup?} ──
export async function handleThreadsCallback(chatId, data) {
  let mm;
  // 목록 닫기
  if (data === 'thr:close') {
    return { text: '🧵 큐 목록 닫음. 다시 보려면 <code>/threads queue life</code>', reply_markup: { inline_keyboard: [] } };
  }
  // 목록으로 돌아가기
  if ((mm = /^thr:list:(.+)$/.exec(data || ''))) {
    return await threadsQueueList(mm[1]);
  }
  // 초안 하나 펼쳐 카드 보기(+목록 back)
  if ((mm = /^thr:show:(\d+)$/.exec(data || ''))) {
    const row = await getQueue(parseInt(mm[1], 10));
    if (!row) return { text: `초안 #${mm[1]} 없음(이미 처리됨?)` };
    const card = threadsCard(row);
    card.reply_markup.inline_keyboard.push([{ text: '◀ 목록', callback_data: 'thr:list:life' }]);
    return { text: card.text, reply_markup: card.reply_markup };
  }
  // 랜덤 즉시 발행
  if ((mm = /^thr:rand:(.+)$/.exec(data || ''))) {
    const topic = mm[1];
    const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
    if (!acct?.access_token) return { text: '❌ 계정 토큰 없음' };
    const drafts = await sb(`threads_queue?status=eq.draft&account_id=eq.${acct.id}&select=*`);
    if (!drafts.length) return { text: '큐에 초안이 없어.' };
    const pick = drafts[Math.floor(Math.random() * drafts.length)];
    try {
      const mid = await publishDraft(acct, pick);
      await sb(`threads_accounts?id=eq.${acct.id}`, { method: 'PATCH', body: { hottime_started_at: null } }).catch(() => {});
      return { text: `🔀 랜덤 발행 완료: #${pick.id} (media ${mid})${pick.link_url ? '\n🔗 링크는 첫 댓글에' : ''}` };
    } catch (e) {
      await updateQueue(pick.id, { status: 'failed', error: e.message });
      return { text: `❌ 발행 실패 #${pick.id}: ${escapeHtml(e.message)}` };
    }
  }

  const m = /^thr:(pub|edit|sched|rej):(\d+)$/.exec(data || '');
  if (!m) return { text: '알 수 없는 동작' };
  const [, action, idStr] = m;
  const id = parseInt(idStr, 10);
  const row = await getQueue(id);
  if (!row) return { text: `초안 #${id} 없음(이미 처리됨?)` };

  if (action === 'rej') {
    await updateQueue(id, { status: 'rejected' });
    return { text: `🗑 초안 #${id} 버림.` };
  }
  if (action === 'edit') {
    await setState(chatId, { flow: 'threads_edit', queueId: id });
    return { text: `✍️ 초안 #${id} 수정: 새 본문을 답장으로 보내주세요. (취소: /cancel)\n\n현재:\n${escapeHtml(row.text)}` };
  }
  if (action === 'sched') {
    const at = nextGoldenSlotUtc();
    await updateQueue(id, { status: 'scheduled', scheduled_at: at });
    await sb(`threads_accounts?id=eq.${row.account_id}`, { method: 'PATCH', body: { hottime_started_at: null } }).catch(() => {}); // 상호작용함 → 핫타임 자동발행 skip
    const kst = new Date(new Date(at).getTime() + 9 * 3600 * 1000).toISOString().slice(5, 16).replace('T', ' ');
    return { text: `⏰ 초안 #${id} 예약됨 → ${kst} (KST). Cron이 발행합니다.` };
  }
  // pub — 즉시 발행
  const account = (await sb(`threads_accounts?id=eq.${row.account_id}&limit=1`))[0];
  if (!account?.access_token) return { text: `❌ 계정 토큰 없음 (account_id=${row.account_id})` };
  try {
    const mediaId = await publishDraft(account, row);
    await sb(`threads_accounts?id=eq.${row.account_id}`, { method: 'PATCH', body: { hottime_started_at: null } }).catch(() => {}); // 상호작용함 → 핫타임 자동발행 skip
    return { text: `✅ 초안 #${id} 발행 완료! (media ${mediaId})${row.link_url ? '\n🔗 링크는 첫 댓글에 게시됨' : ''}` };
  } catch (e) {
    await updateQueue(id, { status: 'failed', error: e.message });
    return { text: `❌ 발행 실패 #${id}: ${escapeHtml(e.message)}` };
  }
}

// ── 댓글 반자동: 승인카드 ──
export function threadsReplyCard(row) {
  const d = row.draft
    ? `\n\n<b>추천 답변</b>\n${escapeHtml(row.draft)}`
    : '\n\n<i>추천 답변 없음 — ✍️로 직접 작성</i>';
  const text = `💬 <b>새 댓글</b> @${escapeHtml(row.comment_user || '?')}\n${escapeHtml(row.comment_text || '')}${d}`;
  const buttons = [];
  if (row.draft) buttons.push({ text: '✅ 이대로', callback_data: `rpl:send:${row.id}` });
  buttons.push({ text: '✍️ 답장', callback_data: `rpl:reply:${row.id}` });
  buttons.push({ text: '🗑 무시', callback_data: `rpl:ign:${row.id}` });
  return { text, reply_markup: { inline_keyboard: [buttons] } };
}

// 대댓글 실제 발행 (콜백/플로우 공용)
async function sendReply(id, text) {
  const row = await getReply(id);
  if (!row) return { text: `댓글 #${id} 없음(이미 처리됨?)` };
  if (!text || !text.trim()) return { text: `❌ 빈 답변이라 취소.` };
  const account = (await sb(`threads_accounts?id=eq.${row.account_id}&limit=1`))[0];
  if (!account?.access_token) return { text: `❌ 계정 토큰 없음 (account_id=${row.account_id})` };
  try {
    const mediaId = await publishReply(account, { text, replyToId: row.comment_id });
    await updateReply(id, { status: 'sent', reply_media_id: mediaId });
    return { text: `✅ 대댓글 발행 완료 (#${id})` };
  } catch (e) {
    await updateReply(id, { status: 'failed', error: e.message });
    return { text: `❌ 발행 실패 #${id}: ${escapeHtml(e.message)}` };
  }
}

// ── 콜백 처리 (rpl:send|reply|ign:ID) ──
export async function handleReplyCallback(chatId, data) {
  const m = /^rpl:(send|reply|ign):(\d+)$/.exec(data || '');
  if (!m) return { text: '알 수 없는 동작' };
  const [, action, idStr] = m;
  const id = parseInt(idStr, 10);
  const row = await getReply(id);
  if (!row) return { text: `댓글 #${id} 없음(이미 처리됨?)` };
  if (row.status !== 'pending') return { text: `댓글 #${id} 이미 처리됨(${row.status}).` };

  if (action === 'ign') {
    await updateReply(id, { status: 'ignored' });
    return { text: `🗑 댓글 #${id} 무시.` };
  }
  if (action === 'reply') {
    await setState(chatId, { flow: 'threads_reply', replyId: id });
    return {
      text: `✍️ 댓글 #${id}에 답장 — 아래 입력창에 대댓글을 써서 보내줘. (취소 /cancel)\n\n원댓글:\n${escapeHtml(row.comment_text || '')}`,
      force_reply: true, // 입력창 자동 오픈+포커스
    };
  }
  // send — AI 초안 그대로 발행
  return await sendReply(id, row.draft);
}

// ── 텍스트 플로우 처리 (webhook에서 호출) — 초안 수정 / 대댓글 직접 작성 ──
export async function maybeHandleThreadsFlow(chatId, text) {
  const st = await getState(chatId);
  if (!st) return null;
  if (st.flow === 'threads_edit') {
    await updateQueue(st.queueId, { text });
    await clearState(chatId);
    const row = await getQueue(st.queueId);
    return { card: threadsCard(row), note: `✍️ 초안 #${st.queueId} 수정됨.` };
  }
  if (st.flow === 'threads_reply') {
    await clearState(chatId);
    const out = await sendReply(st.replyId, text);
    return { note: out.text }; // card 없음
  }
  return null;
}
