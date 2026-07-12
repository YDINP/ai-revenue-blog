// 매일 아침 9시(KST) 전날 종합 리포트 → 텔레그램
// Vercel Cron 이 호출 (vercel.json: "0 0 * * *" UTC = 09:00 KST)
// 수동 확인: 봇에서 /report [YYYY-MM-DD]

import { escapeHtml, sendToAdmin } from './_shared.js';
import { reportMessage } from './_report.js';

export default async function handler(req, res) {
  // Vercel Cron 은 CRON_SECRET 이 설정돼 있으면 Authorization: Bearer <secret> 를 보냄
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const text = await reportMessage();          // 기본 = 어제(KST)
    const r = await sendToAdmin(text);
    return res.status(200).json({ ok: !!r.ok });
  } catch (e) {
    console.error('daily-report error:', e);
    await sendToAdmin(`⚠️ 일일 리포트 생성 실패: ${escapeHtml(e.message)}`).catch(() => {});
    return res.status(500).json({ error: e.message });
  }
}
