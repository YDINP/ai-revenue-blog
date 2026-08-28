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
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cHJic21hZ3RsemVieHl4c3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NjY4NTQsImV4cCI6MjA4NjA0Mjg1NH0.dajN0n0IWzOgYOSCglxVLzddg7jJFRHNCHwTWMG62uU';
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

  /* 봇 판별 — 다른 트래커(wp-ad-observe.js)가 **같은 기준**을 써야 수치를 나란히 놓을 수 있어
   * 전역으로 노출한다. 이 블록(MG-TRACK)이 위젯에서 가장 먼저 실행되므로 뒤 블록은 항상 쓸 수 있다.
   *
   * ① 자기 신고형 크롤러. 네이버 Yeti·다음 Daumoa 는 UA 에 bot/spider 가 없어 명시해야 한다.
   *    ⚠️ 'naver' 처럼 넓게 잡으면 네이버앱 인앱브라우저(UA=NAVER(inapp)) 실사용자까지 빠진다.
   * ② 정상 브라우저를 가장한 UA. 2026-07-27~08-04 자체 트래커 359뷰 중 28뷰(8%)가 여기 해당했고
   *    08-02 은 30뷰 중 12뷰(40%)였다. 조회수를 부풀리고 애드핏 요청/PV 비율을 무너뜨린다
   *    (페이지뷰 비콘은 쏘는데 광고 요청은 안 나가므로).
   *    ⚠️ **물리적으로 불가능하거나 자동화 도구 기본값으로 박제된 조합만** 본다 — 넓은 토큰 금지.
   *    ⚠️ 이 목록은 서버 쪽 api/_shared.js 의 FAKE_UA_RULES 와 같은 내용이어야 한다.
   *       (여기는 앞으로 들어올 것을 막고, 서버 쪽은 이미 쌓인 기록을 조회 때 거른다) */
  window.__mgFakeUA = [
    /(?:iPhone|iPad)[^)]*\)[^]*AppleWebKit\/537\.36/,   // 실제 iOS 는 AppleWebKit/605.x
    /Pixel 2 Build\/OPD3\.170816\.012/,
    /Nexus 5 Build\/MRA58N/,
    /SM-G900P Build\/LRX21T/,
    /\(Macintosh; Intel Mac OS X\)/                     // 버전 문자열이 통째로 빠진 맥
  ];
  window.__mgBotUA = function (ua) {
    if (/bot|crawl|spider|headless|lighthouse|playwright|puppeteer|slurp|petalbot|bytespider|yeti|daumoa|googleother|google-inspection/i.test(ua)) return true;
    for (var i = 0; i < window.__mgFakeUA.length; i++) if (window.__mgFakeUA[i].test(ua)) return true;
    return false;
  };

  var ua = navigator.userAgent || '';
  if (navigator.webdriver || window.__mgBotUA(ua)) return;

  var path = location.pathname;
  var slug = path.replace(/^\/+|\/+$/g, '');
  var h1 = document.querySelector('article h1.entry-title, article h1, h1');
  var title = (h1 ? h1.textContent : document.title).replace(/\s*[–-]\s*뭉게\s*$/, '').trim();
  var qs = new URLSearchParams(location.search);

  /* ⚠️ 2026-08-28: Edge Function(analytics-ingest) 우회.
   *    그 함수가 HTTP 200 {"success":true} 를 주면서 INSERT 를 하지 않는 상태가 됐고
   *    (08-26 07:37 KST 이후 브라우저發 이벤트 전멸), 실패를 성공으로 보고하는 탓에
   *    이틀 넘게 아무도 못 알아챘다. PostgREST 직접 INSERT 는 anon 키로 201 이 확인됐고
   *    함수가 하던 일이 단순 통과였으므로(행 컬럼이 전부 클라이언트 값) 중간 계층을 없앤다.
   *    ANON 은 이미 위젯에 들어 있는 공개키다 — 새로 노출되는 비밀은 없다. */
  fetch(SB + '/rest/v1/analytics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: 'Bearer ' + ANON,
      Prefer: 'return=minimal'
    },
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
