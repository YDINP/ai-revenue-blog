// 핫타임 알림 — 골든타임에 호출. 큐 초안 안내 + 마커 세팅 + 텔레그램 알림.
// 10분 뒤 threads-hottime-resolve 가 미상호작용 시 랜덤 자동발행. CRON_SECRET 보호.
import { sb } from './_threads.js';
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

  const drafts = await sb(`threads_queue?status=eq.draft&account_id=eq.${acct.id}&select=id&limit=100`);
  if (!drafts.length) {
    if (chatId) await tg('sendMessage', { chat_id: chatId, text: '🔥 핫타임인데 큐에 초안이 없어! <code>/threads gen life 2</code> 로 채워줘.', parse_mode: 'HTML' }).catch(() => {});
    return res.status(200).json({ ok: true, drafts: 0 });
  }

  await sb(`threads_accounts?id=eq.${acct.id}`, { method: 'PATCH', body: { hottime_started_at: new Date().toISOString() } });
  if (chatId) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: `🔥 <b>지금 핫타임이야!</b> (초안 ${drafts.length}개 대기)\n\n<b>10분 안에 아무것도 안 하면</b> 큐에서 랜덤으로 하나 자동 발행할게 🐶`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '📋 큐 보기', callback_data: 'ht:queue' },
          { text: '⏭ 패스', callback_data: 'ht:pass' },
        ]],
      },
    }).catch(() => {});
  }
  return res.status(200).json({ ok: true, drafts: drafts.length });
}
