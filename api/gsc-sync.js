// GSC → Supabase 동기화 엔드포인트 (수동 백필/재동기화)
//   /api/gsc-sync?days=30&secret=<CRON_SECRET>   또는  Authorization: Bearer <CRON_SECRET>
import { syncGsc } from './_gsc-sync.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url, 'http://x');
  const token =
    url.searchParams.get('secret') || (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (secret && token !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '5', 10) || 5, 1), 90);
  try {
    const result = await syncGsc({ days });
    return res.status(200).json({ ok: true, days, ...result });
  } catch (e) {
    console.error('gsc-sync error:', e);
    return res.status(500).json({ error: e.message });
  }
}
