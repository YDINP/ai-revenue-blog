/* 데스크톱 상단 728x90 을 첫 화면 안으로 올린다.
 *
 * 왜: 이 유닛이 최대 수익원인데(08-04 적립 비중 28.6%) 뷰어빌리티가 78% ↔ 40% 로 널뛰었다.
 * 원인은 위치가 딱 접히는 선이라서 — 글 상단 광고는 항상 819px 지점인데 노트북 흔한
 * 높이(650px)에서는 첫 화면 밖이다. 스크롤 안 하는 방문자가 많은 날만 이 유닛이 무너진다.
 *
 * ⚠️ 옮길 자리는 세 조건을 **동시에** 만족해야 한다. 하나씩 어기며 두 번 실패했다:
 *   ① 카드 통째의 바깥 — 히어로/썸네일 '이미지 바로 앞'에 넣었더니 홈 `a.mge-hero`(grid 이자
 *      링크) 안으로 들어가 제목 칼럼이 눌렸고, 광고가 링크에 갇혔다.
 *   ② 고정 헤더 아래 — 글에서 최상단(top 8px)에 놨더니 `position:fixed` 헤더(하단 81px)가
 *      90px 중 81px 을 덮었다. 첫 화면 안이지만 **보이지는 않는** 최악의 자리였다.
 *   ③ 첫 화면 안 — 대표이미지가 약 500px 을 먹으므로 그 아래로 더 내려가면 650px 화면에서 접힌다.
 *
 * 실측으로 고른 앵커(1180x830 / 1366x650 공통):
 *   글  `.entry-content-wrap` 앞 → 451~541px (헤더 회피 O, 첫 화면 O, 650px 에서 여유 109px)
 *   홈  `.mge-hero` 앞          → 140~230px (헤더 회피 O, 첫 화면 O)
 *
 * ⚠️ 데스크톱 전용. 모바일 상단은 320x50(.mg-inpost-mo)이 따로 있고 이미 0.3화면이다.
 * ⚠️ ins 를 만든 뒤·ba.min.js(async) 실행 전에 도는 관리 블록이라 빈 슬롯 이동은 안전하다.
 */
(function () {
  if (window.innerWidth < 768) return;
  if (document.querySelector('.mg-adtop-moved')) return;   // 중복 실행 가드

  // 글 = 플러그인이 꽂는 .code-block-1, 홈 = 우리 슬롯 .mg-slot--lead
  var ad = document.querySelector('.code-block-1, .mg-slot--lead');
  if (!ad || !ad.querySelector('ins.kakao_ad_area')) return;

  // 되돌릴 수 있게 원래 자리를 먼저 붙잡아 둔다
  var homeParent = ad.parentElement;
  var homeNext = ad.nextSibling;
  if (!homeParent) return;

  function headerBottom() {
    var h = document.querySelector('.site-header, header#masthead');
    if (!h) return 0;
    var pos = getComputedStyle(h).position;
    if (pos !== 'fixed' && pos !== 'sticky') return 0;   // 흐름 안에 있으면 덮지 않는다
    return h.getBoundingClientRect().bottom;
  }

  /* 옮긴 뒤 실제로 '보이는 자리'인지 확인한다. 고정 헤더에 가리거나 첫 화면 밖이면
     이동의 목적 자체가 사라지므로 되돌린다 — 잘못 옮기느니 원위치가 낫다. */
  function landedWell() {
    var ins = ad.querySelector('ins.kakao_ad_area');
    if (!ins) return false;
    // ins 는 미충족 시 display:none 이라 높이가 0 → 부모(슬롯 래퍼) 기준 상단 + 규격 높이로 잰다
    var top = ad.getBoundingClientRect().top;
    var h = parseInt(ins.getAttribute('data-ad-height'), 10) || 90;
    return top >= headerBottom() && (top + h) <= window.innerHeight;
  }

  var anchors = ['.entry-content-wrap', '.mge-hero'];
  for (var i = 0; i < anchors.length; i++) {
    var at = document.querySelector(anchors[i]);
    if (!at || !at.parentElement) continue;

    /* 부모가 grid/flex 면 광고가 레이아웃 아이템이 되어 칼럼을 밀어낸다.
     * 링크 검사는 **부모 기준**이어야 한다 — 광고는 앵커 '앞'(형제)에 들어가므로 앵커 자신이
     * 링크인 건 문제가 아니다. `at.closest('a')` 는 자기 자신을 포함해서, 링크 카드인
     * `.mge-hero` 앞에 넣는 정상 케이스까지 막아 홈이 원위치에 남았다. */
    var d = getComputedStyle(at.parentElement).display;
    if (d === 'grid' || d === 'flex' || d === 'inline-grid' || d === 'inline-flex') continue;
    if (at.parentElement.closest('a')) continue;

    at.parentElement.insertBefore(ad, at);
    if (landedWell()) { ad.classList.add('mg-adtop-moved'); collapseIfEmpty(); return; }
    homeParent.insertBefore(ad, homeNext);   // 원위치
  }

  /* 자리 예약(min-height:90px)은 광고가 늦게 와도 화면이 안 밀리게 하는 CLS 보호다.
     그런데 이 슬롯은 이제 **헤더 바로 아래**라, 안 채워지면 첫 화면 맨 위에 빈 띠로 남는다
     (여백 포함 약 118px — 사용자가 "상단 마진이 크다"고 지적한 바로 그 구간).
     → 4초까지 기다렸다가 그때도 비어 있으면 예약만 푼다. 숨기지 않는 이유는 레일과 같다:
       뒤늦게 채워져도 ins 가 펼쳐지며 자리를 되찾아야 늦게 온 광고의 노출을 안 버린다. */
  function collapseIfEmpty() {
    var ins = ad.querySelector('ins.kakao_ad_area');
    if (!ins) return;
    setTimeout(function () {
      if (ins.children.length || getComputedStyle(ins).display !== 'none') return;
      ad.style.minHeight = '0';
      ad.style.marginTop = '0';
      ad.style.marginBottom = '0';
    }, 4000);
  }
})();
