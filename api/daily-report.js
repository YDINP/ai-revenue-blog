// 매일 아침 9시(KST) 전날 종합 리포트 → 텔레그램
//
// 호출자: GitHub Actions (.github/workflows/daily-report.yml, cron '0 0 * * *' UTC)
// Vercel Hobby 의 cron 은 지정 시각에서 최대 1시간 지연돼 09시 발송이 보장되지 않아 옮겼다.
// 수동 확인: 봇에서 /report [YYYY-MM-DD]

import { escapeHtml, sendToAdmin, supabaseRpc, sourceLabel } from './_shared.js';
import { reportMessage } from './_report.js';
import { syncGsc } from './_gsc-sync.js';
import { syncGa4 } from './_ga4-sync.js';
import { runNewsletter, unsubscribe, sendCopyLatest, changeEmail, sbn } from './_newsletter.js';

// 구독 취소 확인 페이지 (메일의 '구독 취소' 링크가 이 함수로 옴 — Hobby 12함수 제한 통합)
function unsubPage(title, msg) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:'Apple SD Gothic Neo',system-ui,sans-serif;background:#f5f6f4;color:#1a1712;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:16px;padding:40px 32px;max-width:400px;text-align:center;box-shadow:0 12px 30px -14px rgba(30,107,92,.35)}
h1{color:#1e6b5c;font-size:1.3rem;margin:0 0 8px}p{color:#5f5a51;line-height:1.6;margin:0}</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${msg}</p></div></body></html>`;
}

// 이메일 변경 입력 폼 (메일의 '이메일 변경' 링크가 이 함수로 옴)
function changeEmailForm(source, email, err) {
  const q = `action=change-email&source=${encodeURIComponent(source)}&email=${encodeURIComponent(email)}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>구독 이메일 변경</title>
<style>body{font-family:'Apple SD Gothic Neo',system-ui,sans-serif;background:#f5f6f4;color:#1a1712;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:16px;padding:40px 32px;max-width:400px;width:calc(100% - 32px);box-shadow:0 12px 30px -14px rgba(30,107,92,.35)}
h1{color:#1e6b5c;font-size:1.3rem;margin:0 0 8px;text-align:center}p{color:#5f5a51;line-height:1.6;margin:0 0 18px;text-align:center;font-size:.92rem}
label{display:block;font-size:.8rem;color:#938d80;margin:0 0 6px}
input{width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #e6e3dd;border-radius:9px;font-size:.95rem;margin-bottom:14px}
button{width:100%;padding:12px;border:0;border-radius:9px;background:#1e6b5c;color:#fff;font-size:.95rem;font-weight:700;cursor:pointer}
.err{color:#c0392b;font-size:.85rem;margin:0 0 12px;text-align:center}</style></head>
<body><div class="card"><h1>구독 이메일 변경</h1>
<p>새로 받으실 주소를 입력하시면 이후 뉴스레터가 그 주소로 발송됩니다.</p>
${err ? `<div class="err">${escapeHtml(err)}</div>` : ''}
<form method="GET" action="/api/daily-report">
  <input type="hidden" name="action" value="change-email">
  <input type="hidden" name="source" value="${escapeHtml(source)}">
  <input type="hidden" name="email" value="${escapeHtml(email)}">
  <label>현재 주소</label>
  <input type="email" value="${escapeHtml(email)}" disabled>
  <label>새 주소</label>
  <input type="email" name="new" placeholder="변경할 이메일 주소" required autocomplete="email">
  <button type="submit">변경하기</button>
</form>
<p style="margin:14px 0 0;font-size:.78rem;color:#938d80">문제가 있으면 이 메일에 회신해 주세요. (<a href="/api/daily-report?${q}&amp;_=1" style="color:#938d80">새로고침</a>)</p>
</div></body></html>`;
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

  // ── 뉴스레터 구독 이메일 변경 (공개, 인증 전) ──
  // 신뢰모델은 구독 취소 링크와 동일: 링크는 구독자 본인 메일함에만 들어간다.
  if (url.searchParams.get('action') === 'change-email') {
    const source = url.searchParams.get('source') || '';
    const email = url.searchParams.get('email') || '';
    const next = (url.searchParams.get('new') || '').trim();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!source || !email) return res.status(400).send(unsubPage('요청 오류', '구독 정보가 올바르지 않습니다.'));
    if (!next) return res.status(200).send(changeEmailForm(source, email));   // 폼 표시
    try {
      const r = await changeEmail(source, email, next);
      const label = sourceLabel ? sourceLabel(source) : source;
      if (r === 'same') return res.status(200).send(changeEmailForm(source, email, '현재 주소와 동일합니다.'));
      if (r === 'notfound') return res.status(200).send(unsubPage('구독 정보를 찾을 수 없음', '이미 구독이 취소되었거나 목록에 없는 주소입니다.'));
      return res.status(200).send(
        unsubPage(
          '이메일이 변경되었습니다',
          r === 'merged'
            ? `${escapeHtml(label)} 뉴스레터를 <b>${escapeHtml(next)}</b> 로 보내드립니다. (이미 구독 중이던 주소라 하나로 합쳤어요)`
            : `${escapeHtml(label)} 뉴스레터를 이제 <b>${escapeHtml(next)}</b> 로 보내드립니다.`
        )
      );
    } catch (e) {
      if (/invalid email/.test(e.message || '')) {
        return res.status(200).send(changeEmailForm(source, email, '이메일 주소 형식이 올바르지 않습니다.'));
      }
      console.error('change-email error:', e);
      return res.status(500).send(unsubPage('오류', '잠시 후 다시 시도해 주세요.'));
    }
  }

  // ── 뉴스레터 구독 (공개, 인증 전) — mungge.com 인라인 폼에서 POST ──
  if (url.searchParams.get('action') === 'subscribe') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); return res.status(204).end(); }
    const email = (url.searchParams.get('email') || '').trim().toLowerCase();
    const source = url.searchParams.get('source') === 'lifeflow' ? 'lifeflow' : 'blog';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'invalid email' });
    try {
      const enc = encodeURIComponent(email);
      const existing = await sbn(`newsletter_subscribers?source=eq.${source}&email=eq.${enc}&select=email`);
      if (existing.length) {
        await sbn(`newsletter_subscribers?source=eq.${source}&email=eq.${enc}`, { method: 'PATCH', body: { is_active: true }, prefer: 'return=minimal' });
      } else {
        await sbn('newsletter_subscribers', { method: 'POST', body: { source, email, is_active: true }, prefer: 'return=minimal' });
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('subscribe error:', e);
      return res.status(500).json({ ok: false, error: 'server' });
    }
  }

  // ── 금 시세 프록시 (공개) — mungge.com /tools/gold-price-calculator/ 가 호출한다 ──
  // 한국금거래소(koreagoldx.co.kr)의 /api/main 은 Access-Control-Allow-Origin 을 주지 않아
  // 브라우저에서 직접 읽을 수 없다. 고시가는 하루 몇 번만 갱신되므로 엣지에서 10분 캐시해
  // 원본 부하를 없앤다. 신규 Vercel 함수를 만들지 않고 여기에 얹은 이유는 Hobby 12함수 제한.
  if (url.searchParams.get('action') === 'gold-price') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); return res.status(204).end(); }
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    try {
      const r = await fetch('https://www.koreagoldx.co.kr/api/main', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
          Accept: 'application/json',
          Referer: 'https://www.koreagoldx.co.kr/',
        },
      });
      if (!r.ok) throw new Error(`koreagoldx ${r.status}`);
      const j = await r.json();
      const o = j.officialPrice4 || {};
      // s_=내가 살 때(VAT포함) / p_=내가 팔 때, turm_=전일대비 금액, per_=전일대비 %
      const row = (k) => ({
        buy: num(o[`s_${k}`]), sell: num(o[`p_${k}`]),
        buyDiff: num(o[`turm_s_${k}`]), sellDiff: num(o[`turm_p_${k}`]),
        buyPct: num(o[`per_s_${k}`]), sellPct: num(o[`per_p_${k}`]),
      });
      const au = (j.marketPriceList || []).find((m) => m.type === 'au') || {};
      const out = {
        ok: true,
        source: '한국금거래소',
        asof: o.date || j.date || null,
        unitGram: 3.75,                       // 고시가는 3.75g(1돈) 단위
        prices: { pure: row('pure'), k18: row('18k'), k14: row('14k'), white: row('white'), silver: row('silver') },
        intl: { usdPerOz: num(au.ask), krwPerGram: num(au.priceGram) },
      };
      if (!out.prices.pure.buy || !out.prices.pure.sell) throw new Error('official price empty');
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      return res.status(200).json(out);
    } catch (e) {
      console.error('gold-price error:', e.message);
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(502).json({ ok: false, error: 'upstream', detail: String(e.message || e).slice(0, 200) });
    }
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // ── 구독자 목록 조회 / 삭제 (관리자) ──
  // 배달 불가 주소(테스트로 들어간 @example.com 등)는 매 발송마다 반송메일을 만들고
  // Gmail 발신 평판도 깎으므로 목록에서 실제로 지울 수단이 필요하다.
  if (url.searchParams.get('action') === 'subscribers') {
    try {
      const rows = await sbn('newsletter_subscribers?select=source,email,is_active&order=source');
      return res.status(200).json({ ok: true, count: rows.length, rows });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  if (url.searchParams.get('action') === 'subscriber-delete') {
    const email = (url.searchParams.get('email') || '').trim().toLowerCase();
    const source = url.searchParams.get('source') || '';   // 생략 시 전 소스에서 삭제
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      const q = `newsletter_subscribers?email=eq.${encodeURIComponent(email)}` +
        (source ? `&source=eq.${encodeURIComponent(source)}` : '');
      const gone = await sbn(q, { method: 'DELETE', prefer: 'return=representation' });
      return res.status(200).json({ ok: true, deleted: gone.length, rows: gone });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── 최근 발송 뉴스레터를 특정 주소로 복사 발송 (자기확인/미리보기) ──
  if (url.searchParams.get('action') === 'newsletter-copy') {
    const email = url.searchParams.get('email') || '';
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      const only = url.searchParams.get('source') || undefined;
      const result = await sendCopyLatest(email, { only });
      return res.status(200).json({ ok: true, email, result });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  try {
    // 봇 트래픽 플래그(같은 UA 반복접속·선언형 봇 → event_type=pageview_bot) — best-effort
    await supabaseRpc('flag_bot_pageviews', {}).catch((e) => console.error('bot flag (report):', e.message));
    // GSC 검색 실적을 Supabase(gsc_daily)에 저장 — best-effort(실패해도 리포트는 진행)
    await syncGsc({ days: 5 }).catch((e) => console.error('gsc sync (report):', e.message));
    // GA4 유입경로(네이버·직접·추천·소셜)를 ga4_daily 에 저장 — mungge 처럼 자체 트래커가 없는
    // 사이트는 이 경로가 유일한 유입 통계다. GSC 와 달리 당일치도 갱신되므로 소급 재집계한다.
    await syncGa4({ days: 5 }).catch((e) => console.error('ga4 sync (report):', e.message));
    // 새 글(최근 48h) 뉴스레터 발송 — 월·수·금 09시(KST)만. best-effort(GMAIL env 없으면 스킵)
    //   daily-report 는 매일 09시(KST=00:00 UTC) 실행되므로 KST 요일로 게이트한다.
    const kstDow = new Date(Date.now() + 9 * 3600 * 1000).getUTCDay(); // 0=일 … 1=월,3=수,5=금
    if ([1, 3, 5].includes(kstDow)) {
      const nl = await runNewsletter().catch((e) => {
        console.error('newsletter (report):', e.message);
        return null;
      });
      // 발송 결과를 텔레그램으로 알림(신규글 있거나 에러난 블로그만 — 조용한 날은 알림 없음)
      if (nl) {
        const active = nl.filter((r) => r.error || (r.new || 0) > 0 || (r.sent || 0) > 0);
        if (active.length) {
          const lines = active.map((r) =>
            r.error
              ? `• ${escapeHtml(r.source)}: ⚠️ ${escapeHtml(r.error)}`
              : `• ${escapeHtml(sourceLabel(r.source))}: 새 ${r.new || 0}편 → ${r.sent || 0}명 발송`
          );
          await sendToAdmin(`📩 <b>뉴스레터 발송</b>\n${lines.join('\n')}`).catch(() => {});
        }
      }
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
