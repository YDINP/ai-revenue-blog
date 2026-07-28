/* 뭉게(mungge.com) 본문 강조 텍스트(strong) 형광펜 — 스크롤로 들어올 때 마커가 그려진다.
 * (주석에도 script 태그 문자열은 쓰지 않는다 — HTML 파서 상태를 건드릴 여지를 없애려고)
 *
 * 원본은 Originkit `scroll-text-highlight`. 두 군데를 바꿔서 이식했다.
 *
 * 1) dim→bright → 형광펜 마커.
 *    원본은 안 지나간 글자를 흐리게 깔고 밝아지게 한다. 뭉게 본문 배경(거의 흰색)에서
 *    본문색을 흐리게 하면, 대비 4.5:1 을 지키는 한계가 알파 0.75 다 — 눈에 안 띈다.
 *    반대로 눈에 띄게 하면 2.8:1 로 떨어진다. 읽는 블로그의 본문을 흐리게 두는 건 안 되므로
 *    글자색은 건드리지 않고 마커만 그린다. CSS SSOT 의 "강조는 색 변경 없이 굵기만"
 *    (.entry-content-wrap strong{color:inherit}) 원칙과도 맞는다.
 *
 * 2) 문단 전체 단어별 스태거 → 강조 단위.
 *    원본은 문단을 단어로 쪼개 스크롤 진행도에 스태거를 매핑한다. 본문 전체에 그걸 걸면
 *    읽는 데 방해가 되고 DOM 도 수천 조각이 된다. 여기서는 이미 인라인 엘리먼트인
 *    strong 에 클래스만 붙인다 — 텍스트 분해가 없으니 복사·줄바꿈·선택이 원문 그대로다.
 *
 * 제외 대상(마커가 시끄럽거나 다른 장식과 충돌하는 자리):
 *   표 셀 / 제목 / 링크 안 또는 링크를 품은 strong / 핵심요약 박스 / 목차 /
 *   콜아웃·CTA·구독·내부링크 박스
 *
 * ⚠️ 라이브 SSOT 는 이 파일이 아니라 footer 위젯이다.
 *    수정하면 `node scripts/inject-wp-js.mjs --only MG-STH` 로 위젯에 다시 밀어 넣어야 반영된다.
 */
(function () {
  var STEP = 70; // 한 화면에 여러 개가 동시에 들어올 때 순서대로 켜지는 간격(ms)

  // 단일 글에서만. 홈(page 1761)에는 .entry-content 가 있지만 strong 이 본문 강조가 아니다.
  var root = document.querySelector('article.single-entry .entry-content');
  if (!root || !document.querySelector('.mg-tldr')) return;
  if (root.getAttribute('data-sth')) return;
  root.setAttribute('data-sth', '1');

  var SKIP = 'td,th,h1,h2,h3,h4,h5,h6,a,.mg-tldr,#ez-toc-container,' +
    '.callout-tip,.callout-warning,.callout-info,.mg-cta,.mg-sub,.seo-inlink,figcaption';

  var targets = [];
  var all = root.querySelectorAll('strong');
  for (var i = 0; i < all.length; i++) {
    var s = all[i];
    if (s.closest(SKIP)) continue;      // 위 자리 안에 있으면 건너뛴다
    if (s.querySelector('a')) continue; // strong 이 링크를 품으면 링크 밑줄과 겹친다
    if (!s.textContent.trim()) continue;
    s.className = (s.className ? s.className + ' ' : '') + 'mg-sth-w';
    targets.push(s);
  }
  if (!targets.length) return;

  var css = document.createElement('style');
  css.textContent =
    // 마커는 배경 그라디언트의 너비를 0 → 100% 로 키워 형광펜처럼 그린다. 레이아웃 영향 없음.
    // ⚠️ inline-block 은 쓰지 않는다 — 한국어는 어절 안에서도 줄바꿈되는데 inline-block 이면
    //    강조구가 통째로 안 쪼개져 긴 강조에서 넘친다.
    // ⚠️ 그래서 강조가 두 줄로 쪼개지는 일이 생긴다(최대 54자짜리도 있다) —
    //    box-decoration-break:clone 이 있어야 넘어간 조각도 자기 몫의 마커를 받는다.
    '.mg-sth-w{background-image:linear-gradient(var(--mg-sth,rgba(79,124,255,.22)),var(--mg-sth,rgba(79,124,255,.22)));' +
    'background-repeat:no-repeat;background-position:0 88%;background-size:0% .42em;' +
    '-webkit-box-decoration-break:clone;box-decoration-break:clone;' +
    'transition:background-size .5s cubic-bezier(.22,.61,.36,1)}' +
    '.mg-sth-w.on{background-size:100% .42em}' +
    'html[data-wp-dark-mode-active] .mg-sth-w{--mg-sth:rgba(120,160,255,.26)}' +
    '@media (prefers-reduced-motion: reduce){.mg-sth-w{transition:none}}';
  document.head.appendChild(css);

  var reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  function litAll() {
    for (var i = 0; i < targets.length; i++) targets[i].classList.add('on');
  }
  if (reduce || !('IntersectionObserver' in window)) { litAll(); return; }

  // 옵저버는 하나로 전부 관찰한다(글마다 strong 이 최대 65개라 개별 옵저버는 낭비).
  // 아래쪽 -12% 는 화면 맨 밑 경계가 아니라 읽는 자리에 들어왔을 때 켜지게 하는 여유다.
  var queue = [];
  var draining = false;
  function drain() {
    if (draining || !queue.length) return;
    draining = true;
    var start = 0;
    var n = 0;
    var batch = queue;
    queue = [];
    function tick(now) {
      if (!start) start = now;
      while (n < batch.length && now - start >= n * STEP) {
        batch[n].classList.add('on');
        n++;
      }
      if (n < batch.length) { requestAnimationFrame(tick); return; }
      draining = false;
      drain(); // 스태거 도중 새로 들어온 것들 처리
    }
    requestAnimationFrame(tick);
  }

  var io = new IntersectionObserver(function (entries) {
    // 문서 순서대로 켜려면 화면 위쪽에 있는 것부터 정렬해야 한다
    var hit = [];
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isIntersecting) continue;
      hit.push(entries[i].target);
      io.unobserve(entries[i].target);
    }
    if (!hit.length) return;
    hit.sort(function (a, b) {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });
    queue = queue.concat(hit);
    drain();
  }, { threshold: 0.6, rootMargin: '0px 0px -12% 0px' });

  for (var k = 0; k < targets.length; k++) io.observe(targets[k]);
})();
