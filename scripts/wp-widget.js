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
