/* 뭉게(mungge.com) 제휴·프로모 클릭 추적 — footer 위젯 script 블록 끝에 append.
 *
 * 왜 필요한가: TF·LF 를 뭉게로 301 통합하면서 본문(쿠팡 링크·페이퍼닥 링크)은 그대로
 * 넘어왔는데 **클릭 트래커만 안 넘어왔다**. TF/LF 는 BaseLayout.astro 가 coupang_click /
 * paperdoc_click 을 쐈지만 뭉게는 WordPress 라 그 레이아웃이 서빙되지 않는다.
 * 그래서 대시보드 쿠팡·페이퍼닥 탭이 "뭉게 미추적"으로 비어 있었고, 실제로 눌리고 있는
 * 제휴 링크의 성과를 전혀 볼 수 없었다.
 *
 * ⚠️ metadata 모양을 BaseLayout.astro 트래커와 **동일하게** 맞춘다. 모양이 다르면
 * 같은 대시보드 코드로 소스별 수치를 나란히 못 놓는다.
 *   coupang_click  → { product, url, slug, path, title }
 *   paperdoc_click → { placement, url, slug, path, title }
 *
 * ⚠️ 라이브 SSOT 는 footer 위젯이다. 수정 후 scripts/inject-wp-js.mjs 로 다시 밀어 넣을 것.
 */
(function () {
  var SB = 'https://xyprbsmagtlzebxyxsvj.supabase.co';
  var URL_ = SB + '/functions/v1/analytics-ingest';
  var NOTRACK = '__notrack';

  // 제외 규칙은 wp-track.js(방문 추적)와 같은 기준을 쓴다 — 기준이 다르면 조회수 대비
  // 클릭률(CTR)이 분자·분모의 모집단이 어긋난 값이 된다.
  try {
    if (localStorage.getItem(NOTRACK) === '1') return;
  } catch (e) {}

  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host) || /^10\./.test(host)) return;

  var ua = navigator.userAgent || '';
  if (navigator.webdriver ||
      /bot|crawl|spider|headless|lighthouse|playwright|puppeteer|slurp|petalbot|bytespider|yeti|daumoa|googleother|google-inspection/i.test(ua)) return;

  var path = location.pathname;
  var slug = path.replace(/^\/+|\/+$/g, '');
  var h1 = document.querySelector('article h1.entry-title, article h1, h1');
  var title = (h1 ? h1.textContent : document.title).replace(/\s*[–-]\s*뭉게\s*$/, '').trim();

  // 링크 클릭은 곧 페이지 이탈이다 → fetch 는 중간에 끊긴다. sendBeacon 우선.
  function send(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon(URL_, new Blob([body], { type: 'application/json' }))) return;
    } catch (e) {}
    fetch(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
      keepalive: true
    }).catch(function () {});
  }

  // capture 단계에서 받는다 — 본문 스크립트가 클릭을 stopPropagation 해도 놓치지 않는다
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    // ── 쿠팡 / 제휴 ──
    // 뭉게 본문의 쿠팡 링크는 <a href="https://link.coupang.com/a/xxxx">상품명</a> 형태다.
    // TF 시절의 카드 마크업(.coupang-inline / .ci-title)도 이관 본문에 남아 있어 함께 잡는다.
    var a = t.closest('a[href*="coupang.com"], a.coupang-inline, a.coupang-link, a.coupang-link-item');
    if (a) {
      var ci = a.querySelector ? a.querySelector('.ci-title') : null;
      var product = (a.getAttribute('data-product') || '').trim()
        || (ci && ci.textContent.trim())
        || (a.textContent || '').trim().slice(0, 80);
      send({
        event_type: 'coupang_click',
        source: 'mg',
        metadata: { product: product, url: a.href, slug: slug, path: path, title: title }
      });
      return;
    }

    // ── 페이퍼닥 프로모 ──
    // 뭉게 본문의 페이퍼닥 링크는 클래스가 없는 인라인 링크다 → placement='inline'.
    // TF 시절 프로모 클래스(pd-pop/pd-side/pd-promo)가 남은 경우도 구분해 둔다.
    var p = t.closest('a[href*="paperdoc-web.vercel.app"]');
    if (p) {
      var cls = String(p.className || '');
      var placement = /pd-pop/.test(cls) ? 'popup'
        : /pd-side/.test(cls) ? 'side'
        : /pd-promo/.test(cls) ? 'banner'
        : 'inline';
      send({
        event_type: 'paperdoc_click',
        source: 'mg',
        metadata: { placement: placement, url: p.href, slug: slug, path: path, title: title }
      });
    }
  }, { capture: true });
})();
