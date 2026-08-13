/* 뭉게(mungge.com) 본문 좌우 여백에 고정되는 레일 두 개.
 *   오른쪽 = 내부 유도(가이드 허브·무료 계산기)  — 글·홈·카테고리 목록
 *   왼쪽   = 목차(현재 위치 강조)                — 글에서만, 본문 목차가 있을 때만
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
 *    홈·카테고리 목록도 같은 1080px / left 420 기하다(실측) → 같은 계산을 그대로 쓴다.
 *
 * ⚠️ 자리가 없을 때 display:none 으로 숨기지 않고 **아예 만들지 않는다.** 지금은 내부 링크뿐이라
 *    상관없지만, 나중에 이 자리에 애드핏을 넣으면 숨겨진 ins 는 요청조차 안 나가서
 *    "노출 0" 의 원인이 된다(reference_adfit_serving_rules). 처음부터 안 만드는 편이 안전하다.
 *
 * ⚠️ 카테고리는 글 페이지 body 클래스에 없다(Kadence 가 안 넣는다). 글은 **슬러그 접두**로 읽고
 *    (daily-run 이 `YYYY-MM-DD-<카테고리>-...` 로 만든다), 카테고리 목록은 body 의
 *    `category-<슬러그>` 를 쓴다. 둘 다 못 읽으면 가이드 첫 화면으로 보낸다.
 *
 * ⚠️ 목차는 새로 만들지 않고 본문의 `.mg-toc` 를 **읽어서 복제**한다. 목차 생성은
 *    wp-widget.js 에 인라인으로 박혀 있고 그건 관리 블록이 아니라 로컬 수정이 반영되지 않는다
 *    (reference_mungge_footer_widget_blocks). 원본을 건드리지 않는 편이 안전하다.
 *
 * ⚠️ 라이브 SSOT 는 이 파일이 아니라 footer 위젯이다.
 *    수정하면 `node scripts/inject-wp-js.mjs --only MG-DOCK` 로 다시 밀어야 반영된다.
 */
(function () {
  if (!document.body) return;
  var cls = document.body.classList;
  var isPost = cls.contains('single-post');
  var isList = cls.contains('home') || cls.contains('archive');
  if (!isPost && !isList) return;
  if (document.querySelector('.mg-dock')) return;

  var CONTENT = 1080;          // .content-container 실측 폭
  /* GAP+EDGE 를 32 → 20 으로 좁힌 이유: 1440 의 여백이 180px 인데 160x600 광고를 넣으려면
     160 + GAP + EDGE ≤ 180 이어야 한다. 12+8 로 딱 맞춘 값이다. 임의로 줄인 게 아니다. */
  var GAP = 12;                // 판과 레일 사이
  var EDGE = 8;                // 화면 끝 여유
  var MIN_W = 130;             // 이보다 좁아지면 글자가 뭉개진다 → 안 띄운다
  var MAX_W = 260;

  /* ⚠️ 애드핏 160x600 유닛 ID. **비어 있으면 광고를 아예 만들지 않는다.**
     플레이스홀더 문자열(DAN-...-REPLACE-ME 류)을 넣어두면 안 된다 — 과거 VIP 에서 그걸
     그대로 라이브에 내보낸 적이 있다. 발급받은 실제 ID 로 이 한 줄만 채우고
     `node scripts/inject-wp-js.mjs --only MG-DOCK` 로 다시 밀면 켜진다. */
  var AD_UNIT = 'DAN-3Kk2u6ueNQHXmcr7';
  var AD_W = 160, AD_H = 600;

  function railWidth() {
    return Math.min(MAX_W, Math.floor((window.innerWidth - CONTENT) / 2 - GAP - EDGE));
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

  var cat = '', slug = '';
  if (isPost) {
    var canon = document.querySelector('link[rel="canonical"]');
    try { slug = decodeURIComponent((canon && canon.href || location.href).split('/').filter(Boolean).pop() || ''); } catch (e) { slug = ''; }
    var m = slug.match(/^\d{4}-\d{2}-\d{2}-([a-z]+)-/);
    cat = m ? m[1] : '';
  } else {
    for (var i = 0; i < cls.length; i++) {
      var c = cls[i].match(/^category-([a-z-]+)$/);
      if (c && HUB[c[1]]) { cat = c[1]; break; }
    }
  }
  var hub = HUB[cat] || null;
  if (hub && cat === 'finance' && GOV.test(slug)) hub = ['gov-money', '받을 수 있는 돈 받아내기'];

  var links = [];
  if (hub) links.push({ href: '/guide/' + hub[0] + '/', label: hub[1], sub: '주제별로 묶어 보기' });
  links.push({ href: '/guide/', label: '가이드 전체', sub: '의도별 큐레이션 7종' });
  links.push({ href: '/tools/', label: '무료 계산기', sub: '연봉·대출·전기요금 등' });

  /* 제목은 허브가 잡혔을 때만 "이 주제". 홈에는 주제가 없어서 "이 주제 더 보기" 가
     아래 링크(가이드 전체·계산기)와 안 맞는다 — 카테고리를 못 읽은 글에서도 마찬가지다. */
  var LINKS_TITLE = hub ? '이 주제 더 보기' : '둘러보기';

  // ── 스타일 (이 블록 안에서 자급자족한다 — CSS SSOT 를 건드리지 않으려고) ──
  /* ⚠️ 반투명 카드로 만들었다가 한 번 갈아엎었다. 이 레일은 top 고정인데 글 첫 화면은
     **전면 히어로 이미지**라, 배경이 비치는 카드는 사진 위에서 글자가 통째로 안 읽혔다
     (실측 스크린샷). 어떤 배경 위에 놓일지 모르는 고정 요소는 **자기 판을 갖고 있어야 한다.** */
  if (!document.getElementById('mg-dock-css')) {
    var st = document.createElement('style');
    st.id = 'mg-dock-css';
    var HALF = CONTENT / 2 + GAP;
    st.textContent = [
      '.mg-dock,.mg-dock *{box-sizing:border-box;}',
      '.mg-dock{position:fixed;z-index:60;top:120px;',
      'max-height:calc(100vh - 160px);overflow-y:auto;overscroll-behavior:contain;',
      'padding:14px 12px;border-radius:14px;',
      'background:#fff;border:1px solid rgba(0,0,0,.10);',
      'box-shadow:0 6px 24px rgba(0,0,0,.12);',
      'font-size:13px;line-height:1.45;color:#1f2328;}',
      '.mg-dock--r{left:calc(50% + ' + HALF + 'px);}',
      '.mg-dock--l{right:calc(50% + ' + HALF + 'px);}',
      '.mg-dock-t{font-size:11px;font-weight:700;letter-spacing:.04em;opacity:.55;',
      'margin:0 0 10px;padding:0 2px;}',
      /* ⚠️ 셀렉터를 좌/우가 아니라 **역할**(--links / --toc)로 건다. 광고가 오른쪽을
         가져가면 내부 유도가 왼쪽으로 넘어가는데, 좌우로 걸어두면 그때 스타일이 통째로
         빠진다(2026-08-13 실측에서 밟을 뻔한 곳). */
      '.mg-dock a{display:block;text-decoration:none;color:inherit;}',
      '.mg-dock--links .mg-dock-l{padding:9px 10px;margin-bottom:6px;border-radius:9px;',
      'display:block;border:1px solid rgba(0,0,0,.08);background:rgba(0,0,0,.03);',
      'transition:transform .12s ease,border-color .12s ease,background .12s ease;}',
      '.mg-dock--links .mg-dock-l:last-child{margin-bottom:0;}',
      '.mg-dock--links .mg-dock-l:hover{transform:translateY(-1px);border-color:rgba(0,0,0,.26);background:rgba(0,0,0,.06);}',
      // 광고 자리 — 채워지기 전에는 높이를 예약하지 않는다(빈 칸이 남지 않게)
      '.mg-dock-slot{display:flex;justify-content:center;margin:0;}',
      '.mg-dock-slot.is-filled{margin-bottom:0;}',
      '.mg-dock-l b{display:block;font-weight:600;}',
      '.mg-dock-l span{display:block;margin-top:2px;font-size:11px;opacity:.6;}',
      // 목차 — 왼쪽 세로선 + 현재 위치 강조
      '.mg-dock--toc ol{list-style:none;margin:0;padding:0 0 0 10px;border-left:2px solid rgba(0,0,0,.10);}',
      '.mg-dock--toc li{margin:0 0 2px;}',
      '.mg-dock--toc ol a{padding:5px 6px;border-radius:7px;font-size:12px;opacity:.72;',
      'transition:background .12s ease,opacity .12s ease;}',
      '.mg-dock--toc ol a:hover{background:rgba(0,0,0,.05);opacity:1;}',
      '.mg-dock--toc ol a.is-now{opacity:1;font-weight:700;background:rgba(0,0,0,.06);}',
      '.mg-dock-sep{margin:12px 0 10px;border-top:1px solid rgba(0,0,0,.10);}',
      'html[data-mg-theme="dark"] .mg-dock{background:#1b1e24;border-color:rgba(255,255,255,.12);',
      'color:#e6e8ea;box-shadow:0 6px 24px rgba(0,0,0,.45);}',
      'html[data-mg-theme="dark"] .mg-dock--links .mg-dock-l{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.05);}',
      'html[data-mg-theme="dark"] .mg-dock--links .mg-dock-l:hover{border-color:rgba(255,255,255,.32);background:rgba(255,255,255,.09);}',
      'html[data-mg-theme="dark"] .mg-dock--toc ol{border-left-color:rgba(255,255,255,.16);}',
      'html[data-mg-theme="dark"] .mg-dock--toc ol a:hover{background:rgba(255,255,255,.08);}',
      'html[data-mg-theme="dark"] .mg-dock--toc ol a.is-now{background:rgba(255,255,255,.10);}',
      'html[data-mg-theme="dark"] .mg-dock-sep{border-top-color:rgba(255,255,255,.14);}',
      // 자리가 없어지는 구간은 CSS 로도 한 번 더 막는다(리사이즈 중 한 프레임이라도 겹치지 않게)
      // 하한 = CONTENT + 2*(MIN_W + GAP + EDGE) = 1080 + 2*150 = 1380
      '@media (max-width:1379px){.mg-dock{display:none;}}',
      '@media (prefers-reduced-motion:reduce){.mg-dock a{transition:none;}}',
    ].join('');
    document.head.appendChild(st);
  }

  var made = [];

  function mkRail(side, title) {
    var el = document.createElement('aside');
    el.className = 'mg-dock mg-dock--' + side;
    el.style.width = railWidth() + 'px';
    var h = document.createElement('p');
    h.className = 'mg-dock-t';
    h.textContent = title;
    el.appendChild(h);
    document.body.appendChild(el);
    made.push(el);
    return el;
  }

  /* ── 세로 예산 ─────────────────────────────────────────────────────────
     ⚠️ 광고가 실제로 채워지고 나서야 드러난 문제: 160x600 은 **600px 짜리**라
     제목 + 광고 + 링크 3장을 한 판에 넣으면 화면 높이를 넘어 레일 안에 스크롤바가 생긴다
     (2026-08-13 실측). 고정 레일에 내부 스크롤바가 생기면 링크는 잘려서 안 보이고
     보기도 흉하다. → 폭뿐 아니라 **높이도 예산으로 잡고**, 광고가 들어가면 그 레일은
     광고만 담는다. 내부 유도는 반대쪽 레일로 보낸다. */
  var TOP = 120, BOTTOM = 40;
  var vBudget = window.innerHeight - TOP - BOTTOM;
  var CHROME = 28 + 26;                       // 패널 상하 패딩 + 제목 줄
  var adFits = !!AD_UNIT && railWidth() >= AD_W && vBudget >= AD_H + CHROME;

  // ── 오른쪽: 광고가 들어가면 광고만, 아니면 내부 유도 ──
  var right = mkRail('r', adFits ? '광고' : LINKS_TITLE);
  right.setAttribute('aria-label', adFits ? '광고' : LINKS_TITLE);

  if (adFits) {
    var slot = document.createElement('div');
    slot.className = 'mg-dock-slot';
    var ins = document.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.display = 'none';               // 애드핏 표준 스니펫 형식(스크립트가 해제한다)
    ins.setAttribute('data-ad-unit', AD_UNIT);
    ins.setAttribute('data-ad-width', String(AD_W));
    ins.setAttribute('data-ad-height', String(AD_H));
    slot.appendChild(ins);
    right.insertBefore(slot, right.firstChild.nextSibling);   // 제목 바로 아래

    // 채워졌을 때만 자리를 준다(빈 회색칸이 남지 않게)
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
    if (!window.__mgAdKick) {
      window.__mgAdKick = 1;
      var s = document.createElement('script');
      s.src = '//t1.kakaocdn.net/kas/static/ba.min.js';
      s.async = true;
      document.body.appendChild(s);
    }
  }

  function addLinks(rail) {
    rail.classList.add('mg-dock--links');
    links.forEach(function (l) {
      var a = document.createElement('a');
      a.className = 'mg-dock-l';
      a.href = l.href;
      var b = document.createElement('b'); b.textContent = l.label;
      var s = document.createElement('span'); s.textContent = l.sub;
      a.appendChild(b); a.appendChild(s);
      rail.appendChild(a);
    });
  }
  if (!adFits) addLinks(right);   // 광고가 없으면 이 레일이 내부 유도를 맡는다

  // ── 왼쪽: 목차(글) / 내부 유도(목록 페이지) ──
  if (isPost) {
    var srcLinks = [].slice.call(document.querySelectorAll('.mg-toc a[href^="#"]'));
    if (srcLinks.length >= 3) {
      var left = mkRail('l', '목차');
      left.classList.add('mg-dock--toc');
      left.setAttribute('aria-label', '목차');
      var ol = document.createElement('ol');
      var items = [];
      srcLinks.forEach(function (src) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = src.getAttribute('href');
        a.textContent = (src.textContent || '').trim();
        li.appendChild(a); ol.appendChild(li);
        items.push({ a: a, id: a.getAttribute('href').slice(1) });
      });
      left.appendChild(ol);

      /* 광고가 오른쪽을 가져간 글에서는 내부 유도가 갈 곳이 없어진다.
         목차 아래가 남으면 거기에 붙인다 — **남을 때만.** 억지로 넣으면 이 레일에도
         스크롤바가 생겨서 오른쪽에서 방금 고친 문제를 왼쪽에 다시 만드는 꼴이 된다. */
      if (adFits && (vBudget - CHROME - ol.offsetHeight) >= 190) {
        var sep = document.createElement('div');
        sep.className = 'mg-dock-sep';
        left.appendChild(sep);
        addLinks(left);
      }

      // 현재 위치 강조. 화면 상단 30% 선을 지난 마지막 제목을 '지금'으로 본다 —
      // IntersectionObserver 만 쓰면 섹션이 길 때 아무것도 안 걸리는 구간이 생긴다.
      var heads = items.map(function (it) { return document.getElementById(it.id); });
      var cur = -1;
      function spy() {
        var line = window.innerHeight * 0.3, idx = 0;
        for (var i = 0; i < heads.length; i++) {
          if (heads[i] && heads[i].getBoundingClientRect().top <= line) idx = i;
        }
        if (idx === cur) return;
        if (cur >= 0) items[cur].a.classList.remove('is-now');
        cur = idx;
        items[cur].a.classList.add('is-now');
        // 목차가 길면 활성 항목을 보이는 곳으로 끌어온다(레일 안에서만 스크롤)
        var r = items[cur].a.getBoundingClientRect(), lr = left.getBoundingClientRect();
        if (r.top < lr.top + 8 || r.bottom > lr.bottom - 8) {
          left.scrollTop += (r.top - lr.top) - lr.height / 3;
        }
      }
      var raf = 0;
      window.addEventListener('scroll', function () {
        if (raf) return;
        raf = requestAnimationFrame(function () { raf = 0; spy(); });
      }, { passive: true });
      spy();
    }
  } else if (adFits) {
    // 목록 페이지: 오른쪽을 광고가 가져갔으니 내부 유도는 왼쪽으로 보낸다.
    var lf = mkRail('l', LINKS_TITLE);
    lf.setAttribute('aria-label', LINKS_TITLE);
    addLinks(lf);
  }

  // 리사이즈로 폭이 바뀌면 다시 잡는다(제거는 안 한다 — CSS 미디어쿼리가 숨긴다).
  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      var w = railWidth();
      if (w >= MIN_W) made.forEach(function (el) { el.style.width = w + 'px'; });
    }, 150);
  });
})();
