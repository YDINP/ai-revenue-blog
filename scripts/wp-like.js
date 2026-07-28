/* 뭉게(mungge.com) 글 하단 추천 버튼 — footer 위젯(custom_html-2)의 script 블록 끝에 append.
 * (주석에도 script 태그 문자열은 쓰지 않는다 — HTML 파서 상태를 건드릴 여지를 없애려고)
 *
 * 왜 새로 만드나: TF 글이 전부 mungge 로 301/308 이전되면서 추천 버튼이 있던 Astro
 * BlogPostLayout 이 더 이상 서빙되지 않는다. 그래서 analytics 에 like 이벤트가 0건이었다.
 * 게다가 옛 버튼은 카운트를 localStorage 에만 저장해 브라우저마다 숫자가 달랐다 —
 * 여기서는 get_like_count RPC 로 실제 집계를 읽는다.
 *
 * ⚠️ 라이브 SSOT 는 이 파일이 아니라 footer 위젯이다(CSS 와 동일한 사정).
 *    수정하면 scripts/inject-wp-like.mjs 로 위젯에 다시 밀어 넣어야 반영된다.
 */
(function () {
  var SB = 'https://xyprbsmagtlzebxyxsvj.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cHJic21hZ3RsemVieHl4c3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NjY4NTQsImV4cCI6MjA4NjA0Mjg1NH0.dajN0n0IWzOgYOSCglxVLzddg7jJFRHNCHwTWMG62uU';

  // 단일 글에서만 — 목록/홈에는 .single-entry 가 없다
  var article = document.querySelector('article.single-entry');
  if (!article) return;
  var content = article.querySelector('.entry-content');
  if (!content || document.getElementById('mg-like')) return;

  // 슬러그: /2026-07-27-foo/ → 2026-07-27-foo (Astro 시절 analytics 슬러그 표기와 동일)
  var slug = location.pathname.replace(/^\/+|\/+$/g, '');
  if (!slug) return;
  var liked = false;
  try { liked = localStorage.getItem('mg_liked_' + slug) === '1'; } catch (e) {}

  var css = document.createElement('style');
  css.textContent =
    '.mg-like-wrap{display:flex;justify-content:center;margin:2.2rem 0 .5rem}' +
    '.mg-like{display:inline-flex;align-items:center;gap:.55rem;padding:.7rem 1.4rem;border-radius:999px;' +
    'border:1px solid rgba(79,124,255,.35);background:#fff;color:#4f7cff;font-size:1rem;font-weight:700;' +
    'cursor:pointer;transition:transform .12s ease,background .2s ease;font-family:inherit}' +
    '.mg-like:hover{background:rgba(79,124,255,.07)}' +
    '.mg-like:active{transform:scale(.96)}' +
    '.mg-like[disabled]{cursor:default;background:rgba(79,124,255,.1)}' +
    '.mg-like .mg-heart{font-size:1.1rem;line-height:1}' +
    '.mg-like.liked{color:#e0245e;border-color:rgba(224,36,94,.4);background:rgba(224,36,94,.07)}' +
    '.mg-like-cap{display:block;text-align:center;font-size:.8rem;color:#8a8f98;margin-bottom:1.6rem}' +
    '.mg-pop{animation:mgPop .5s ease}' +
    '@keyframes mgPop{0%{transform:scale(1)}40%{transform:scale(1.18)}100%{transform:scale(1)}}' +
    'html.wp-dark-mode-active .mg-like{background:#1b1f27;border-color:rgba(79,124,255,.45)}' +
    'html.wp-dark-mode-active .mg-like.liked{background:rgba(224,36,94,.18)}';
  document.head.appendChild(css);

  var wrap = document.createElement('div');
  wrap.className = 'mg-like-wrap';
  wrap.innerHTML =
    '<button type="button" class="mg-like' + (liked ? ' liked' : '') + '" id="mg-like"' + (liked ? ' disabled' : '') + ' aria-label="이 글 추천">' +
    '<span class="mg-heart">' + (liked ? '♥' : '♡') + '</span>' +
    '<span>도움이 됐어요</span><b id="mg-like-n">–</b></button>';
  var cap = document.createElement('span');
  cap.className = 'mg-like-cap';
  cap.textContent = liked ? '추천해 주셔서 고맙습니다.' : '글이 도움이 됐다면 눌러주세요.';
  content.appendChild(wrap);
  content.appendChild(cap);

  var btn = document.getElementById('mg-like');
  var num = document.getElementById('mg-like-n');
  var count = 0;

  // 서버 집계 로드 — 실패해도 버튼은 동작해야 하므로 조용히 0 유지
  fetch(SB + '/rest/v1/rpc/get_like_count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
    body: JSON.stringify({ p_slug: slug })
  }).then(function (r) { return r.ok ? r.json() : 0; })
    .then(function (n) { count = Number(n) || 0; num.textContent = count; })
    .catch(function () { num.textContent = count; });

  btn.addEventListener('click', function () {
    if (liked) return;
    liked = true;
    try { localStorage.setItem('mg_liked_' + slug, '1'); } catch (e) {}
    count++;
    num.textContent = count;
    btn.classList.add('liked', 'mg-pop');
    btn.disabled = true;
    btn.querySelector('.mg-heart').innerHTML = '♥';
    cap.textContent = '추천해 주셔서 고맙습니다.';
    setTimeout(function () { btn.classList.remove('mg-pop'); }, 500);
    // source='mg' — 대시보드 추천 TOP(get_top_liked_posts)이 slug/path/title/source로 묶는다.
    // 제목은 h1 에서 읽는다. document.title 은 사이트명이 en-dash(–)로 붙어 있어
    // 흔한 ' - ' 분리로는 안 떨어지고 "제목 – 뭉게" 가 그대로 저장된다.
    var h1 = article.querySelector('h1.entry-title, h1');
    var title = (h1 ? h1.textContent : document.title).replace(/\s*[–-]\s*뭉게\s*$/, '').trim();
    fetch(SB + '/functions/v1/analytics-ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'like',
        source: 'mg',
        metadata: { slug: slug, path: location.pathname, title: title }
      })
    }).catch(function () {});
  });
})();
