/* 뭉게(mungge.com) 글 페이지 우측 여백에 고정되는 내부 유도 레일.
 * (주석에도 script 태그 문자열은 쓰지 않는다 — HTML 파서 상태를 건드릴 여지를 없애려고)
 *
 * ⚠️ 이름에 banner/ad/sponsor 를 쓰지 않는다. 광고차단기가 EasyList 규칙으로 클래스·경로
 *    문자열을 매칭해 **네트워크 차단**한다(자사 프로모도 오차단된다). → 클래스는 mg-dock-*.
 *
 * ── 임계값 근거 (실측. 처음에 틀렸던 곳) ──────────────────────────────────
 * ⚠️ 처음엔 CSS 변수 --global-content-width: 1290px 를 본문 폭으로 보고 1600px 을 하한으로
 *    잡았다. **틀렸다.** 그건 겉 컨테이너 값이고, 실제로 배경이 칠해진 판은
 *    `article.entry.content-bg` = **1032px**, 그 바깥 박스가 `.content-container` = 1080px 다.
 *    (읽는 칼럼 `.entry-content` 는 968px.) 그래서 진짜 여백은 훨씬 넓다:
 *        1920 → 420px   1600 → 260px   1440 → 180px
 *    1440 을 "자리 없음"으로 잘라내고 있었는데 실제로는 180px 이 남는다.
 *    → 기준을 1080px 판 기준으로 다시 잡고 하한을 1400px 로 내렸다.
 *    교훈: 레이아웃 폭은 CSS 변수 이름을 믿지 말고 **렌더된 박스를 재라.**
 * 폭은 고정하지 않고 남는 여백에서 계산한다(1440 에서 148px, 1920 에서 260px).
 *
 * ⚠️ 자리가 없을 때 display:none 으로 숨기지 않고 **아예 만들지 않는다.** 지금은 내부 링크뿐이라
 *    상관없지만, 나중에 이 자리에 애드핏을 넣으면 숨겨진 ins 는 요청조차 안 나가서
 *    "노출 0" 의 원인이 된다(reference_adfit_serving_rules). 처음부터 안 만드는 편이 안전하다.
 *
 * ⚠️ 카테고리는 body 클래스에 없다(Kadence 가 안 넣는다). 대신 **슬러그 접두**를 쓴다 —
 *    daily-run 이 `YYYY-MM-DD-<카테고리>-...` 로 슬러그를 만든다. 못 읽으면 가이드 첫 화면으로 보낸다.
 *
 * ⚠️ 라이브 SSOT 는 이 파일이 아니라 footer 위젯이다.
 *    수정하면 `node scripts/inject-wp-js.mjs --only MG-DOCK` 로 다시 밀어야 반영된다.
 */
(function () {
  if (!document.body || !document.body.classList.contains('single-post')) return;
  if (document.querySelector('.mg-dock')) return;

  var CONTENT = 1080;          // .content-container 실측 폭(판 = article.entry 1032 + 여백)
  var GAP = 20;                // 판과 레일 사이
  var EDGE = 12;               // 화면 끝 여유
  var MIN_W = 130;             // 이보다 좁아지면 글자가 뭉개진다 → 안 띄운다
  var MAX_W = 260;

  function railWidth() {
    var margin = (window.innerWidth - CONTENT) / 2;
    return Math.min(MAX_W, Math.floor(margin - GAP - EDGE));
  }
  if (railWidth() < MIN_W) return;

  // ── 카테고리 → 가이드 허브 ──
  var HUB = {
    finance: ['asset', '세금 줄이고 굴리기'],
    lifestyle: ['home-life', '집·생활비·건강 지키기'],
    health: ['home-life', '집·생활비·건강 지키기'],
    travel: ['home-life', '집·생활비·건강 지키기'],
    education: ['career', '자격증·커리어 세팅'],
    ai: ['ai', 'AI로 일 줄이기'],
    dev: ['dev', '개발 실무 다지기'],
    game: ['indie-game', '인디게임 만들어 팔기'],
    review: ['home-life', '집·생활비·건강 지키기'],
  };
  // 정부지원금 성격의 글은 asset 보다 gov-money 가 맞다 — 슬러그에 신호가 있으면 갈아탄다.
  var GOV = /(지원금|보조금|장려금|수당|바우처|subsidy|support|benefit|incentive|allowance)/i;

  var canon = document.querySelector('link[rel="canonical"]');
  var slug = '';
  try { slug = decodeURIComponent((canon && canon.href || location.href).split('/').filter(Boolean).pop() || ''); } catch (e) { slug = ''; }
  var m = slug.match(/^\d{4}-\d{2}-\d{2}-([a-z]+)-/);
  var cat = m ? m[1] : '';
  var hub = HUB[cat] || null;
  if (hub && cat === 'finance' && GOV.test(slug)) hub = ['gov-money', '받을 수 있는 돈 받아내기'];

  var links = [];
  if (hub) links.push({ href: '/guide/' + hub[0] + '/', label: hub[1], sub: '주제별로 묶어 보기' });
  links.push({ href: '/guide/', label: '가이드 전체', sub: '의도별 큐레이션 7종' });
  links.push({ href: '/tools/', label: '무료 계산기', sub: '연봉·대출·전기요금 등' });

  // ── 스타일 (이 블록 안에서 자급자족한다 — CSS SSOT 를 건드리지 않으려고) ──
  if (!document.getElementById('mg-dock-css')) {
    var st = document.createElement('style');
    st.id = 'mg-dock-css';
    /* ⚠️ 반투명 카드로 만들었다가 한 번 갈아엎었다. 이 레일은 top:120px 에 고정되는데
       글 첫 화면은 **전면 히어로 이미지**라, 배경이 비치는 카드는 사진 위에서 글자가 통째로
       안 읽혔다(실측 스크린샷). 어떤 배경 위에 놓일지 모르는 고정 요소는 **자기 판을 갖고
       있어야 한다** → 불투명 패널 + 그림자. */
    st.textContent = [
      '.mg-dock,.mg-dock *{box-sizing:border-box;}',
      '.mg-dock{position:fixed;z-index:60;top:120px;',
      'left:calc(50% + ' + (CONTENT / 2 + GAP) + 'px);',
      'max-height:calc(100vh - 160px);overflow-y:auto;',
      'padding:14px 12px;border-radius:14px;',
      'background:#fff;border:1px solid rgba(0,0,0,.10);',
      'box-shadow:0 6px 24px rgba(0,0,0,.12);',
      'font-size:13px;line-height:1.45;color:#1f2328;}',
      '.mg-dock-t{font-size:11px;font-weight:700;letter-spacing:.04em;opacity:.55;',
      'margin:0 0 10px;padding:0 2px;}',
      '.mg-dock a{display:block;padding:9px 10px;margin-bottom:6px;border-radius:9px;',
      'text-decoration:none;border:1px solid rgba(0,0,0,.08);background:rgba(0,0,0,.03);',
      'color:inherit;transition:transform .12s ease,border-color .12s ease,background .12s ease;}',
      '.mg-dock a:last-child{margin-bottom:0;}',
      '.mg-dock a:hover{transform:translateY(-1px);border-color:rgba(0,0,0,.26);background:rgba(0,0,0,.06);}',
      '.mg-dock b{display:block;font-weight:600;}',
      '.mg-dock span{display:block;margin-top:2px;font-size:11px;opacity:.6;}',
      'html[data-mg-theme="dark"] .mg-dock{background:#1b1e24;border-color:rgba(255,255,255,.12);',
      'color:#e6e8ea;box-shadow:0 6px 24px rgba(0,0,0,.45);}',
      'html[data-mg-theme="dark"] .mg-dock a{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.05);}',
      'html[data-mg-theme="dark"] .mg-dock a:hover{border-color:rgba(255,255,255,.32);background:rgba(255,255,255,.09);}',
      // 자리가 없어지는 구간은 CSS 로도 한 번 더 막는다(리사이즈 중 한 프레임이라도 겹치지 않게)
      // 하한 = CONTENT + 2*(MIN_W + GAP + EDGE) = 1080 + 2*162 = 1404
      '@media (max-width:1403px){.mg-dock{display:none;}}',
      '@media (prefers-reduced-motion:reduce){.mg-dock a{transition:none;}}',
    ].join('');
    document.head.appendChild(st);
  }

  var el = document.createElement('aside');
  el.className = 'mg-dock';
  el.setAttribute('aria-label', '관련 모음');
  el.style.width = railWidth() + 'px';

  var h = document.createElement('p');
  h.className = 'mg-dock-t';
  h.textContent = '이 주제 더 보기';
  el.appendChild(h);

  links.forEach(function (l) {
    var a = document.createElement('a');
    a.href = l.href;
    var b = document.createElement('b'); b.textContent = l.label;
    var s = document.createElement('span'); s.textContent = l.sub;
    a.appendChild(b); a.appendChild(s);
    el.appendChild(a);
  });

  document.body.appendChild(el);

  // 리사이즈로 자리가 사라지면 폭만 다시 잡는다(제거는 안 한다 — CSS 미디어쿼리가 숨긴다).
  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      var w = railWidth();
      if (w >= MIN_W) el.style.width = w + 'px';
    }, 150);
  });
})();
