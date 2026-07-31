// GH Actions 생성기 → 이 엔드포인트 호출 → 새 초안을 텔레그램 승인카드로 발송.
// CRON_SECRET 로 보호(생성기가 헤더로 전달). 텔레그램 토큰은 Vercel에만 존재.
import { tgThreads as tg } from './_shared.js';
import { sb } from './_threads.js';
import { threadsCard } from './_threads-bot.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers['x-cron-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'no_ids' });

  const rows = await sb(`threads_queue?id=in.(${ids.map(Number).join(',')})&select=*&order=id`);
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  let sent = 0;
  await tg('sendMessage', { chat_id: chatId, text: `🧵 새 Threads 초안 ${rows.length}개 도착 — 검토해주세요.`, parse_mode: 'HTML' });
  for (const row of rows) {
    const card = threadsCard(row);
    const r = await tg('sendMessage', {
      chat_id: chatId, text: card.text, parse_mode: 'HTML',
      disable_web_page_preview: true, reply_markup: card.reply_markup,
    });
    if (r.ok) sent++;
  }
  return res.status(200).json({ ok: true, sent });
}
