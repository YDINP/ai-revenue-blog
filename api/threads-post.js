// 즉석 발행 API (자동화/관리자용). CRON_SECRET 보호.
// POST { text, topic?, linkUrl? }  또는  ?text=&topic=
// 큐 안 거치고 바로 Threads 발행. linkUrl 주면 첫 댓글로 자동 첨부.
import { sb, publish, publishReply, insertPost } from './_threads.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const b = req.body || {};
  const topic = b.topic || req.query?.topic || 'life';
  const text = (b.text || req.query?.text || '').trim();
  const linkUrl = b.linkUrl || req.query?.linkUrl || '';
  if (!text) return res.status(400).json({ error: 'no text' });

  const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
  if (!acct?.access_token) return res.status(400).json({ error: `no account token for topic=${topic}` });

  try {
    const mediaId = await publish(acct, { text });
    if (linkUrl) await publishReply(acct, { text: `전문 👇\n${linkUrl}`, replyToId: mediaId }).catch(() => {});
    await insertPost({ account_id: acct.id, threads_media_id: mediaId }).catch(() => {});
    await sb(`threads_accounts?id=eq.${acct.id}`, { method: 'PATCH', body: { hottime_started_at: null } }).catch(() => {});
    return res.status(200).json({ ok: true, mediaId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
