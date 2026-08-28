/* 뭉게(mungge.com) 애드핏 노출 계측 — footer 위젯 script 블록 끝에 append.
 *
 * 왜 필요한가: 지금까지 광고 슬롯이 **비었는지조차 알 수 없었다.** 애드핏은 재고가 없거나
 * 타겟이 안 맞으면 조용히 아무것도 안 그리고, 우리 코드에는 실패를 감지하는 지점이 없었다.
 * 그래서 "재로드를 붙일까"를 판단할 근거(어느 슬롯이 얼마나 자주 비는가)가 없다.
 * → 이 스크립트는 **계측만 한다. 재시도하지 않는다.** 며칠 데이터를 보고 결정한다.
 *
 * 판정 방식 — 두 신호를 합친다:
 *  ① data-ad-onfail 콜백: 애드핏이 "노출할 광고가 없다"고 명시적으로 알려주는 경우.
 *     ⚠️ 이 콜백은 응답을 받았을 때만 온다. 요청 자체가 안 나가면 영영 안 온다.
 *  ② 지연 후 iframe 유무: 애드핏이 그린 광고는 <ins> 안에 iframe 으로 들어온다.
 *     ①이 오지 않는 무응답·차단(광고차단기, 네트워크 실패) 구간은 이걸로만 잡힌다.
 *
 * ⚠️ 뷰포트에 들어온 슬롯만 센다. 애드핏은 **display:none 인 슬롯엔 요청조차 하지 않으므로**
 *    (reference_adfit_serving_rules) 안 보이는 슬롯을 '실패'로 세면 전부 실패로 잡힌다.
 *
 * ⚠️ 라이브 SSOT 는 footer 위젯이다. 수정 후
 *    `node scripts/inject-wp-js.mjs --only MG-ADOBS` 로 다시 밀어 넣어야 반영된다.
 */
(function () {
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cHJic21hZ3RsemVieHl4c3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NjY4NTQsImV4cCI6MjA4NjA0Mjg1NH0.dajN0n0IWzOgYOSCglxVLzddg7jJFRHNCHwTWMG62uU';
  var URL_ = 'https://xyprbsmagtlzebxyxsvj.supabase.co/rest/v1/analytics';
  var NOTRACK = '__notrack';
  var WAIT_MS = 4000;        // 애드핏이 그릴 시간. 너무 짧으면 정상 노출을 실패로 센다.

  try { if (localStorage.getItem(NOTRACK) === '1') return; } catch (e) {}

  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host) || /^10\./.test(host)) return;

  /* 봇 제외 — 판별은 wp-track.js(MG-TRACK)가 노출한 __mgBotUA 를 쓴다. 규칙을 두 벌로 두면
   * 갈라지고, 갈라지면 두 트래커 수치를 나란히 못 놓는다. MG-TRACK 이 먼저 실행되므로
   * 정상적으로는 항상 있다 — 그 블록이 죽은 경우에만 자기 정규식으로 떨어진다.
   * ⚠️ 애드핏은 headless 에 아예 서빙하지 않으므로, 봇을 안 빼면 실패율이 통째로 부풀려진다. */
  var ua = navigator.userAgent || '';
  var isBot = window.__mgBotUA
    ? window.__mgBotUA(ua)
    : /bot|crawl|spider|headless|lighthouse|playwright|puppeteer|slurp|petalbot|bytespider|yeti|daumoa|googleother|google-inspection/i.test(ua);
  if (navigator.webdriver || isBot) return;

  var slug = location.pathname.replace(/^\/+|\/+$/g, '');
  var isMobile = window.matchMedia('(max-width: 767px)').matches;
  var seen = {};             // 유닛당 1회만 보고 — 스크롤로 여러 번 들락거려도 중복 집계 안 한다

  function send(unit, result, detail) {
    if (!unit || seen[unit]) return;
    seen[unit] = 1;
    var body = JSON.stringify({
      event_type: 'adfit_slot',
      source: 'mg',
      metadata: {
        unit: unit,
        result: result,                    // 'filled' | 'nofill' | 'empty'
        detail: detail || '',
        slug: slug,
        device: isMobile ? 'mobile' : 'pc',
        path: location.pathname
      }
    });
    /* ⚠️ 2026-08-28: Edge Function(analytics-ingest) 우회.
     *    그 함수가 HTTP 200 {"success":true} 를 주면서 INSERT 를 하지 않는 상태가 됐고
     *    (08-26 07:37 KST 이후 브라우저發 이벤트 전멸), 실패를 성공으로 보고하는 탓에
     *    이틀 넘게 아무도 못 알아챘다. PostgREST 직접 INSERT 는 anon 키로 201 이 확인됐고
     *    함수가 하던 일이 단순 통과였으므로(행 컬럼이 전부 클라이언트 값) 중간 계층을 없앤다.
     *    ANON 은 이미 위젯에 들어 있는 공개키다 — 새로 노출되는 비밀은 없다. */
    /* ⚠️ sendBeacon 제거. 예전엔 프리플라이트를 피하려고 text/plain Blob 으로 보냈지만,
     *    PostgREST 는 apikey·Authorization 헤더가 필수라 sendBeacon 으로는 애초에 불가능하다.
     *    fetch keepalive 로 단일화한다(이 경로는 이미 폴백으로 200 이 확인돼 있던 층이다). */
    fetch(URL_, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON,
        Authorization: 'Bearer ' + ANON,
        Prefer: 'return=minimal'
      },
      body: body,
      keepalive: true
    }).catch(function () {});
  }

  /* 애드핏 onfail 콜백. <ins data-ad-onfail="mgAdFail"> 로 연결한다.
     인자로 실패한 <ins> 엘리먼트가 온다(애드핏 규격). */
  window.mgAdFail = function (el) {
    try { send(el && el.getAttribute ? el.getAttribute('data-ad-unit') : '', 'nofill', 'onfail'); } catch (e) {}
  };

  function check(ins) {
    var unit = ins.getAttribute('data-ad-unit');
    if (!unit || seen[unit]) return;
    // 애드핏이 그렸으면 <ins> 안에 iframe 이 있다.
    send(unit, ins.querySelector('iframe') ? 'filled' : 'empty', 'timeout' + WAIT_MS);
  }

  /* 관찰 대상은 ins 가 아니라 부모(슬롯 래퍼)다.
   * ⚠️ ins 는 애드핏이 채우기 전까지 display:none 이라 레이아웃 박스가 없고,
   *    IntersectionObserver 는 그런 요소에 대해 영영 발화하지 않는다. ins 를 관찰하면
   *    채워진 슬롯만(=display 가 풀린 뒤에야) 잡히므로 **정작 재려던 '안 채워진 슬롯'이
   *    통째로 관측 밖으로 빠진다** — 충전률이 항상 100% 로 읽힌다.
   *    2026-08-03~04 실측: 페이지뷰 77건에 adfit_slot 2건, 둘 다 filled.
   *    부모 래퍼는 폭에 안 맞아 숨겨진 경우가 아니면 레이아웃을 갖는다(높이 0 이어도 발화한다). */
  function hostOf(ins) { return ins.parentElement || ins; }

  function watch() {
    var slots = document.querySelectorAll('ins.kakao_ad_area');
    if (!slots.length) return;

    if (!('IntersectionObserver' in window)) {
      // 폴백: 관찰을 못 하면 화면 안에 있는 것만 한 번 훑는다(위치도 부모로 잰다).
      setTimeout(function () {
        for (var j = 0; j < slots.length; j++) {
          var r = hostOf(slots[j]).getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom >= 0) check(slots[j]);
        }
      }, WAIT_MS);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var ins = en.target.__mgIns;
        if (!ins) return;
        // 보이기 시작한 시점부터 재야 한다 — 페이지 로드 기준으로 재면
        // 한참 아래 슬롯이 "아직 요청도 안 된 상태"로 실패 처리된다.
        setTimeout(function () { check(ins); }, WAIT_MS);
      });
    }, { rootMargin: '0px' });

    for (var k = 0; k < slots.length; k++) {
      var host = hostOf(slots[k]);
      host.__mgIns = slots[k];
      io.observe(host);
    }
  }

  /* onfail 콜백은 **동기 시점에** 붙인다 — 서버가 렌더한 마크업에는 이 속성이 없다.
   * ⚠️ DOMContentLoaded 까지 미루면 그 사이 async ba.min.js 가 먼저 슬롯을 초기화해
   *    뒤늦게 붙인 속성이 안 먹는다(그래서 nofill 이 한 건도 안 잡혔다).
   *    이 블록은 위젯 script 안에서 광고 블록들 뒤·ba.min.js 실행 전에 동기로 돌기 때문에
   *    지금이 모든 슬롯이 DOM 에 있으면서 애드핏은 아직 안 훑은 유일한 시점이다. */
  var initial = document.querySelectorAll('ins.kakao_ad_area');
  for (var i = 0; i < initial.length; i++) {
    if (!initial[i].getAttribute('data-ad-onfail')) initial[i].setAttribute('data-ad-onfail', 'mgAdFail');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
