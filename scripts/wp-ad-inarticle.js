/* 뭉게(mungge.com) 본문 중간 — 글 한가운데 h2 앞에 애드핏 300x250.
 * (주석에도 script 태그 문자열은 쓰지 않는다 — HTML 파서 상태를 건드릴 여지를 없애려고)
 *
 * 유닛: DAN-oesQNvC9LkoKaVfg (300x250, 이 자리 전용으로 발급)
 * 왜 필요했나: 글 페이지 광고가 전부 본문 시작 전에 몰려 있었다(728x90 + 320x50 상단,
 * 320x100 앵커). 글은 h2 가 8~11개에 본문 높이 5,100~9,100px 인데 중간이 통째로 비어 있고,
 * 그쯤이면 상단 배너는 이미 화면 밖이다.
 *
 * 삽입 위치: **본문 높이의 50% 에 가장 가까운 h2 바로 앞**.
 * - 문단 한가운데가 아니라 섹션 경계라 읽는 흐름을 덜 끊는다.
 * - 첫 h2 와 마지막 h2 는 후보에서 뺀다 — 첫 h2 는 상단 광고와 너무 가깝고,
 *   마지막은 대개 "자주 묻는 질문"이라 하단 광고와 붙는다.
 * - 고른 지점이 30~70% 밖이면 넣지 않는다(치우친 자리에 끼우느니 없는 게 낫다).
 * - 짧은 글(본문 3000px 미만 또는 h2 4개 미만)에는 넣지 않는다.
 * 실측 기준 세 글 모두 49~51% 지점에 정확히 붙는다.
 *
 * 모바일에도 넣는다 — 앵커(≤782px, 화면 바닥 고정)와 붙는 건 글 *끝*에 멈춰 있을 때가
 * 문제인데, 중간 슬롯은 스크롤로 지나가는 자리라 기존 본문 상단 광고와 조건이 같다.
 * (글 하단 슬롯을 데스크톱으로 제한한 이유는 wp-ad-postend.js 주석 참고)
 *
 * ⚠️ 자리(min-height)는 미리 예약하지 않는다 — 사유는 CSS 의 .mg-adslot 주석 참고.
 * ⚠️ 애드핏은 자동화 브라우저(headless/headed 둘 다)에 서빙하지 않는다. 노출 검증은 사람 몫.
 *
 * ⚠️ 라이브 SSOT 는 이 파일이 아니라 footer 위젯이다.
 *    수정하면 `node scripts/inject-wp-js.mjs --only MG-ADMID` 로 다시 밀어 넣어야 반영된다.
 */
(function () {
  if (!document.body || !document.body.classList.contains('single-post')) return;
  if (document.querySelector('.mg-adslot--mid')) return;

  var ec = document.querySelector('article.single-entry .entry-content');
  if (!ec) return;

  var hs = ec.querySelectorAll('h2');
  if (hs.length < 4) return;                 // 섹션이 적으면 중간이랄 게 없다
  var total = ec.scrollHeight;
  if (total < 3000) return;                  // 짧은 글엔 넣지 않는다

  var base = ec.offsetTop;
  var best = null;
  var bestGap = 1;
  for (var i = 1; i < hs.length - 1; i++) {  // 첫·마지막 h2 제외
    var pos = (hs[i].offsetTop - base) / total;
    var gap = Math.abs(pos - 0.5);
    if (gap < bestGap) { bestGap = gap; best = hs[i]; }
  }
  if (!best || bestGap > 0.2) return;        // 30~70% 밖이면 포기

  var slot = document.createElement('div');
  slot.className = 'mg-adslot mg-adslot--mid';

  var ins = document.createElement('ins');
  ins.className = 'kakao_ad_area';
  ins.style.display = 'none';                // 애드핏 표준 스니펫 형식(스크립트가 해제한다)
  ins.setAttribute('data-ad-unit', 'DAN-oesQNvC9LkoKaVfg');
  ins.setAttribute('data-ad-width', '300');
  ins.setAttribute('data-ad-height', '250');
  slot.appendChild(ins);

  best.parentNode.insertBefore(slot, best);

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

  if (!window.__mgAdKick) {
    window.__mgAdKick = 1;
    var s = document.createElement('script');
    s.src = '//t1.kakaocdn.net/kas/static/ba.min.js';
    s.async = true;
    document.body.appendChild(s);
  }
})();
