/* mungge.com 위젯 프론트 JS — footer 위젯에 1회 임베드. (kses: ben=unfiltered_html이라 생존)
   ① 코드블록 복사버튼 ② 모바일 앵커 닫기 + ba.min.js 중복로드 가드
   ③ 목차(TOC) 자동생성 ④ FAQPage JSON-LD 스키마 */
(function () {
  // ── ① 코드 복사버튼 ──
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.cc-copy');
    if (!b) return;
    var c = b.closest('.code-card'), code = c && c.querySelector('code');
    if (!code || !navigator.clipboard) return;
    navigator.clipboard.writeText(code.innerText).then(function () {
      b.textContent = '복사됨!';
      setTimeout(function () { b.textContent = '복사'; }, 1400);
    });
  });

  // ── ② 앵커 닫기 + ba.min.js 가드 ──
  try { if (sessionStorage.getItem('mgAnchorClosed')) { var a0 = document.querySelector('.mg-anchor'); if (a0) a0.classList.add('mg-closed'); } } catch (e) {}
  document.addEventListener('click', function (e) {
    var x = e.target.closest && e.target.closest('.mg-anchor-x');
    if (!x) return;
    var a = x.closest('.mg-anchor'); if (a) a.classList.add('mg-closed');
    try { sessionStorage.setItem('mgAnchorClosed', '1'); } catch (_) {}
  });
  if (!document.querySelector('script[src*="ba.min.js"]')) {
    var s = document.createElement('script');
    s.src = '//t1.kakaocdn.net/kas/static/ba.min.js'; s.async = true;
    document.body.appendChild(s);
  }

  // ── 홈 동적 요소 (리디자인 v2) ──────────────────────────────────────────
  // 스티키 헤더 · 스크롤 리빌은 전 페이지, 인기 티커 · 카테고리 필터는 홈 전용.
  // 전부 점진적 향상: JS 실패/미실행이어도 원래 레이아웃 그대로 남는다.
  document.documentElement.classList.add('mg-js');

  // (a) 스티키 헤더 — 24px 넘게 스크롤되면 축소 + 그림자
  var mgHdr = document.querySelector('.site-header');
  if (mgHdr) {
    var mgStick = function () { mgHdr.classList.toggle('mg-stuck', window.scrollY > 24); };
    mgStick();
    window.addEventListener('scroll', mgStick, { passive: true });
  }

  // (b) 스크롤 리빌 — 카드류가 뷰포트에 들어올 때 페이드업
  if ('IntersectionObserver' in window) {
    var mgIo = new IntersectionObserver(function (ens) {
      ens.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('mg-in');
        mgIo.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    var mgCards = document.querySelectorAll('.mg-cats__card, .mg-featured__card, .wp-block-latest-posts.is-grid > li');
    [].forEach.call(mgCards, function (el, i) {
      el.classList.add('mg-reveal');
      el.style.transitionDelay = (i % 3) * 60 + 'ms';   // 행 단위 계단식
      mgIo.observe(el);
    });
  }

  if (document.body.classList.contains('home')) {
    var mgReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // (c) 인기 티커 — 인기 글 섹션 데이터를 재사용(추가 요청 0). 히어로 위에 배치
    var mgFeat = document.querySelectorAll('.mg-featured__card');
    if (mgFeat.length && !mgReduce) {
      var mgItems = [].map.call(mgFeat, function (a) {
        return { href: a.getAttribute('href'), text: ((a.querySelector('.mg-featured__title') || {}).textContent || '').trim() };
      });
      var mgMake = function (dup) {
        return mgItems.map(function (it) {
          var a = document.createElement('a');
          a.className = 'mg-ticker__item';
          a.href = it.href;
          a.textContent = '🔥 ' + it.text;
          if (dup) { a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; }
          return a;
        });
      };
      var mgTick = document.createElement('div');
      mgTick.className = 'mg-ticker';
      mgTick.innerHTML = '<span class="mg-ticker__label">인기</span><div class="mg-ticker__viewport"><div class="mg-ticker__track"></div></div>';
      var mgTrack = mgTick.querySelector('.mg-ticker__track');
      // translateX(-50%) 무한루프가 이음새 없이 돌려면 트랙에 정확히 2벌이 필요
      mgMake(false).concat(mgMake(true)).forEach(function (n) { mgTrack.appendChild(n); });
      var mgHero = document.querySelector('.mungge-hero');
      if (mgHero && mgHero.parentNode) mgHero.parentNode.insertBefore(mgTick, mgHero);
    }

    // (d) 카테고리 필터 — 최신글 그리드를 REST 카테고리로 태깅 후 칩으로 필터
    var mgGrid = document.querySelector('.wp-block-latest-posts.is-grid');
    if (mgGrid) {
      var mgLis = [].slice.call(mgGrid.children);
      var mgHead = document.createElement('div');
      mgHead.className = 'mg-latest-head';
      mgHead.innerHTML = '<h2>📰 최신 글</h2><div class="mg-filter"></div>';
      mgGrid.parentNode.insertBefore(mgHead, mgGrid);   // 데이터 실패해도 제목은 남김
      var mgBar = mgHead.querySelector('.mg-filter');
      var mgNorm = function (u) {
        try { return new URL(u, location.origin).pathname.replace(/\/+$/, ''); } catch (e) { return u; }
      };
      Promise.all([
        fetch('/wp-json/wp/v2/posts?per_page=' + mgLis.length + '&_fields=link,categories').then(function (r) { return r.json(); }),
        fetch('/wp-json/wp/v2/categories?per_page=50&_fields=id,name').then(function (r) { return r.json(); })
      ]).then(function (res) {
        var posts = res[0], cats = res[1];
        if (!Array.isArray(posts) || !Array.isArray(cats)) return;
        var mgName = {};
        cats.forEach(function (c) { mgName[c.id] = c.name; });
        var mgByPath = {};
        posts.forEach(function (p) { mgByPath[mgNorm(p.link)] = p.categories || []; });
        var mgCount = {};
        mgLis.forEach(function (li) {
          var a = li.querySelector('a[href]');
          if (!a) return;
          var names = (mgByPath[mgNorm(a.getAttribute('href'))] || []).map(function (id) { return mgName[id]; }).filter(Boolean);
          li.setAttribute('data-cats', names.join('|'));
          names.forEach(function (n) { mgCount[n] = (mgCount[n] || 0) + 1; });
        });
        // 상위 카테고리(테크·개발/생활·재테크)와 미분류는 칩에서 제외 — 변별력 없음
        var mgSkip = /^(테크·개발|생활·재테크|Uncategorized|Blog)$/;
        var mgTop = Object.keys(mgCount)
          .filter(function (n) { return !mgSkip.test(n); })
          .sort(function (a, b) { return mgCount[b] - mgCount[a]; })
          .slice(0, 5);
        if (!mgTop.length) return;
        ['전체'].concat(mgTop).forEach(function (label, i) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
          b.addEventListener('click', function () {
            [].forEach.call(mgBar.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', 'false'); });
            b.setAttribute('aria-pressed', 'true');
            mgLis.forEach(function (li) {
              var tags = '|' + (li.getAttribute('data-cats') || '') + '|';
              li.hidden = !(label === '전체' || tags.indexOf('|' + label + '|') >= 0);
            });
          });
          mgBar.appendChild(b);
        });
      }).catch(function () {});
    }
  }

  // ── 단일 글에서만 TOC/FAQ ──
  if (!document.body.classList.contains('single')) return;
  var content = document.querySelector('.entry-content-wrap');
  if (!content) return;
  var h2s = content.querySelectorAll('h2');

  // ── ③ 목차(TOC) — h2 3개 이상 ──
  if (h2s.length >= 3) {
    var toc = document.createElement('nav'); toc.className = 'mg-toc';
    var head = document.createElement('div'); head.className = 'mg-toc-head'; head.textContent = '📑 목차';
    var ol = document.createElement('ol');
    h2s.forEach(function (h, i) {
      if (!h.id) h.id = 'sec-' + i;
      var li = document.createElement('li'), an = document.createElement('a');
      an.href = '#' + h.id; an.textContent = h.textContent;
      li.appendChild(an); ol.appendChild(li);
    });
    toc.appendChild(head); toc.appendChild(ol);
    var tldr = content.querySelector('.mg-tldr');
    if (tldr) tldr.parentNode.insertBefore(toc, tldr.nextSibling);
    else content.insertBefore(toc, h2s[0]);
    if (window.matchMedia('(max-width:782px)').matches) toc.classList.add('mg-toc-collapsed');
    head.addEventListener('click', function () { toc.classList.toggle('mg-toc-collapsed'); });
  }

  // ── ④ FAQPage 스키마 ──
  var faqH2 = null;
  h2s.forEach(function (h) { if (/자주\s*묻는\s*질문|FAQ/i.test(h.textContent)) faqH2 = h; });
  if (faqH2) {
    var qas = [], el = faqH2.nextElementSibling;
    while (el && el.tagName !== 'H2') {
      if (el.tagName === 'H3') {
        var q = el.textContent.trim(), ans = '', n = el.nextElementSibling;
        while (n && n.tagName !== 'H3' && n.tagName !== 'H2') {
          if (n.textContent && n.textContent.trim()) ans += n.textContent.trim() + ' ';
          n = n.nextElementSibling;
        }
        if (q && ans) qas.push([q, ans.trim()]);
      }
      el = el.nextElementSibling;
    }
    if (qas.length) {
      var schema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qas.map(function (x) {
        return { '@type': 'Question', name: x[0], acceptedAnswer: { '@type': 'Answer', text: x[1] } };
      }) };
      var sc = document.createElement('script'); sc.type = 'application/ld+json';
      sc.textContent = JSON.stringify(schema); document.head.appendChild(sc);
    }
  }

  // ── ⑤ 뉴스레터 인라인 구독 폼 (글 말미) ──
  if (!document.querySelector('.mg-sub')) {
    var lf = /생활|재테크|finance|lifestyle|health|money/i.test(document.body.className + ' ' + (document.querySelector('.entry-taxonomies, .breadcrumbs, .cat-links') || {}).textContent || '');
    var SRC = lf ? 'lifeflow' : 'blog';
    var box = document.createElement('div'); box.className = 'mg-sub';
    box.innerHTML = '<div class="mg-sub-h">📬 새 글, 이메일로 받아보세요</div>'
      + '<div class="mg-sub-d">테크·재테크 인사이트를 주 1~2회. 스팸 없이, 언제든 구독 취소.</div>'
      + '<form class="mg-sub-f"><input type="email" class="mg-sub-i" placeholder="이메일 주소" required autocomplete="email"><button type="submit" class="mg-sub-b">구독</button></form>'
      + '<div class="mg-sub-msg"></div>';
    content.appendChild(box);
    box.querySelector('.mg-sub-f').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = box.querySelector('.mg-sub-i').value.trim();
      var msg = box.querySelector('.mg-sub-msg'), btn = box.querySelector('.mg-sub-b');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = '올바른 이메일을 입력해주세요.'; msg.className = 'mg-sub-msg err'; return; }
      btn.disabled = true; btn.textContent = '...';
      fetch('https://ai-revenue-blog.vercel.app/api/daily-report?action=subscribe&source=' + SRC + '&email=' + encodeURIComponent(email), { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok) { box.querySelector('.mg-sub-f').style.display = 'none'; msg.textContent = '✅ 구독 완료! 새 글을 이메일로 보내드릴게요.'; msg.className = 'mg-sub-msg ok'; }
          else throw new Error();
        })
        .catch(function () { msg.textContent = '잠시 후 다시 시도해주세요.'; msg.className = 'mg-sub-msg err'; btn.disabled = false; btn.textContent = '구독'; });
    });
  }
})();
