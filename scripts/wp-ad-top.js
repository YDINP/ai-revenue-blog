/* 데스크톱 상단 728x90 을 첫 화면 안으로 올린다.
 *
 * 왜: 이 유닛이 최대 수익원인데(08-04 적립 비중 28.6%, 07-27~30 누적 147원으로 1위)
 * 뷰어빌리티가 78% ↔ 40% 로 널뛴다. 원인은 위치가 **딱 접히는 선에 걸쳐 있어서**다.
 *   1280x900 → 819px(0.91화면) · 1366x650 → 819px(1.26화면, 첫 화면 완전히 밖)
 * 노트북 흔한 높이(650px 안팎)에서 통째로 접히므로, 스크롤을 안 하는 방문자가 많은 날
 * 이 유닛만 무너진다. 08-04 가 그 날이었다(PV 데스크톱 45/모바일 7, 728x90 78%→40%).
 *
 * 왜 대표이미지 '위'인가: 이미지가 0.56화면(약 500px)을 먹어 그 아래는 어디에 둬도
 * 짧은 뷰포트에서 접힌다. 제목 위(이미지 아래)는 650px 에서 여유가 53px 뿐이라
 * 그보다 짧은 화면에서 다시 걸린다. 최상단은 모든 뷰포트에서 7~9px — 여유가 확실하다.
 * (측정: A 7px 완전노출 O / B 507px O·여유 53px / C 현행 819px X)
 *
 * ⚠️ 데스크톱 전용이다. 모바일 상단은 320x50(.mg-inpost-mo)이 따로 있고 이미 0.4화면이라
 *    건드릴 이유가 없다. .code-block-1 은 모바일에서 부모가 display:none 이라 어차피 무영향.
 * ⚠️ ins 를 만든 뒤·ba.min.js(async) 실행 전에 도는 관리 블록이라 빈 슬롯 이동은 안전하다.
 *    채워진 뒤 옮기면 iframe 이 재로드된다.
 */
(function () {
  if (window.innerWidth < 768) return;
  if (document.querySelector('.mg-adtop-moved')) return;   // 중복 실행 가드

  // 글 = 플러그인이 꽂는 .code-block-1, 홈 = 우리 슬롯 .mg-slot--lead
  var ad = document.querySelector('.code-block-1, .mg-slot--lead');
  if (!ad || !ad.querySelector('ins.kakao_ad_area')) return;

  // 글은 대표이미지 앞, 홈은 히어로 이미지 앞. 이미지가 figure/a 로 감싸여 있으면
  // 그 바깥으로 빼야 래퍼 스타일(캡션 정렬 등)을 물려받지 않는다.
  var hero = document.querySelector('img.post-top-featured, .mge-hero__fig');
  if (!hero) return;
  var host = hero.closest('figure, .mge-hero__fig') || hero;
  if (!host.parentElement || host.parentElement.contains(ad) === false) {
    // 광고와 앵커가 다른 컨테이너에 있어도 삽입 자체는 가능하다 — 부모만 있으면 된다
    if (!host.parentElement) return;
  }

  host.parentElement.insertBefore(ad, host);
  ad.classList.add('mg-adtop-moved');
})();
