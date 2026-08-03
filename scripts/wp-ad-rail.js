/* 모바일 홈: 레일 광고(300x250)를 최신글 피드 안으로 끌어올린다.
 *
 * 왜: 데스크톱은 사이드 레일이라 1.8화면 깊이인데, 모바일에서 .mg-cols 가 세로로 쌓이면서
 * 레일이 최신글 12개 밑(8.0화면 / 홈 전체 10.2화면)으로 밀린다. 거기까지 내려오는 독자가
 * 거의 없어 07-27~30 실측 뷰어빌리티가 33% 였다 — 렌더는 되는데 75건 중 25건만 노출.
 * 같은 기간 1화면 이내 유닛은 71~95% 였으니, 손실 원인은 재고가 아니라 순전히 깊이다.
 *
 * 왜 3번째 카드 뒤인가: 모바일 홈 카드가 1.6 / 2.1 / 2.6 / 3.0화면 간격으로 서므로
 * 3번째 뒤가 약 3화면. 상단 광고(1.2화면)와 1.8화면 벌어져 한 화면에 두 광고가 같이
 * 잡히지 않는다(하단 앵커가 항상 떠 있어 간격을 더 좁히면 심사에서 밀도 문제가 된다).
 *
 * ⚠️ 실행 순서: 이 블록은 위젯 JS 안에서 ②-b(ins 생성) 뒤, ba.min.js(async) 실행 앞에
 * 돈다. 애드핏이 DOM 을 훑기 전이라 빈 ins 를 통째로 옮겨도 안전하다.
 * 채워진 뒤에 옮기면 iframe 이 재로드되므로 이 순서가 깨지면 안 된다.
 */
(function () {
  if (window.innerWidth >= 768) return;              // 데스크톱은 원래 자리가 더 좋다
  if (document.querySelector('.mg-infeed')) return;  // 중복 실행 가드

  var panel = document.querySelector('.mg-panel--slot');
  if (!panel || !panel.querySelector('.mg-slot--rail')) return;

  var cards = document.querySelectorAll('.mg-cols ul.wp-block-latest-posts__list > li');
  if (cards.length < 5) return;                      // 목록이 짧으면 굳이 끼우지 않는다

  // ul 의 자식은 li 여야 한다(그리드 아이템이기도 하다) → div 를 그대로 꽂지 않고 li 로 감싼다
  var li = document.createElement('li');
  li.className = 'mg-infeed';
  li.style.listStyle = 'none';
  li.appendChild(panel);
  cards[2].insertAdjacentElement('afterend', li);

  /* 자리 예약(.mg-slot--rail:not(:empty){min-height:250px})은 그대로 둔다 —
   * 피드 한가운데라 늦게 채워지며 밀리면 독자가 보던 카드가 움직인다(글 하단 슬롯이
   * 예약을 안 하는 것과 반대인 이유: 그쪽은 본문 끝이라 밀려도 가릴 게 없다).
   * 다만 끝내 안 채워지면 카드 사이에 250px 빈 구멍이 남는다. 이 슬롯은 3.1화면 아래라
   * 로드 직후엔 화면 밖이므로, 그동안 안 채워졌으면 접는다 — 눈에 보이는 이동이 없다.
   * 숨기지 않고 예약만 푸는 이유: 뒤늦게 채워져도 ins 가 펼쳐지며 자연히 자리를 되찾는다
   * (display:none 으로 덮으면 늦게 온 광고의 노출을 통째로 버린다). */
  var slot = panel.querySelector('.mg-slot--rail');
  var ins = slot.querySelector('ins.kakao_ad_area');
  setTimeout(function () {
    if (!ins) return;
    var filled = ins.children.length || getComputedStyle(ins).display !== 'none';
    if (filled) return;
    slot.style.minHeight = '0';
    panel.style.padding = '0';
  }, 4000);
})();
