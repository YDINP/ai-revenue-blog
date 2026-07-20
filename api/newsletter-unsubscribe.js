// 구독 취소 엔드포인트 (메일의 '구독 취소' 링크)
//   GET /api/newsletter-unsubscribe?source=<source>&email=<email>
//   is_active=false 로 전환하고 간단한 확인 페이지를 반환.
import { unsubscribe } from './_newsletter.js';
import { escapeHtml, sourceLabel } from './_shared.js';

function page(title, msg) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:'Apple SD Gothic Neo',system-ui,sans-serif;background:#f5f6f4;color:#1a1712;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#fff;border-radius:16px;padding:40px 32px;max-width:400px;text-align:center;box-shadow:0 12px 30px -14px rgba(30,107,92,.35)}
h1{color:#1e6b5c;font-size:1.3rem;margin:0 0 8px}p{color:#5f5a51;line-height:1.6;margin:0}</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${msg}</p></div></body></html>`;
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const source = url.searchParams.get('source') || '';
  const email = url.searchParams.get('email') || '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    if (!source || !email) {
      return res.status(400).send(page('요청 오류', '구독 취소 정보가 올바르지 않습니다.'));
    }
    const n = await unsubscribe(source, email);
    const label = sourceLabel ? sourceLabel(source) : source;
    if (n > 0) {
      return res
        .status(200)
        .send(page('구독이 취소되었습니다', `${escapeHtml(label)} 뉴스레터 발송을 중단했어요. 언제든 다시 구독하실 수 있습니다.`));
    }
    return res.status(200).send(page('이미 취소됨', '해당 이메일은 이미 구독 취소 상태이거나 목록에 없습니다.'));
  } catch (e) {
    console.error('unsubscribe error:', e);
    return res.status(500).send(page('오류', '잠시 후 다시 시도해 주세요.'));
  }
}
