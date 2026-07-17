// 매일 아침 9시(KST) 전날 종합 리포트 → 텔레그램
//
// 호출자: GitHub Actions (.github/workflows/daily-report.yml, cron '0 0 * * *' UTC)
// Vercel Hobby 의 cron 은 지정 시각에서 최대 1시간 지연돼 09시 발송이 보장되지 않아 옮겼다.
// 수동 확인: 봇에서 /report [YYYY-MM-DD]

import { escapeHtml, sendToAdmin, supabaseRpc } from './_shared.js';
import { reportMessage } from './_report.js';
import { syncGsc } from './_gsc-sync.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    // 봇 트래픽 플래그(같은 UA 반복접속·선언형 봇 → event_type=pageview_bot) — best-effort
    await supabaseRpc('flag_bot_pageviews', {}).catch((e) => console.error('bot flag (report):', e.message));
    // GSC 검색 실적을 Supabase(gsc_daily)에 저장 — best-effort(실패해도 리포트는 진행)
    await syncGsc({ days: 5 }).catch((e) => console.error('gsc sync (report):', e.message));

    // ?day=YYYY-MM-DD 로 특정 날짜 재발송 (워크플로 수동 실행용). 기본 = 어제(KST)
    const day = new URL(req.url, 'http://x').searchParams.get('day') || undefined;
    const text = await reportMessage(/^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day : undefined);
    const r = await sendToAdmin(text);
    return res.status(200).json({ ok: !!r.ok });
  } catch (e) {
    console.error('daily-report error:', e);
    await sendToAdmin(`⚠️ 일일 리포트 생성 실패: ${escapeHtml(e.message)}`).catch(() => {});
    return res.status(500).json({ error: e.message });
  }
}
