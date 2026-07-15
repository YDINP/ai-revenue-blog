// 핫타임 10분 후 해결 — hottime_started_at 가 아직 set이면(=미상호작용) 큐 랜덤 발행.
// 사용자가 발행/예약했으면 마커가 null이라 skip. CRON_SECRET 보호.
import { sb, publishDraft } from './_threads.js';
import { tg, escapeHtml } from './_shared.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const topic = req.query?.topic || 'life';
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
  if (!acct) return res.status(404).json({ error: 'account not found' });

  const msgId = acct.hottime_msg_id;
  // 핫타임 알림 메시지를 '완료'로 편집(버튼 제거). msgId 없으면 새 메시지로.
  const notifyDone = async (text) => {
    if (!chatId) return;
    if (msgId) {
      const ok = await tg('editMessageText', { chat_id: chatId, message_id: Number(msgId), text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: [] } }).then((r) => r?.ok).catch(() => false);
      if (ok) return;
    }
    await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
  };

  // 마커 없으면 = 사용자가 상호작용함(발행/예약) 또는 창 없음
  if (!acct.hottime_started_at) {
    if (msgId) { await notifyDone('✅ 핫타임 종료 — 직접 처리함.'); await sb(`threads_accounts?id=eq.${acct.id}`, { method: 'PATCH', body: { hottime_msg_id: null } }); }
    return res.status(200).json({ ok: true, skipped: 'interacted_or_no_window' });
  }

  // 이 시간대(최근 20분)에 이미 글이 나갔으면(예약 타래·수동 발행 등) 중복 자동발행 skip
  const recentSince = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const already = await sb(`threads_posts?account_id=eq.${acct.id}&published_at=gte.${recentSince}&select=id&limit=1`);
  if (already.length) {
    await sb(`threads_accounts?id=eq.${acct.id}`, { method: 'PATCH', body: { hottime_started_at: null, hottime_msg_id: null } });
    await notifyDone('✅ 핫타임 종료 — 이 시간대에 이미 글(예약 등)이 나가서 자동발행은 건너뜀.');
    return res.status(200).json({ ok: true, skipped: 'already_posted' });
  }

  const drafts = await sb(`threads_queue?status=eq.draft&account_id=eq.${acct.id}&select=*`);
  // 마커·메시지id 클리어(다음 창을 위해)
  await sb(`threads_accounts?id=eq.${acct.id}`, { method: 'PATCH', body: { hottime_started_at: null, hottime_msg_id: null } });
  if (!drafts.length) { await notifyDone('🔥 핫타임 종료 — 큐가 비어 자동발행 못 함. <code>/threads gen life 2</code>'); return res.status(200).json({ ok: true, skipped: 'no_drafts' }); }

  const pick = drafts[Math.floor(Math.random() * drafts.length)];
  try {
    const mediaId = await publishDraft(acct, pick);
    await notifyDone(`✅ 핫타임 종료 — 10분 무응답이라 큐에서 <b>자동 발행</b>했어 (#${pick.id}${pick.link_url ? ', 링크=첫 댓글' : ''}) 🐶\n\n${escapeHtml(pick.text.slice(0, 80))}…`);
    return res.status(200).json({ ok: true, published: pick.id, mediaId });
  } catch (e) {
    await sb(`threads_queue?id=eq.${pick.id}`, { method: 'PATCH', body: { status: 'failed', error: e.message } });
    await notifyDone(`❌ 핫타임 자동발행 실패 #${pick.id}: ${escapeHtml(e.message)}`);
    return res.status(500).json({ error: e.message });
  }
}
