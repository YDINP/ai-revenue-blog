// 핫타임 10분 후 해결 — hottime_started_at 가 아직 set이면(=미상호작용) 큐 랜덤 발행.
// 사용자가 발행/예약했으면 마커가 null이라 skip. CRON_SECRET 보호.
import { sb, publishDraft } from './_threads.js';
import { tg } from './_shared.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const topic = req.query?.topic || 'life';
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
  if (!acct) return res.status(404).json({ error: 'account not found' });

  // 마커 없으면 = 사용자가 상호작용함(발행/예약) 또는 창 없음 → skip
  if (!acct.hottime_started_at) return res.status(200).json({ ok: true, skipped: 'interacted_or_no_window' });

  const drafts = await sb(`threads_queue?status=eq.draft&account_id=eq.${acct.id}&select=*`);
  // 마커는 결과와 무관하게 클리어(다음 창을 위해)
  await sb(`threads_accounts?id=eq.${acct.id}`, { method: 'PATCH', body: { hottime_started_at: null } });
  if (!drafts.length) return res.status(200).json({ ok: true, skipped: 'no_drafts' });

  const pick = drafts[Math.floor(Math.random() * drafts.length)];
  try {
    const mediaId = await publishDraft(acct, pick);
    if (chatId) await tg('sendMessage', {
      chat_id: chatId,
      text: `⏰ 10분간 조용해서 큐에서 <b>랜덤 자동발행</b>했어 (#${pick.id}${pick.link_url ? ', 링크=첫 댓글' : ''}) 🐶\n\n${pick.text.slice(0, 80)}…`,
      parse_mode: 'HTML', disable_web_page_preview: true,
    }).catch(() => {});
    return res.status(200).json({ ok: true, published: pick.id, mediaId });
  } catch (e) {
    await sb(`threads_queue?id=eq.${pick.id}`, { method: 'PATCH', body: { status: 'failed', error: e.message } });
    if (chatId) await tg('sendMessage', { chat_id: chatId, text: `❌ 랜덤 자동발행 실패 #${pick.id}: ${e.message}`, parse_mode: 'HTML' }).catch(() => {});
    return res.status(500).json({ error: e.message });
  }
}
