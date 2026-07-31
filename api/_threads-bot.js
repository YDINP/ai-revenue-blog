// Threads 텔레그램 봇 명령/콜백 핸들러
import { escapeHtml, tgThreads as tg } from './_shared.js';
import { dispatchWorkflow } from './_github.js';
import { setState, getState, clearState } from './_state.js';
import {
  getAccounts, sb, getQueue, updateQueue, publishDraft,
  getReply, updateReply, publishReply, publish, insertPost, insertQueue,
  keywordSearch, insertEngage, getEngage, updateEngage, engageExists, draftEngageReply,
  splitThread, isThreadItem, getPermalink,
} from './_threads.js';
import { THREAD_PRESETS, getPreset } from './_threads-presets.js';

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
  const thread = isThreadItem(row);
  if (thread) {
    const segs = splitThread(row.text);
    const body = segs.map((s, i) => `<b>[${i + 1}편]</b> ${escapeHtml(s)}`).join('\n\n');
    return {
      text: `🧵 <b>타래 초안 #${row.id}</b> — ${segs.length}편\n\n${body}${link}`,
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ 발행', callback_data: `thr:pub:${row.id}` },
          { text: '⏰ 예약', callback_data: `thr:sched:${row.id}` },
          { text: '🗑 버림', callback_data: `thr:rej:${row.id}` },
        ]],
      },
    };
  }
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

// ── Threads 메뉴 (버튼) ──
export function threadsMenu() {
  return {
    text: '🧵 <b>Threads 메뉴</b> — 뭐 할래?',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📥 만든 타래', callback_data: 'thr:presets' }, { text: '🧵 타래 올리기', callback_data: 'thr:newthread' }],
        [{ text: '📋 큐 보기', callback_data: 'thr:list:life' }, { text: '🔀 랜덤 발행', callback_data: 'thr:rand:life' }],
        [{ text: '📊 성과', callback_data: 'thr:insights' }, { text: 'ℹ️ 명령어', callback_data: 'thr:cmds' }],
      ],
    },
  };
}

// ── 핫타임 알림 버튼 (ht:queue | ht:pass) ──
export async function handleHottimeCallback(chatId, data) {
  if (data === 'ht:queue') return await threadsQueueList('life');
  if (data === 'ht:pass') {
    await sb('threads_accounts?topic=eq.life&active=eq.true', { method: 'PATCH', body: { hottime_started_at: null } }).catch(() => {});
    return { text: '⏭ 이번 핫타임 패스 — 자동발행 안 함.', reply_markup: { inline_keyboard: [] } };
  }
  return { text: '알 수 없는 동작' };
}

// ── 아웃바운드 인게이지먼트 (키워드 검색 → 남 글에 답글, 수동 승인) ──
export function engageCard(row) {
  const d = row.draft ? `\n\n<b>추천 답글</b>\n${escapeHtml(row.draft)}` : '\n\n<i>추천 답글 없음 — ✍️로 직접 작성</i>';
  const link = row.permalink ? `\n🔗 ${escapeHtml(row.permalink)}` : '';
  const text = `🔎 <b>@${escapeHtml(row.post_user || '?')}</b>\n${escapeHtml((row.post_text || '').slice(0, 240))}${link}${d}`;
  const b = [];
  if (row.draft) b.push({ text: '✅ 이대로', callback_data: `eng:send:${row.id}` });
  b.push({ text: '✍️ 답글', callback_data: `eng:reply:${row.id}` });
  b.push({ text: '🗑 패스', callback_data: `eng:pass:${row.id}` });
  return { text, reply_markup: { inline_keyboard: [b] } };
}

async function sendEngageReply(id, text) {
  const row = await getEngage(id);
  if (!row) return { text: `#${id} 없음(이미 처리됨?)` };
  if (!text || !text.trim()) return { text: '❌ 빈 답글이라 취소.' };
  const acct = (await sb(`threads_accounts?id=eq.${row.account_id}&limit=1`))[0];
  if (!acct?.access_token) return { text: '❌ 계정 토큰 없음' };
  try {
    const mid = await publishReply(acct, { text, replyToId: row.post_id });
    await updateEngage(id, { status: 'replied', reply_media_id: mid });
    return { text: `✅ @${escapeHtml(row.post_user || '')} 글에 답글 완료 (#${id})` };
  } catch (e) {
    await updateEngage(id, { status: 'failed', error: e.message });
    return { text: `❌ 답글 실패 #${id}: ${escapeHtml(e.message)}` };
  }
}

export async function handleEngageCallback(chatId, data) {
  const m = /^eng:(send|reply|pass):(\d+)$/.exec(data || '');
  if (!m) return { text: '알 수 없는 동작' };
  const [, action, idStr] = m;
  const id = parseInt(idStr, 10);
  const row = await getEngage(id);
  if (!row) return { text: `#${id} 없음(이미 처리됨?)` };
  if (row.status !== 'pending') return { text: `#${id} 이미 처리됨(${row.status}).` };
  if (action === 'pass') { await updateEngage(id, { status: 'passed' }); return { text: `🗑 #${id} 패스.` }; }
  if (action === 'reply') {
    await setState(chatId, { flow: 'engage_reply', engageId: id });
    return { text: `✍️ @${escapeHtml(row.post_user || '')} 글에 답글 — 아래 입력창에 써서 보내줘.\n\n상대 글:\n${escapeHtml((row.post_text || '').slice(0, 200))}`, force_reply: true };
  }
  return await sendEngageReply(id, row.draft); // send
}

// /find <키워드> — 키워드로 공개글 검색 → 후보 카드 발송(사람이 골라 답글)
export async function findAndQueue(keyword, chatId, topic = 'life') {
  const kw = String(keyword || '').trim();
  if (!kw) return '사용법: <code>/find 키워드</code> (예: <code>/find 재테크</code>)';
  const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
  if (!acct?.access_token) return `❌ '${escapeHtml(topic)}' 계정 토큰 없음`;
  let results = [];
  try {
    // TAG(토픽) 우선 → 없으면 KEYWORD RECENT → TOP 순 폴백 (recall 최대화)
    results = await keywordSearch(acct, kw, { searchMode: 'TAG', searchType: 'RECENT', limit: 20 });
    if (!results.length) results = await keywordSearch(acct, kw, { searchMode: 'KEYWORD', searchType: 'RECENT', limit: 20 });
    if (!results.length) results = await keywordSearch(acct, kw, { searchMode: 'KEYWORD', searchType: 'TOP', limit: 20 });
  } catch (e) { return `❌ 검색 실패: ${escapeHtml(e.message)}`; }
  if (!results.length) return `'${escapeHtml(kw)}' 검색 결과 없음.`;
  let sent = 0;
  for (const p of results) {
    if (!p.id || !p.text) continue;
    if (await engageExists(p.id)) continue;
    const draft = await draftEngageReply(p.text).catch(() => '');
    let row;
    try { row = await insertEngage({ account_id: acct.id, post_id: p.id, post_text: p.text || '', post_user: p.username || '', permalink: p.permalink || '', draft: draft || null }); }
    catch { continue; }
    const card = engageCard(row);
    await tg('sendMessage', { chat_id: chatId, text: card.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: card.reply_markup }).catch(() => {});
    sent++;
    if (sent >= 8) break; // 한 번에 8개까지(도배 방지)
  }
  return sent
    ? `🔎 '${escapeHtml(kw)}' — 후보 ${sent}개 보냈어. 골라서 ✍️ 답글 달아줘 (스팸 X, 진심 답글만 🐶)`
    : `'${escapeHtml(kw)}' 새 후보 없음(이미 봤거나 텍스트 글 없음).`;
}

// ── 타래 올리기 안내문 ──
export function newThreadPrompt(topic = 'life') {
  return [
    `🧵 <b>[${escapeHtml(topic)}] 타래 붙여넣기</b>`,
    '',
    '• 편 구분: 줄 하나에 <code>---</code> 만',
    '• 링크(선택): 아무 줄에 <code>링크: https://...</code> → 첫 댓글로 자동 게시',
    '• 편당 500자 이하 (Threads 한도)',
    '',
    '예시:',
    '<code>1편 훅 문장\n---\n2편 내용\n---\n3편 마무리\n링크: https://...</code>',
    '',
    '아래 입력창에 통째로 붙여넣어 보내줘. (취소 /cancel)',
  ].join('\n');
}

// ── 타래 초안 파싱 + 큐 insert → 미리보기 카드 ──
export async function createThreadDraft(topic, rawText) {
  const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
  if (!acct) return { note: `❌ '${escapeHtml(topic)}' 활성 계정이 없어.` };

  // 링크 줄 추출(있으면) 후 본문에서 제거
  let linkUrl = null;
  const lines = String(rawText || '').split('\n');
  const kept = [];
  for (const ln of lines) {
    const m = /^\s*링크\s*[:：]\s*(\S+)/.exec(ln);
    if (m && !linkUrl) { linkUrl = m[1]; continue; }
    kept.push(ln);
  }
  const segs = splitThread(kept.join('\n'));
  if (!segs.length) return { note: '❌ 편이 하나도 없어. `---`로 구분해서 다시 보내줘.' };

  const tooLong = segs.map((s, i) => (s.length > 500 ? i + 1 : 0)).filter(Boolean);
  const warn = tooLong.length ? `\n⚠️ ${tooLong.join('·')}편이 500자 초과 — 발행 시 잘릴 수 있어.` : '';

  const row = await insertQueue({
    account_id: acct.id,
    text: segs.join('\n---\n'),
    link_kind: 'thread',
    link_url: linkUrl,
    status: 'draft',
  });
  const card = threadsCard(row);
  return { card, note: `🧵 타래 초안 #${row.id} 저장됨 (${segs.length}편${linkUrl ? ' + 링크' : ''}).${warn}` };
}

// ── 프리셋 타래 → 큐 삽입(초안) ──
export async function seedPreset(id) {
  const p = getPreset(id);
  if (!p) return { note: `❌ 프리셋 '${escapeHtml(id)}' 없음.` };
  // preset.topic 활성계정 우선, 없으면 첫 활성계정 폴백
  let acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(p.topic || '')}&active=eq.true&limit=1`))[0];
  let note = '';
  if (!acct) {
    acct = (await getAccounts(true))[0];
    if (!acct) return { note: '❌ 활성 Threads 계정이 없어. OAuth로 먼저 연결해줘.' };
    note = `⚠️ '${escapeHtml(p.topic || '?')}' 계정이 없어 <b>${escapeHtml(acct.topic)}</b> 계정으로 담았어(니치 확인!).\n`;
  }
  const segs = (p.segments || []).map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return { note: `❌ 프리셋 '${escapeHtml(id)}'에 편이 없음.` };
  const row = await insertQueue({
    account_id: acct.id,
    text: segs.join('\n---\n'),
    link_kind: 'thread',
    link_url: p.link || null,
    status: 'draft',
  });
  const card = threadsCard(row);
  return { card, note: `${note}📥 <b>${escapeHtml(p.label)}</b> → 큐 초안 #${row.id} (${segs.length}편${p.link ? ' + 링크' : ''}). 4편↑은 ⏰예약 추천.` };
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
  // 메뉴
  if (data === 'thr:menu') return threadsMenu();
  if (data === 'thr:insights') return { text: await threadsInsightsMessage(7) };
  if (data === 'thr:cmds') {
    return {
      text: [
        '🧵 <b>Threads 명령어</b>',
        '• <code>/threads</code> — 이 메뉴',
        '• <code>/threads queue life</code> — 큐 목록',
        '• <code>/post &lt;내용&gt;</code> — 즉석 발행',
        '• <code>/find &lt;키워드&gt;</code> — 답글 후보 찾기',
        '• <code>/threads insights [일수]</code> — 성과',
        '• <code>/threads gen life 2</code> — AI 초안 생성',
      ].join('\n'),
      reply_markup: { inline_keyboard: [[{ text: '◀ 메뉴', callback_data: 'thr:menu' }]] },
    };
  }
  if (data === 'thr:find') {
    await setState(chatId, { flow: 'engage_find' });
    return { text: '🔎 검색할 키워드를 보내줘 (예: 재테크 · 전세 · 여행). 관련 공개글 후보를 찾아줄게.', force_reply: true };
  }
  // 타래 올리기 — 활성 계정 1개면 바로 입력, 2+개면 토픽 선택
  if (data === 'thr:newthread') {
    const accts = await getAccounts(true);
    if (!accts.length) return { text: '❌ 연결된 활성 Threads 계정이 없어. OAuth로 먼저 연결해줘.' };
    if (accts.length === 1) {
      await setState(chatId, { flow: 'threads_newthread', topic: accts[0].topic });
      return { text: newThreadPrompt(accts[0].topic), force_reply: true };
    }
    return {
      text: '🧵 어느 계정에 올릴 타래야?',
      reply_markup: { inline_keyboard: [accts.map((a) => ({ text: escapeHtml(a.topic), callback_data: `thr:nt:${a.topic}` }))] },
    };
  }
  if ((mm = /^thr:nt:(.+)$/.exec(data || ''))) {
    await setState(chatId, { flow: 'threads_newthread', topic: mm[1] });
    return { text: newThreadPrompt(mm[1]), force_reply: true };
  }
  // 미리 만든 타래 프리셋 목록
  if (data === 'thr:presets') {
    if (!THREAD_PRESETS.length) return { text: '등록된 프리셋 타래가 없어. 코드 _threads-presets.js에 추가해줘.' };
    const kb = THREAD_PRESETS.map((p) => [{ text: `📥 ${p.label}`, callback_data: `thr:seed:${p.id}` }]);
    kb.push([{ text: '◀ 메뉴', callback_data: 'thr:menu' }]);
    return { text: '📥 <b>만든 타래</b> — 누르면 큐에 초안으로 담아줄게.', reply_markup: { inline_keyboard: kb } };
  }
  // 프리셋 → 큐 삽입(초안) → 미리보기 카드
  if ((mm = /^thr:seed:(.+)$/.exec(data || ''))) {
    const out = await seedPreset(mm[1]);
    return out.card ? { text: `${out.note}\n\n${out.card.text}`, reply_markup: out.card.reply_markup } : { text: out.note };
  }
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

// ── 댓글 알림 카드 ──
// 2026-07-31 변경: 기존엔 [이대로/답장/무시] 버튼으로 텔레그램에서 처리했는데,
// 대댓글은 15분 스케줄러가 자동으로 단다. 버튼이 남아 있으면 이미 자동발행된 건에
// 사람이 또 눌러 중복 답글이 나갈 수 있다 → 조작 버튼을 없애고 **보러 가기 링크**만 둔다.
export function threadsReplyCard(row) {
  const d = row.draft
    ? `\n\n<b>자동 답변 예정</b>\n${escapeHtml(row.draft)}`
    : '\n\n<i>초안 생성 대기 — 스케줄러가 처리합니다</i>';
  const text = `💬 <b>새 댓글</b> @${escapeHtml(row.comment_user || '?')}\n${escapeHtml(row.comment_text || '')}${d}`;
  const url = row.permalink || '';
  return {
    text,
    reply_markup: { inline_keyboard: url ? [[{ text: '🧵 스레드에서 보기', url }]] : [] },
  };
}

// ── 자동 대댓글 발행 알림 ──
// 스케줄러가 조용히 답글을 달면 무엇이 나갔는지 알 수 없다 → 사후 확인용으로 보낸다.
// 조작 버튼 없음(이미 나간 뒤라 되돌릴 수 없다. Threads API 엔 수정 엔드포인트가 없다).
export function threadsAutoReplyCard(row, { permalink = '' } = {}) {
  const text =
    `🤖 <b>자동 대댓글 발행</b>\n\n` +
    `<b>받은 댓글</b> @${escapeHtml(row.comment_user || '?')}\n${escapeHtml(row.comment_text || '')}\n\n` +
    `<b>보낸 답글</b>\n${escapeHtml(row.draft || '')}`;
  const url = permalink;
  return {
    text,
    reply_markup: { inline_keyboard: url ? [[{ text: '🧵 스레드에서 보기', url }]] : [] },
  };
}

// 대댓글 실제 발행 (텔레그램 콜백/플로우 · 크론 자동발행 · admin API 공용)
// auto=true면 자동발행분으로 표시 → 일일 캡 계산과 사후 감사에 쓰인다.
export async function sendReply(id, text, { auto = false } = {}) {
  const row = await getReply(id);
  if (!row) return { text: `댓글 #${id} 없음(이미 처리됨?)`, ok: false };
  if (!text || !text.trim()) return { text: `❌ 빈 답변이라 취소.`, ok: false };
  const account = (await sb(`threads_accounts?id=eq.${row.account_id}&limit=1`))[0];
  if (!account?.access_token) return { text: `❌ 계정 토큰 없음 (account_id=${row.account_id})`, ok: false };
  try {
    const mediaId = await publishReply(account, { text, replyToId: row.comment_id });
    await updateReply(id, { status: 'sent', reply_media_id: mediaId, sent_at: new Date().toISOString(), auto });
    // 자동 발행분은 사람이 본 적이 없다 → 무엇이 나갔는지 사후 통지한다.
    // 알림 실패가 발행 성공을 뒤집으면 안 되므로 catch 로 삼킨다.
    if (auto) {
      try {
        const permalink = await getPermalink(account, row.root_media_id);
        const card = threadsAutoReplyCard({ ...row, draft: text }, { permalink });
        await tg('sendMessage', {
          chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID, text: card.text,
          parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: card.reply_markup,
        });
      } catch { /* 알림 실패는 무시 */ }
    }
    return { text: `✅ 대댓글 발행 완료 (#${id})`, ok: true, mediaId };
  } catch (e) {
    await updateReply(id, { status: 'failed', error: e.message });
    return { text: `❌ 발행 실패 #${id}: ${escapeHtml(e.message)}`, ok: false, error: e.message };
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
  if (st.flow === 'threads_newthread') {
    await clearState(chatId);
    return await createThreadDraft(st.topic || 'life', text);
  }
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
  if (st.flow === 'engage_reply') {
    await clearState(chatId);
    const out = await sendEngageReply(st.engageId, text);
    return { note: out.text };
  }
  if (st.flow === 'engage_find') {
    await clearState(chatId);
    const summary = await findAndQueue(text, chatId);
    return { note: summary };
  }
  return null;
}
