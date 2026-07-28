/* 뭉게(mungge.com) 글 하단 — 추천 버튼("도움이 됐어요") 아래 애드핏 슬롯.
 * (주석에도 script 태그 문자열은 쓰지 않는다 — HTML 파서 상태를 건드릴 여지를 없애려고)
 *
 * 유닛 선택: **300x250 레일 유닛(DAN-uWiPfWhdunksUrWW)** 을 쓴다.
 * 글 페이지에 이미 728x90(본문 상단) · 320x50(본문 상단 모바일) · 320x100(앵커) 세 개가
 * 박혀 있다. 애드핏은 같은 유닛을 한 페이지에 두 번 넣으면 하나만 채운다 —
 * 그래서 상단과 같은 728x90 을 또 쓰면 안 되고, 새 유닛을 발급받지 않고 쓸 수 있는 건
 * 레일 300x250 뿐이다(실측: 글 페이지엔 .mg-slot 이 0개라 레일 유닛이 비어 있다).
 * ⚠️ 그래서 이 블록은 **글에서만** 돈다 — 홈은 레일에 이 유닛을 이미 쓰고 있어서
 *    홈에도 넣으면 한 페이지에 같은 유닛이 두 번 들어간다. body.single-post 로 잠근다.
 *    (홈은 추천 버튼도 없다 — wp-like.js 가 슬러그 없는 경로에서 빠지기 때문)
 *
 * 모바일(<768px)은 제외한다. 이미 인포스트 320x50 + 앵커 320x100 두 개가 붙어 있어
 * 세 번째는 과하다. 임계값 768 은 wp-widget.js 의 MG_UNITS 분기와 같은 값이다.
 *
 * ⚠️ 애드핏 ba.min.js 는 로드 시점에 DOM 의 ins.kakao_ad_area 를 훑는다. 이 ins 는 추천
 *    버튼(MG-LIKE)이 만들어진 뒤에 붙으므로 이미 훑기가 끝났을 수 있다 → 스크립트를 한 번
 *    더 로드해 아직 처리되지 않은 슬롯을 스캔시킨다. wp-widget.js 의 중복 로드 가드를
 *    여기서는 의도적으로 우회한다(이미 처리된 ins 는 다시 채우지 않는다).
 *
 * ⚠️ headless 브라우저엔 애드핏이 서빙하지 않는다(실측: ins 3개 모두 display:none 유지,
 *    자식 0). 노출 검증은 실제 브라우저로만 가능하다 — DOM 배치까지만 자동 검증한다.
 *
 * ⚠️ 라이브 SSOT 는 이 파일이 아니라 footer 위젯이다.
 *    수정하면 `node scripts/inject-wp-js.mjs --only MG-ADEND` 로 다시 밀어 넣어야 반영된다.
 */
(function () {
  if (!document.body || !document.body.classList.contains('single-post')) return;
  if (window.innerWidth < 768) return;
  if (document.querySelector('.mg-slot--postend')) return;

  // 추천 버튼 캡션 바로 아래 — 버튼과 광고 사이에 캡션 한 줄이 끼어 오조작을 막는다
  var cap = document.querySelector('.mg-like-cap');
  if (!cap || !cap.parentNode) return;

  // ⚠️ 자리(min-height)를 미리 예약하면 안 된다. .mg-slot--lead 처럼 :not(:empty) 로 90px 을
  //    잡아두는 방식을 그대로 쓰면, 광고가 안 채워졌을 때(광고차단기·인벤토리 없음) 추천 버튼과
  //    뉴스레터 박스 사이에 250px 빈 구멍이 남는다 — 실측으로 확인했다. 90px 은 넘겨도
  //    250px 은 그냥 고장으로 보인다. 그래서 애드핏이 실제로 렌더한 뒤에만 자리를 준다.
  var css = document.createElement('style');
  css.textContent =
    '.mg-slot--postend{margin:0;min-height:0}' +
    '.mg-slot--postend.is-filled{margin:2.2rem auto 1.2rem;min-height:250px}';
  document.head.appendChild(css);

  var slot = document.createElement('div');
  slot.className = 'mg-slot mg-slot--postend';
  slot.setAttribute('data-slot', 'post-end');

  var ins = document.createElement('ins');
  ins.className = 'kakao_ad_area';
  ins.style.display = 'none';            // 애드핏 표준 스니펫 형식(스크립트가 해제한다)
  ins.setAttribute('data-ad-unit', 'DAN-uWiPfWhdunksUrWW');
  ins.setAttribute('data-ad-width', '300');
  ins.setAttribute('data-ad-height', '250');
  slot.appendChild(ins);

  cap.parentNode.insertBefore(slot, cap.nextSibling);

  // 애드핏이 채우면 ins 안에 iframe 이 생기고 display:none 이 풀린다 — 그때 자리를 준다.
  // 안 채워지면 슬롯은 높이 0·여백 0 으로 남아 없는 것과 같다.
  function markFilled() {
    if (slot.classList.contains('is-filled')) return true;
    if (ins.children.length || getComputedStyle(ins).display !== 'none') {
      slot.classList.add('is-filled');
      return true;
    }
    return false;
  }
  if (!markFilled() && window.MutationObserver) {
    var mo = new MutationObserver(function () { if (markFilled()) mo.disconnect(); });
    mo.observe(ins, { childList: true, attributes: true, attributeFilter: ['style'] });
    // 오래 안 오면 관찰을 걷는다(안 채워진 채로 두는 게 정상 동작이다)
    setTimeout(function () { mo.disconnect(); }, 15000);
  }

  var s = document.createElement('script');
  s.src = '//t1.kakaocdn.net/kas/static/ba.min.js';
  s.async = true;
  document.body.appendChild(s);
})();
