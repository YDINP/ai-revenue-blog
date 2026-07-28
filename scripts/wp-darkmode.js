/* 뭉게(mungge.com) 경량 다크모드 — WP Dark Mode 플러그인 대체.
 *
 * 왜: 플러그인 5.3.10 이 인라인 202KB(설정 blob 95K + b2a 83K + social_share 24K)를
 * 매 페이지에 밀어 넣어 DOMContentLoaded 8.5s / 모바일 27.9s 를 만든다(TTFB 0.48s —
 * 병목은 서버가 아니다). filter 로 화면을 뒤집는 방식이라 색 지정도 불가능하다.
 *
 * 왜 이렇게 짧아도 되나: 위젯 CSS 에 다크 규칙이 이미 90개쯤 있다 — `:root.dark`(약 35,
 * 아무도 .dark 를 안 켜서 死) / `[data-wp-dark-mode-active]`(약 58, 플러그인이 켜주던 속성)
 * / 계산기 26종의 `html.dark .dpc`. 이 파일은 그 스위치 셋을 같이 켜고 나머지만 메운다.
 *
 * ⚠️ 안전 장치: wp_dark_mode_json 이 있으면(=플러그인 활성) 즉시 return. 두 구현이 같은
 *    속성을 서로 토글하면 깨진다. 플러그인을 끄는 순간 자동으로 인계받는다.
 * ⚠️ 라이브 SSOT 는 footer 위젯(custom_html-2).
 *    수정 후 `node scripts/inject-wp-js.mjs --only MG-DARK` 로 다시 밀 것.
 */
(function () {
  var root = document.documentElement;

  if (window.wp_dark_mode_json) return;                 // 플러그인 활성 → 아무것도 안 함
  if (document.getElementById('mg-dark-css')) return;   // 중복 주입 방지

  var KEY = 'mgTheme';
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) {}
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var dark = (stored === 'dark' || stored === 'light') ? stored === 'dark' : !!(mq && mq.matches);

  /* @D 는 아래에서 한 번에 치환(접두어 60회 반복이면 그것만으로 3KB). 색 전환에
     transition 을 주지 않는다(요소마다 보간 속도가 달라 깜빡임). 팔레트는 `:root`(0,1,0)
     보다 높은 (0,1,1)로 선언해 로드 순서와 무관하게 이긴다.
     ⚠️ 이 테마는 palette4 를 본문 글자색이자 푸터/히어로 배경으로, palette9 를 콘텐츠
     배경이자 헤더 글자색으로 겸용한다 — 변수만 뒤집으면 헤더·푸터가 뒤집힌다. */
  var CSS = [
    /* 토글: Kadence 맨위로(#kt-scroll-up, 30/30px) 위에 쌓고,
       모바일 앵커 광고(.mg-anchor)가 채워졌을 때만 더 띄운다. */
    '.mg-dm-btn{position:fixed;right:22px;bottom:80px;z-index:9999;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;line-height:0;-webkit-appearance:none;appearance:none;border:1px solid rgba(15,20,32,.12);background:#fff;color:#3a4557;box-shadow:0 6px 20px -6px rgba(15,20,32,.35)}',
    /* ⚠️ Kadence 가 맨 button 의 :hover/:focus/:active 를 palette2 배경으로 칠한다 — html 을 붙여 이긴다 */
    'html .mg-dm-btn:hover,html .mg-dm-btn:focus,html .mg-dm-btn:active{background:#f1f5ff;color:#4f7cff;border-color:rgba(79,124,255,.4)}',
    '.mg-dm-btn:active{transform:scale(.94)}',
    '.mg-dm-btn:focus-visible{outline:3px solid rgba(79,124,255,.65);outline-offset:2px}',
    '@media (max-width:782px){.mg-dm-btn{right:14px;bottom:74px;width:42px;height:42px}}',
    'body:has(.mg-anchor .kakao_ad_area iframe) .mg-dm-btn{bottom:196px}',
    '@media print{.mg-dm-btn{display:none}}',
    '@D .mg-dm-btn{background:#1c2433;border-color:rgba(255,255,255,.16);color:#e8ebf0;box-shadow:0 6px 20px -6px rgba(0,0,0,.6)}',
    '@D .mg-dm-btn:hover,@D .mg-dm-btn:focus,@D .mg-dm-btn:active{background:#243049;color:#8fb0ff;border-color:rgba(143,176,255,.4)}',

    /* 1·2=accent(#1a2130 위 6.4:1), 3=h1~h3, 4=본문·h4·h5, 8=body 배경, 9=콘텐츠 배경 */
    '@D,@D body{--global-palette1:#7aa2ff;--global-palette2:#a5c0ff;--global-palette3:#f2f3f5;',
    '--global-palette4:#dfe3ea;--global-palette5:#c5cbd8;--global-palette6:#a9b1bd;',
    '--global-palette7:#161c27;--global-palette8:#12161f;--global-palette9:#1a2130;',
    '--color-text:#e6e7ea;--color-text-secondary:#a9abb0;color-scheme:dark}',
    '@D{background-color:#12161f}@D body{color:#dfe3ea}',
    '@D hr,@D .entry-content-wrap hr{border-color:rgba(255,255,255,.1)}',

    /* 헤더 글자: 테마는 palette9(=이제 어두움), 홈은 위젯 CSS 가 #1e293b !important 를
       쓴다. !important 끼리는 특정도로 갈리므로 접두어를 붙여 이긴다.
       (배경 #1d1f27 은 위젯 CSS 의 [data-wp-dark-mode-active] 규칙이 준다) */
    '@D #masthead .site-title,@D #masthead .site-title a,@D #masthead .site-branding .site-description,',
    '@D #masthead .header-navigation a,@D #masthead .header-menu-container a,',
    '@D body.home #masthead a,@D body.home #masthead .site-title,@D body.home #masthead .site-title a,',
    '@D body.home .header-navigation a,@D body.home .header-menu-container a{color:#e8ebf0 !important}',
    '@D #masthead .header-navigation a:hover,@D body.home #masthead a:hover,',
    '@D body.home .header-navigation a:hover{color:#8fb0ff !important}',
    '@D .mobile-toggle-open-container .menu-toggle-open,@D .search-toggle-open-container .search-toggle-open{color:#e8ebf0}',
    '@D .site-header.mg-stuck .site-header-row-container-inner{background-color:rgba(29,31,39,.9);-webkit-backdrop-filter:saturate(1.2) blur(10px);backdrop-filter:saturate(1.2) blur(10px)}',
    '@D .header-navigation .header-menu-container ul ul.sub-menu,@D .header-navigation .header-menu-container ul ul.submenu{background:#1c2433}',
    '@D .header-navigation .header-menu-container ul ul li.menu-item>a{color:#dfe3ea}',
    '@D .header-navigation .header-menu-container ul ul li.menu-item>a:hover,',
    '@D .header-navigation .header-menu-container ul ul li.menu-item.current-menu-item>a{color:#fff;background:#2a3550}',
    /* 모바일 서랍 링크색이 palette8(=이제 배경색) — 두면 검정 위 검정 */
    '@D .popup-drawer .drawer-inner{background:#151b26}',
    '@D .mobile-navigation ul li>a,@D .mobile-navigation ul li.menu-item-has-children>.drawer-nav-drop-wrap{color:#e8ebf0}',
    '@D #mobile-drawer .drawer-header .drawer-toggle{color:#e8ebf0}',

    /* 히어로 밴드·푸터 — palette4 겸용 되돌리기 */
    '@D .wp-site-blocks .entry-hero-container-inner{background:#141b28}',
    '@D #colophon{background:#0d121b}@D #colophon .footer-html{color:#98a2b3}',
    '@D .site-footer .site-top-footer-wrap .site-footer-row-container-inner,',
    '@D .site-footer .site-top-footer-wrap a:not(.button):not(.wp-block-button__link):not(.wp-element-button),',
    '@D .site-top-footer-inner-wrap .widget-area .widget-title{color:#c8cfdb}',
    '@D .site-footer .site-top-footer-wrap .site-footer-row-container-inner{border-bottom-color:rgba(255,255,255,.08)}',

    /* Easy TOC 목차 상자 — 외부 CSS 가 #f9f9f9, 인라인이 `div#ez-toc-container`(1,0,1)
       라서 접두어를 붙인 (1,1,1)로 이긴다. 실측상 유일하게 남던 밝은 면. */
    '@D #ez-toc-container{background:#161d2b;border-color:rgba(255,255,255,.12);box-shadow:none}',
    '@D #ez-toc-container .ez-toc-title,@D #ez-toc-container a,@D #ez-toc-container li,@D .ez-toc-box-title{color:#dfe3ea}',
    '@D #ez-toc-container a:hover{color:#8fb0ff}',
    '@D #ez-toc-container .ez-toc-toggle,@D #ez-toc-container .ez-toc-js-toggle{color:#a9b1bd}',

    /* 폼 — UA 기본 흰 배경이 남으면 입력값이 안 보임 */
    '@D input:not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]),',
    '@D select,@D textarea{background-color:#141b28;color:#e8ebf0;border-color:rgba(255,255,255,.14)}',
    '@D ::placeholder{color:#7d8798;opacity:1}',

    /* /tools/ 인덱스. 계산기(.dpc)는 자체 `html.dark` 팔레트 보유 */
    '@D .mgt{--mgt-line:#25304a;--mgt-mut:#9fb0c6;--mgt-text:#eef2f8;--mgt-accent:#8fa5ff;--mgt-surface:#151d2c;--mgt-soft:#111825}',
    '@D .mgt-card:hover{box-shadow:0 6px 18px rgba(0,0,0,.45)}',
    '@D .mgt-tag{background:rgba(143,165,255,.16)}',
    '@D .pum-container.popmake{background-color:#151b26;color:#dfe3ea}'
  ].join('').replace(/@D/g, 'html[data-mg-theme="dark"]');

  var style = document.createElement('style');
  style.id = 'mg-dark-css';
  style.textContent = CSS;
  (document.head || root).appendChild(style);

  var SUN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M17.7 6.3l1.4-1.4M4.9 19.1l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>';
  var btn = null;

  function apply(on) {
    dark = on;
    // data-mg-theme 이 우리 스위치. 나머지 셋은 기존 규칙용 하위 호환.
    root.setAttribute('data-mg-theme', on ? 'dark' : 'light');
    root.classList.toggle('dark', on);
    root.classList.toggle('wp-dark-mode-active', on);
    if (on) root.setAttribute('data-wp-dark-mode-active', 'true');
    else root.removeAttribute('data-wp-dark-mode-active');
    root.style.colorScheme = on ? 'dark' : 'light';
    if (btn) {
      btn.innerHTML = on ? SUN : MOON;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      var label = on ? '라이트 모드로 전환' : '다크 모드로 전환';
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  }

  apply(dark);

  function mount() {
    if (!document.body || document.getElementById('mg-dm-btn')) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'mg-dm-btn';
    btn.className = 'mg-dm-btn';
    btn.setAttribute('role', 'switch');
    btn.addEventListener('click', function () {
      var next = !dark;
      try { localStorage.setItem(KEY, next ? 'dark' : 'light'); } catch (e) {}
      apply(next);
    });
    document.body.appendChild(btn);
    apply(dark);   // 버튼 아이콘/라벨 채우기
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // 저장된 선택이 없을 때만 OS 설정을 따라간다
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function (e) {
      var s = null;
      try { s = localStorage.getItem(KEY); } catch (err) {}
      if (s !== 'dark' && s !== 'light') apply(e.matches);
    });
  }
})();
