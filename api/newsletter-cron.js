// 뉴스레터 발송 엔드포인트 (수동/크론)
//   /api/newsletter-cron?secret=<CRON_SECRET>   또는  Authorization: Bearer <CRON_SECRET>
//   최근 48h 신규글을 블로그별 구독자에게 Resend로 발송. 중복은 newsletter_sends로 방지.
import { runNewsletter } from './_newsletter.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url, 'http://x');
  const token =
    url.searchParams.get('secret') || (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (secret && token !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const result = await runNewsletter();
    return res.status(200).json({ ok: true, result });
  } catch (e) {
    console.error('newsletter-cron error:', e);
    return res.status(500).json({ error: e.message });
  }
}
