/* 뭉게(mungge.com) 글 최상단 핵심 요약(.mg-tldr-text) 단어별 형광펜 스윕.
 * (주석에도 script 태그 문자열은 쓰지 않는다 — HTML 파서 상태를 건드릴 여지를 없애려고)
 *
 * 원본은 Originkit `scroll-text-highlight`. 두 군데를 바꿔서 이식했다.
 *
 * 1) 스크롤 스크럽 → 등장 시 1회 스윕.
 *    원본은 gsap ScrollTrigger scrub 으로 스크롤 진행도에 스태거를 매핑한다. 그건 화면을
 *    가득 채우는 60px 문단을 전제한 것이고, 0.97rem 3줄짜리 요약 블록에 걸면 150px 스크롤
 *    안에 시작·끝이 다 지나가 깜빡임으로 보인다. 게다가 이 블록은 글 맨 위라 로드 시점에
 *    이미 뷰포트 중앙 근처에 있어서 스크럽 진행도가 0 이 아닌 값으로 시작한다.
 *
 * 2) dim→bright → 형광펜.
 *    원본은 안 지나간 글자를 흐리게 깔고 밝아지게 한다. 이 블록 배경(거의 흰색)에서
 *    본문색 #3a4552 를 흐리게 하면, 대비 4.5:1 을 지키는 한계가 알파 0.75 다 — 눈에 안 띈다.
 *    반대로 눈에 띄게 하면 2.8:1 로 떨어진다. 읽는 블로그의 요약을 흐리게 두는 건 안 되므로
 *    글자색은 건드리지 않고(9.1:1 유지) 밑줄 마커만 단어별로 그린다.
 *
 * ⚠️ 라이브 SSOT 는 이 파일이 아니라 footer 위젯이다.
 *    수정하면 `node scripts/inject-wp-js.mjs --only MG-STH` 로 위젯에 다시 밀어 넣어야 반영된다.
 */
(function () {
  var STEP = 55;   // 단어 간 간격(ms) — 45단어 요약이면 약 2.5초, 읽는 속도와 비슷하다
  var DELAY = 250; // 페이지 첫 페인트와 겹치지 않게 조금 늦춘다

  // 단일 글에서만. 홈(page 1761)도 article.single-entry 를 쓰지만 .mg-tldr-text 가 없다.
  var el = document.querySelector('.mg-tldr-text');
  if (!el || el.getAttribute('data-sth')) return;
  // 요약 안에 링크 등 자식 엘리먼트가 생긴 글이면 마크업을 건드리지 않고 물러난다
  if (el.children.length) return;
  var text = el.textContent;
  if (!text || !text.trim()) return;
  el.setAttribute('data-sth', '1');

  var css = document.createElement('style');
  css.textContent =
    // 마커는 배경 그라디언트의 너비를 0 → 100% 로 키워 형광펜처럼 그린다. 레이아웃 영향 없음.
    // ⚠️ inline-block 은 쓰지 않는다 — 한국어는 어절 안에서도 줄바꿈되는데 inline-block 이면
    //    공백으로 끊긴 덩어리가 통째로 안 쪼개져 긴 어절에서 넘친다.
    // ⚠️ 그래서 어절이 두 줄로 쪼개지는 일이 거의 매 줄 생긴다 — box-decoration-break:clone
    //    이 있어야 넘어간 조각도 자기 몫의 마커를 받는다(없으면 앞 조각만 칠해진다).
    '.mg-sth-w{background-image:linear-gradient(var(--mg-sth,rgba(79,124,255,.22)),var(--mg-sth,rgba(79,124,255,.22)));' +
    'background-repeat:no-repeat;background-position:0 88%;background-size:0% .42em;' +
    '-webkit-box-decoration-break:clone;box-decoration-break:clone;' +
    'transition:background-size .42s cubic-bezier(.22,.61,.36,1)}' +
    '.mg-sth-w.on{background-size:100% .42em}' +
    'html[data-wp-dark-mode-active] .mg-sth-w{--mg-sth:rgba(120,160,255,.26)}' +
    '@media (prefers-reduced-motion: reduce){.mg-sth-w{transition:none}}';
  document.head.appendChild(css);

  // 공백을 텍스트 노드로 그대로 남겨야 줄바꿈·복사 결과가 원문과 같다
  var parts = text.split(/(\s+)/);
  var frag = document.createDocumentFragment();
  var words = [];
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    if (/^\s+$/.test(parts[i])) {
      frag.appendChild(document.createTextNode(parts[i]));
    } else {
      var s = document.createElement('span');
      s.className = 'mg-sth-w';
      s.textContent = parts[i];
      frag.appendChild(s);
      words.push(s);
    }
  }
  if (!words.length) return;
  el.textContent = '';
  el.appendChild(frag);

  var reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  function sweep() {
    if (reduce) {
      for (var i = 0; i < words.length; i++) words[i].classList.add('on');
      return;
    }
    // setTimeout 을 단어 수만큼 걸지 않고 rAF 하나로 시간을 재 순서대로 켠다
    var start = 0;
    var next = 0;
    function tick(now) {
      if (!start) start = now;
      while (next < words.length && now - start >= next * STEP) {
        words[next].classList.add('on');
        next++;
      }
      if (next < words.length) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // 이 블록은 글 맨 위라 대개 로드 시점에 이미 보인다 → 옵저버가 즉시 발화한다.
  // 스크롤해서 내려온 경우(다른 글에서 앵커로 진입 등)도 같은 코드로 커버된다.
  if (!('IntersectionObserver' in window)) {
    setTimeout(sweep, DELAY);
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isIntersecting) continue;
      io.disconnect();
      setTimeout(sweep, DELAY);
      return;
    }
  }, { threshold: 0.35 });
  io.observe(el);
})();
