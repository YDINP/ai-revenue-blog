/* 뭉게(mungge.com) 본문 차트 — 스크롤로 들어올 때 바가 0에서 실제 값까지 자란다.
 * (주석에도 script 태그 문자열은 쓰지 않는다 — HTML 파서 상태를 건드릴 여지를 없애려고)
 *
 * 아이디어만 Originkit(reveal-on-scroll)에서 가져왔고 라이브러리는 안 쓴다 — 뭉게 차트는
 * 서버 렌더된 정적 HTML/CSS 바(.chart-fill 에 인라인 width:%)라서 관찰자 하나로 끝난다.
 *
 * 설계 원칙 셋:
 * 1) 수치 라벨(.chart-value)은 절대 건드리지 않는다. 바가 차오르는 동안에도 숫자는 처음부터
 *    읽힌다 — 애니메이션이 데이터 파악을 지연시키면 안 된다.
 * 2) JS 가 없으면 아무 일도 안 일어난다. 접는 것도 JS 가 하므로(CSS 에 width:0 을 두지 않는다)
 *    스크립트가 죽거나 차단되면 서버 렌더된 최종 상태가 그대로 보인다.
 * 3) 이미 화면에 보이는 차트는 손대지 않는다. 접었다 펴면 사용자가 이미 읽고 있는 값이
 *    0 으로 튀는 게 보인다 — 그건 애니메이션이 아니라 결함이다.
 *
 * ⚠️ 라이브 SSOT 는 이 파일이 아니라 footer 위젯이다.
 *    수정하면 `node scripts/inject-wp-js.mjs --only MG-CHARTANIM` 로 다시 밀어 넣어야 반영된다.
 */
(function () {
  var DUR = 700;  // 바 하나가 차오르는 시간(ms)
  var STEP = 90;  // 같은 차트 안 행 간 간격 — 순서대로 차올라야 비교가 읽힌다

  var charts = document.querySelectorAll('.chart-bar,.chart-versus,.chart-progress,.chart-radar');
  if (!charts.length) return;

  // 모션을 원치 않는 사용자에겐 아무것도 하지 않는다(= 서버 렌더 최종 상태)
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (e) {}
  if (!('IntersectionObserver' in window)) return;

  var css = document.createElement('style');
  css.textContent =
    '.mg-cba{transition:width ' + DUR + 'ms cubic-bezier(.16,.84,.44,1),' +
    'height ' + DUR + 'ms cubic-bezier(.16,.84,.44,1)}';
  document.head.appendChild(css);

  var pending = [];

  for (var c = 0; c < charts.length; c++) {
    var chart = charts[c];
    // 이미 뷰포트에 들어와 있으면 건너뛴다(원칙 3)
    if (chart.getBoundingClientRect().top < window.innerHeight) continue;

    // 세로 컬럼 차트는 height, 가로 바/레이더는 width 로 채운다
    var fills = chart.querySelectorAll('.chart-fill,.radar-score-fill,.chart-col-fill');
    var items = [];
    for (var i = 0; i < fills.length; i++) {
      var el = fills[i];
      var vertical = el.classList.contains('chart-col-fill');
      var prop = vertical ? 'height' : 'width';
      var target = el.style[prop];
      if (!target) continue; // 인라인 %가 없으면 애니메이션할 값이 없다
      // 전환 클래스를 붙이기 *전에* 접는다 — 순서가 바뀌면 접히는 과정이 보인다
      el.style[prop] = '0%';
      items.push({ el: el, prop: prop, target: target });
    }
    if (!items.length) continue;
    // 접은 값을 브라우저가 실제로 반영한 뒤에 전환을 켠다
    void chart.offsetHeight;
    for (var k = 0; k < items.length; k++) {
      items[k].el.classList.add('mg-cba');
      items[k].el.style.transitionDelay = (k * STEP) + 'ms';
    }
    pending.push({ chart: chart, items: items });
  }
  if (!pending.length) return;

  function release(entry) {
    for (var i = 0; i < entry.items.length; i++) {
      entry.items[i].el.style[entry.items[i].prop] = entry.items[i].target;
    }
    // 다 차오르면 전환을 걷어낸다 — 이후 리플로우가 폭을 애니메이션하지 않게
    var total = DUR + entry.items.length * STEP + 80;
    setTimeout(function () {
      for (var j = 0; j < entry.items.length; j++) {
        entry.items[j].el.classList.remove('mg-cba');
        entry.items[j].el.style.transitionDelay = '';
      }
    }, total);
  }

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isIntersecting) continue;
      io.unobserve(entries[i].target);
      for (var j = 0; j < pending.length; j++) {
        if (pending[j].chart === entries[i].target) { release(pending[j]); break; }
      }
    }
  }, { threshold: 0.35, rootMargin: '0px 0px -8% 0px' });

  for (var q = 0; q < pending.length; q++) io.observe(pending[q].chart);
})();
