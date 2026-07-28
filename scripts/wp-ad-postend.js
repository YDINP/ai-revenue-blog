/* 뭉게(mungge.com) 글 하단 — 추천 버튼("도움이 됐어요") 캡션 아래 애드핏 300x250.
 * (주석에도 script 태그 문자열은 쓰지 않는다 — HTML 파서 상태를 건드릴 여지를 없애려고)
 *
 * 유닛: DAN-0b3JVXVHkcy7SpzY (300x250, 이 자리 전용으로 발급)
 * 처음엔 홈 레일 유닛을 빌려 썼다 — 애드핏은 같은 유닛을 한 페이지에 두 번 넣으면 하나만
 * 채우는데, 글 페이지에 이미 728x90·320x50·320x100 이 박혀 있어 빈 유닛이 레일 것뿐이었다.
 * 전용 유닛이 생겨서 성과를 자리별로 따로 볼 수 있게 됐다.
 *
 * ⚠️ 데스크톱 전용이고, 임계값 783px 은 임의 값이 아니라 **앵커 광고의 브레이크포인트**다.
 *    .mg-anchor(320x100)는 max-width:782px 에서만 화면 바닥에 고정된다. 그 아래 폭에서
 *    글 하단 300x250 을 넣으면 독자가 글 끝에 멈춰 있는 동안 두 광고가 세로로 붙는다 —
 *    광고 인접/중첩이라 정책상으로도 UX 상으로도 피해야 한다.
 *    (본문 중간 슬롯은 스크롤로 지나가는 자리라 모바일에도 넣는다 — wp-ad-inarticle.js)
 *
 * ⚠️ 자리(min-height)는 미리 예약하지 않는다 — 사유는 CSS 의 .mg-adslot 주석 참고.
 * ⚠️ 애드핏은 자동화 브라우저(headless/headed 둘 다)에 서빙하지 않는다. 노출 검증은 사람 몫.
 *
 * ⚠️ 라이브 SSOT 는 이 파일이 아니라 footer 위젯이다.
 *    수정하면 `node scripts/inject-wp-js.mjs --only MG-ADEND` 로 다시 밀어 넣어야 반영된다.
 */
(function () {
  if (!document.body || !document.body.classList.contains('single-post')) return;
  if (window.innerWidth < 783) return;   // 앵커(≤782px)와 겹치는 구간을 통째로 비운다
  if (document.querySelector('.mg-adslot--postend')) return;

  // 추천 버튼 캡션 바로 아래 — 버튼과 광고 사이에 캡션 한 줄이 끼어 오조작을 막는다
  var cap = document.querySelector('.mg-like-cap');
  if (!cap || !cap.parentNode) return;

  var slot = document.createElement('div');
  slot.className = 'mg-adslot mg-adslot--postend';

  var ins = document.createElement('ins');
  ins.className = 'kakao_ad_area';
  ins.style.display = 'none';            // 애드핏 표준 스니펫 형식(스크립트가 해제한다)
  ins.setAttribute('data-ad-unit', 'DAN-0b3JVXVHkcy7SpzY');
  ins.setAttribute('data-ad-width', '300');
  ins.setAttribute('data-ad-height', '250');
  slot.appendChild(ins);

  cap.parentNode.insertBefore(slot, cap.nextSibling);

  // 애드핏이 채우면 ins 안에 iframe 이 생기고 display:none 이 풀린다 — 그때만 자리를 준다.
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
    setTimeout(function () { mo.disconnect(); }, 15000);
  }

  // ba.min.js 는 로드 시점에 DOM 을 훑으므로 나중에 붙인 ins 는 놓칠 수 있다 → 한 번 더 로드.
  // 동적 슬롯이 여러 개라도 킥은 한 번이면 된다(async 라 이 인라인 스크립트가 끝난 뒤 실행돼
  // 그 시점엔 모든 슬롯이 DOM 에 들어와 있다).
  if (!window.__mgAdKick) {
    window.__mgAdKick = 1;
    var s = document.createElement('script');
    s.src = '//t1.kakaocdn.net/kas/static/ba.min.js';
    s.async = true;
    document.body.appendChild(s);
  }
})();
