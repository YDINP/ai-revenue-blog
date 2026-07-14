// /find 트리거 API (테스트/자동화용). CRON_SECRET 보호.
// ?q=키워드 → keyword_search → 후보 카드를 관리자 텔레그램으로 발송.
import { findAndQueue } from './_threads-bot.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const q = req.query?.q || req.body?.q || '';
  const topic = req.query?.topic || req.body?.topic || 'life';
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  try {
    const summary = await findAndQueue(q, chatId, topic);
    return res.status(200).json({ ok: true, summary });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
