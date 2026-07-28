/* 뭉게(mungge.com) 방문 추적 — footer 위젯 script 블록 끝에 append.
 *
 * 왜 필요한가: 뭉게는 GA4(Site Kit) 집계만 있어서 "누가 어디서 와서 어느 글을 봤나"가
 * 개별 이벤트로 안 남는다. 대시보드 Live Activity 는 analytics 테이블의 이벤트를 읽으므로
 * 뭉게 방문이 아예 안 뜨고, naver_index(사이트 전체 색인 수)만 흘러가 글 단위 확인이 불가능했다.
 * TF/LF/VIP 가 쓰는 것과 같은 트래커를 심어 referrer 를 원문 그대로 남긴다.
 *
 * 봇/관리자 제외 규칙은 BaseLayout.astro 의 트래커와 동일하게 맞춘다 — 기준이 다르면
 * 소스별 수치를 나란히 못 놓는다.
 *
 * ⚠️ 라이브 SSOT 는 footer 위젯이다. 수정 후 scripts/inject-wp-js.mjs 로 다시 밀어 넣을 것.
 */
(function () {
  var SB = 'https://xyprbsmagtlzebxyxsvj.supabase.co';
  var NOTRACK = '__notrack';

  // 관리자 opt-out: ?admin=1 로 1회 접속하면 이 브라우저는 이후 집계 제외 (?admin=0 해제)
  try {
    var q = new URLSearchParams(location.search).get('admin');
    if (q === '1') localStorage.setItem(NOTRACK, '1');
    else if (q === '0') localStorage.removeItem(NOTRACK);
    if (localStorage.getItem(NOTRACK) === '1') return;
  } catch (e) {}

  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host) || /^10\./.test(host)) return;

  // 크롤러 제외. 네이버 Yeti·다음 Daumoa 는 UA 에 bot/spider 가 없어 명시해야 한다.
  // ⚠️ 'naver' 처럼 넓게 잡으면 네이버앱 인앱브라우저(UA=NAVER(inapp)) 실사용자까지 빠진다.
  var ua = navigator.userAgent || '';
  if (navigator.webdriver ||
      /bot|crawl|spider|headless|lighthouse|playwright|puppeteer|slurp|petalbot|bytespider|yeti|daumoa|googleother|google-inspection/i.test(ua)) return;

  var path = location.pathname;
  var slug = path.replace(/^\/+|\/+$/g, '');
  var h1 = document.querySelector('article h1.entry-title, article h1, h1');
  var title = (h1 ? h1.textContent : document.title).replace(/\s*[–-]\s*뭉게\s*$/, '').trim();
  var qs = new URLSearchParams(location.search);

  fetch(SB + '/functions/v1/analytics-ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // ⚠️ 'pageview' 가 아니라 'pageview_mg' 다.
      // 대시보드의 뭉게 조회수는 GA4(ga4_daily)에서 합산하는데, get_traffic_summary 가
      // event_type='pageview' 를 전부 세므로 같은 이름을 쓰면 총계가 이중 집계된다.
      // 이 이벤트의 목적은 집계가 아니라 "어디서 와서 어느 글을 봤나"의 개별 기록이고,
      // get_recent_events 는 event_type 을 가리지 않아 Live Activity 에는 그대로 뜬다.
      event_type: 'pageview_mg',
      source: 'mg',
      metadata: {
        slug: slug,
        title: title,
        path: path,
        // 유입 원문 URL 그대로 — 네이버 블로그 어느 글에서 왔는지가 여기 남는다
        referrer: document.referrer || 'direct',
        user_agent: ua,
        utm_source: qs.get('utm_source') || undefined,
        utm_medium: qs.get('utm_medium') || undefined,
        utm_campaign: qs.get('utm_campaign') || undefined
      }
    })
  }).catch(function () {});
})();
