// 매일 아침 9시(KST) 전날 종합 리포트 → 텔레그램
//
// 호출자: GitHub Actions (.github/workflows/daily-report.yml, cron '0 0 * * *' UTC)
// Vercel Hobby 의 cron 은 지정 시각에서 최대 1시간 지연돼 09시 발송이 보장되지 않아 옮겼다.
// 수동 확인: 봇에서 /report [YYYY-MM-DD]

import { escapeHtml, sendToAdmin, supabaseRpc, sourceLabel } from './_shared.js';
import { reportMessage } from './_report.js';
import { syncGsc } from './_gsc-sync.js';
import { runNewsletter, unsubscribe } from './_newsletter.js';

// 구독 취소 확인 페이지 (메일의 '구독 취소' 링크가 이 함수로 옴 — Hobby 12함수 제한 통합)
function unsubPage(title, msg) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:'Apple SD Gothic Neo',system-ui,sans-serif;background:#f5f6f4;color:#1a1712;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:16px;padding:40px 32px;max-width:400px;text-align:center;box-shadow:0 12px 30px -14px rgba(30,107,92,.35)}
h1{color:#1e6b5c;font-size:1.3rem;margin:0 0 8px}p{color:#5f5a51;line-height:1.6;margin:0}</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${msg}</p></div></body></html>`;
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');

  // ── 뉴스레터 구독 취소 (공개, 인증 전) ──
  if (url.searchParams.get('action') === 'unsubscribe') {
    const source = url.searchParams.get('source') || '';
    const email = url.searchParams.get('email') || '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    try {
      if (!source || !email) return res.status(400).send(unsubPage('요청 오류', '구독 취소 정보가 올바르지 않습니다.'));
      const n = await unsubscribe(source, email);
      const label = sourceLabel ? sourceLabel(source) : source;
      return res.status(200).send(
        n > 0
          ? unsubPage('구독이 취소되었습니다', `${escapeHtml(label)} 뉴스레터 발송을 중단했어요. 언제든 다시 구독하실 수 있습니다.`)
          : unsubPage('이미 취소됨', '해당 이메일은 이미 구독 취소 상태이거나 목록에 없습니다.')
      );
    } catch (e) {
      console.error('unsubscribe error:', e);
      return res.status(500).send(unsubPage('오류', '잠시 후 다시 시도해 주세요.'));
    }
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    // 봇 트래픽 플래그(같은 UA 반복접속·선언형 봇 → event_type=pageview_bot) — best-effort
    await supabaseRpc('flag_bot_pageviews', {}).catch((e) => console.error('bot flag (report):', e.message));
    // GSC 검색 실적을 Supabase(gsc_daily)에 저장 — best-effort(실패해도 리포트는 진행)
    await syncGsc({ days: 5 }).catch((e) => console.error('gsc sync (report):', e.message));
    // 새 글(최근 48h) 뉴스레터 발송 — 월·수·금 09시(KST)만. best-effort(GMAIL env 없으면 스킵)
    //   daily-report 는 매일 09시(KST=00:00 UTC) 실행되므로 KST 요일로 게이트한다.
    const kstDow = new Date(Date.now() + 9 * 3600 * 1000).getUTCDay(); // 0=일 … 1=월,3=수,5=금
    if ([1, 3, 5].includes(kstDow)) {
      await runNewsletter().catch((e) => console.error('newsletter (report):', e.message));
    }

    // ?day=YYYY-MM-DD 로 특정 날짜 재발송 (워크플로 수동 실행용). 기본 = 어제(KST)
    const day = url.searchParams.get('day') || undefined;
    const text = await reportMessage(/^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day : undefined);
    const r = await sendToAdmin(text);
    return res.status(200).json({ ok: !!r.ok });
  } catch (e) {
    console.error('daily-report error:', e);
    await sendToAdmin(`⚠️ 일일 리포트 생성 실패: ${escapeHtml(e.message)}`).catch(() => {});
    return res.status(500).json({ error: e.message });
  }
}
