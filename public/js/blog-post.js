// Blog Post Interactive Features
(function() {
  // Copy link to clipboard
  const copyBtn = document.getElementById('copy-link-btn');
  const tooltip = document.getElementById('copy-tooltip');
  if (copyBtn && tooltip) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        tooltip.classList.add('show');
        setTimeout(() => tooltip.classList.remove('show'), 2000);
      } catch (err) { console.error('Failed to copy:', err); }
    });
  }
})();

// Like button logic
(function() {
  const likeBtn = document.getElementById('like-btn');
  const likeIcon = document.getElementById('like-icon');
  const likeCount = document.getElementById('like-count');
  if (!likeBtn || !likeIcon || !likeCount) return;
  const slug = window.location.pathname.replace(/^\/blog\//, '').replace(/\/$/, '');
  const storageKey = 'liked_' + slug;
  const countKey = 'like_count_' + slug;
  const isLiked = localStorage.getItem(storageKey) === 'true';
  let count = parseInt(localStorage.getItem(countKey) || '0', 10);
  function render() {
    likeCount.textContent = String(count);
    if (isLiked) {
      likeIcon.innerHTML = '&#9829;';
      likeBtn.classList.add('liked');
      likeBtn.disabled = true;
    }
  }
  render();
  function spawnHearts() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = likeBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    for (let i = 0; i < 9; i++) {
      const h = document.createElement('span');
      h.className = 'heart-particle';
      h.textContent = '♥';
      h.style.left = cx + 'px'; h.style.top = cy + 'px';
      const ang = (-90 + (Math.random() * 90 - 45)) * Math.PI / 180;
      const dist = 42 + Math.random() * 55;
      h.style.setProperty('--tx', (Math.cos(ang) * dist).toFixed(1) + 'px');
      h.style.setProperty('--ty', (Math.sin(ang) * dist).toFixed(1) + 'px');
      h.style.setProperty('--r', (Math.random() * 70 - 35).toFixed(0) + 'deg');
      h.style.fontSize = (10 + Math.random() * 11).toFixed(0) + 'px';
      document.body.appendChild(h);
      setTimeout(() => h.remove(), 950);
    }
  }
  likeBtn.addEventListener('click', () => {
    if (localStorage.getItem(storageKey) === 'true') return;
    localStorage.setItem(storageKey, 'true');
    count++;
    localStorage.setItem(countKey, String(count));
    likeIcon.innerHTML = '&#9829;';
    likeBtn.classList.add('liked');
    likeBtn.disabled = true;
    likeCount.textContent = String(count);
    likeBtn.classList.add('like-pop');
    setTimeout(() => likeBtn.classList.remove('like-pop'), 600);
    spawnHearts();
    fetch('https://xyprbsmagtlzebxyxsvj.supabase.co/functions/v1/analytics-ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'like', source: 'blog', metadata: { slug, path: window.location.pathname } })
    }).catch(() => {});
  });
})();

// Auto-generate Table of Contents
(function() {
  const content = document.getElementById('post-content');
  const toc = document.getElementById('toc');
  if (!content || !toc) return;
  const headings = content.querySelectorAll('h2, h3');
  if (headings.length < 2) { toc.style.display = 'none'; return; }
  let html = '<h4>목차</h4><ul>';
  headings.forEach((h, i) => {
    const id = 'heading-' + i;
    h.id = id;
    const indent = h.tagName === 'H3' ? ' class="toc-sub"' : '';
    html += `<li${indent}><a href="#${id}">${h.textContent}</a></li>`;
  });
  html += '</ul>';
  toc.innerHTML = html;

  // Estimate reading time
  const text = content.textContent || '';
  const minutes = Math.max(1, Math.round(text.length / 500));
  const readingEl = document.querySelector('.post-reading-time');
  if (readingEl) readingEl.textContent = `읽기 약 ${minutes}분`;

  // === Chart Rendering System (Enhanced) ===
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // 숫자 카운트업 애니메이션(트렌디)
  function countUp(el, delay) {
    const m = (el.textContent || '').trim().match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (!m) return;
    const target = parseFloat(m[1]);
    const suffix = m[2] || '';
    const dec = (m[1].split('.')[1] || '').length;
    const dur = 1000;
    let startT = 0;
    el.textContent = '0' + (dec ? '.' + '0'.repeat(dec) : '') + suffix;
    function step(t) {
      if (!startT) startT = t;
      const p = Math.min((t - startT) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * e).toFixed(dec) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    setTimeout(() => requestAnimationFrame(step), delay || 0);
  }

  // IntersectionObserver for scroll animation
  const chartObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.chart-fill, .chart-col-fill, .radar-score-fill, .versus-fill').forEach(fill => {
          fill.classList.add('animated');
        });
        entry.target.querySelectorAll('.progress-ring').forEach(ring => {
          ring.style.strokeDashoffset = ring.dataset.target;
        });
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduce) {
          const vals = entry.target.querySelectorAll('.chart-value, .versus-val, .radar-score-val, .progress-value, .donut-total');
          vals.forEach((v, i) => countUp(v, 150 + i * 40));
        }
        chartObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  // 1) Render bar charts
  document.querySelectorAll('.chart-bar').forEach(el => {
    const labels = (el.dataset.labels || '').split(',');
    const values = (el.dataset.values || '').split(',').map(Number);
    const colors = (el.dataset.colors || '#3b82f6,#f59e0b,#009e73,#d55e00,#8b5cf6').split(',');
    const title = el.dataset.title || '';
    const unit = el.dataset.unit || '';
    const max = Math.max(...values) * 1.15;
    const vertical = el.dataset.orient === 'vertical';
    // 세로 비교 막대는 0 기준 유지(축 왜곡 금지). 값이 가까워 높이차가 작을 땐
    // 2개 비교에 한해 델타(%) 배지로 차이를 명시한다.
    const vMax = Math.max(...values);
    // data-highlight: 특정 막대만 강조(나머지 회색). "max"/"min"/인덱스(0부터) 지원.
    const hl = el.dataset.highlight;
    let hlIdx = -1;
    if (hl === 'max') hlIdx = values.indexOf(Math.max(...values));
    else if (hl === 'min') hlIdx = values.indexOf(Math.min(...values));
    else if (hl != null && hl !== '') hlIdx = parseInt(hl, 10);
    const ACCENT = el.dataset.accent || '#3b82f6', MUTE = '#94a3b8';
    let html = '';
    if (title) html += `<div class="chart-title">${title}</div>`;
    html += vertical ? '<div class="chart-columns">' : '<div class="chart-bars">';
    labels.forEach((label, i) => {
      const pct = max > 0 ? (values[i] / max) * 100 : 0;
      const color = hlIdx >= 0 ? (i === hlIdx ? ACCENT : MUTE) : colors[i % colors.length].trim();
      if (vertical) {
        const gradV = `linear-gradient(0deg, ${color}, ${hexToRgba(color, 0.7)})`;
        const d = vMax > 0 ? Math.round(((values[i] - vMax) / vMax) * 100) : 0;
        const delta = (values.length === 2 && values[i] !== vMax && d !== 0) ? ` <span class="chart-delta">${d}%</span>` : '';
        html += `<div class="chart-col">
          <span class="chart-value">${values[i]}${unit}${delta}</span>
          <div class="chart-col-track">
            <div class="chart-col-fill" style="height:${pct}%;background:${gradV}"></div>
          </div>
          <span class="chart-col-label">${label.trim()}</span>
        </div>`;
        return;
      }
      const grad = `linear-gradient(90deg, ${color}, ${hexToRgba(color, 0.7)})`;
      html += `<div class="chart-row">
        <span class="chart-label">${label.trim()}</span>
        <div class="chart-track">
          <div class="chart-fill" style="width:${pct}%;background:${grad}"></div>
        </div>
        <span class="chart-value">${values[i]}${unit}</span>
      </div>`;
    });
    html += '</div>';
    el.innerHTML = html;
    chartObserver.observe(el);
  });

  // 2) Render radar/score charts
  document.querySelectorAll('.chart-radar').forEach(el => {
    const items = JSON.parse(el.dataset.items || '[]');
    const title = el.dataset.title || '';
    let html = '';
    if (title) html += `<div class="chart-title">${title}</div>`;
    html += '<div class="chart-radar-grid">';
    // 척도 자동 감지 (10점 척도 vs 100점 척도 혼용 대응)
    const radarAllVals = items.flatMap(it => (it.scores || []).map(s => Number(s.value) || 0));
    const radarRawMax = Math.max(...radarAllVals, 1);
    const radarScaleMax = radarRawMax <= 10 ? 10 : (radarRawMax <= 100 ? 100 : Math.ceil(radarRawMax / 50) * 50);
    items.forEach(item => {
      const scores = item.scores || [];
      const avg = scores.length > 0 ? (scores.reduce((a,s) => a + s.value, 0) / scores.length).toFixed(1) : '0';
      const mainColor = scores[0]?.color || '#3b82f6';
      html += `<div class="radar-item">
        <div class="radar-item-accent" style="background:${mainColor}"></div>
        <div class="radar-name" style="color:${mainColor}">${item.name}</div>
        <div class="radar-avg">
          <span class="radar-avg-badge" style="background:${hexToRgba(mainColor, 0.12)};color:${mainColor}">
            평균 ${avg}/${radarScaleMax}
          </span>
        </div>
        <div class="radar-scores">`;
      scores.forEach(s => {
        const pct = Math.min((s.value / radarScaleMax) * 100, 100);
        const grad = `linear-gradient(90deg, ${s.color || '#3b82f6'}, ${hexToRgba(s.color || '#3b82f6', 0.6)})`;
        html += `<div class="radar-score-row">
          <span class="radar-score-label">${s.label}</span>
          <div class="radar-score-track">
            <div class="radar-score-fill" style="width:${pct}%;background:${grad}"></div>
          </div>
          <span class="radar-score-val" style="color:${s.color || '#3b82f6'}">${s.value}</span>
        </div>`;
      });
      html += '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
    chartObserver.observe(el);
  });

  // 3) Render donut charts
  document.querySelectorAll('.chart-donut').forEach(el => {
    const labels = (el.dataset.labels || '').split(',');
    const values = (el.dataset.values || '').split(',').map(Number);
    const colors = (el.dataset.colors || '#3b82f6,#009e73,#f59e0b,#d55e00,#8b5cf6').split(',');
    const title = el.dataset.title || '';
    const unit = el.dataset.unit || '';
    const total = values.reduce((a, v) => a + v, 0);
    let gradient = '';
    let cumPct = 0;
    values.forEach((v, i) => {
      const pct = total > 0 ? (v / total) * 100 : 0;
      const color = colors[i % colors.length].trim();
      gradient += `${color} ${cumPct}% ${cumPct + pct}%`;
      cumPct += pct;
      if (i < values.length - 1) gradient += ', ';
    });
    // 상대 점수 비교용 도넛은 원본 수치(합계)가 의미 없으므로 비중(%)만 노출한다.
    const percentOnly = el.dataset.valueMode === 'percent';
    let topIdx = 0;
    values.forEach((v, i) => { if (v > values[topIdx]) topIdx = i; });
    const topPct = total > 0 ? ((values[topIdx] / total) * 100).toFixed(1) : '0';
    let html = '';
    if (title) html += `<div class="chart-title">${title}</div>`;
    html += '<div class="chart-donut-container">';
    html += `<div class="donut-ring" style="background:conic-gradient(${gradient})">`;
    html += percentOnly
      ? `<div class="donut-hole"><span class="donut-total">${topPct}%</span><span class="donut-total-label">${labels[topIdx].trim()}</span></div>`
      : `<div class="donut-hole"><span class="donut-total">${total}${unit}</span><span class="donut-total-label">합계</span></div>`;
    html += '</div>';
    html += '<div class="donut-legend">';
    labels.forEach((label, i) => {
      const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : '0';
      const valText = percentOnly ? `${pct}%` : `${values[i]}${unit} (${pct}%)`;
      html += `<div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${colors[i % colors.length].trim()}"></span>
        <span class="donut-legend-label">${label.trim()}</span>
        <span class="donut-legend-value">${valText}</span>
      </div>`;
    });
    html += '</div></div>';
    el.innerHTML = html;
  });

  // 4) Render versus charts
  document.querySelectorAll('.chart-versus').forEach(el => {
    const items = JSON.parse(el.dataset.items || '[]');
    const title = el.dataset.title || '';
    const nameA = el.dataset.nameA || 'A';
    const nameB = el.dataset.nameB || 'B';
    const colorA = el.dataset.colorA || '#3b82f6';
    const colorB = el.dataset.colorB || '#009e73';
    const maxVal = Math.max(...items.flatMap(i => [i.a, i.b])) * 1.1;
    let html = '';
    if (title) html += `<div class="chart-title">${title}</div>`;
    html += `<div class="versus-header">
      <span class="versus-name" style="color:${colorA}">${nameA}</span>
      <span class="versus-vs">VS</span>
      <span class="versus-name" style="color:${colorB}">${nameB}</span>
    </div>`;
    html += '<div class="versus-rows">';
    items.forEach(item => {
      const pctA = maxVal > 0 ? (item.a / maxVal) * 100 : 0;
      const pctB = maxVal > 0 ? (item.b / maxVal) * 100 : 0;
      const aWin = item.a > item.b, bWin = item.b > item.a;
      html += `<div class="versus-row">
        <div class="versus-bar-left">
          <span class="versus-val${aWin ? ' versus-win' : ''}">${item.a}</span>
          <div class="versus-track versus-track-left">
            <div class="versus-fill${aWin ? ' win' : ''}" style="width:${pctA}%;background:linear-gradient(270deg, ${colorA}, ${hexToRgba(colorA, 0.6)})"></div>
          </div>
        </div>
        <div class="versus-label">${item.label}</div>
        <div class="versus-bar-right">
          <div class="versus-track">
            <div class="versus-fill${bWin ? ' win' : ''}" style="width:${pctB}%;background:linear-gradient(90deg, ${colorB}, ${hexToRgba(colorB, 0.6)})"></div>
          </div>
          <span class="versus-val${bWin ? ' versus-win' : ''}">${item.b}</span>
        </div>
      </div>`;
    });
    html += '</div>';
    el.innerHTML = html;
    chartObserver.observe(el);
  });

  // 5) Render progress circle charts
  document.querySelectorAll('.chart-progress').forEach(el => {
    const labels = (el.dataset.labels || '').split(',');
    const values = (el.dataset.values || '').split(',').map(Number);
    const colors = (el.dataset.colors || '#3b82f6,#009e73,#f59e0b,#d55e00,#8b5cf6').split(',');
    const title = el.dataset.title || '';
    const max = Number(el.dataset.max || '100');
    const unit = el.dataset.unit || '';
    const circumference = 2 * Math.PI * 45;
    let html = '';
    if (title) html += `<div class="chart-title">${title}</div>`;
    html += '<div class="progress-grid">';
    labels.forEach((label, i) => {
      const pct = Math.min(values[i] / max, 1);
      const offset = circumference - (circumference * pct);
      const color = colors[i % colors.length].trim();
      html += `<div class="progress-item">
        <div class="progress-circle">
          <svg viewBox="0 0 100 100">
            <circle class="progress-bg" cx="50" cy="50" r="45" />
            <circle class="progress-ring" cx="50" cy="50" r="45"
              style="stroke:${color};stroke-dasharray:${circumference};stroke-dashoffset:${circumference}"
              data-target="${offset}" />
          </svg>
          <div class="progress-value" style="color:${color}">${values[i]}${unit}</div>
        </div>
        <div class="progress-label">${label.trim()}</div>
      </div>`;
    });
    html += '</div>';
    el.innerHTML = html;
    chartObserver.observe(el);
  });
})();

// Code Copy Button
(function() {
  const content = document.getElementById('post-content');
  if (!content) return;
  content.querySelectorAll('pre').forEach(pre => {
    if (pre.parentElement.classList.contains('code-block-wrapper')) return;
    const lang = (pre.dataset.language || 'code').toLowerCase();
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    pre.parentNode.insertBefore(wrapper, pre);
    // 터미널 창 헤더(신호등 + 언어 + 복사)
    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = '<span class="code-dots"><i></i><i></i><i></i></span><span class="code-lang">' + lang + '</span>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy-btn';
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5" y="5" width="8.5" height="9.5" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-5A1.5 1.5 0 0 0 3 3.5v7A1.5 1.5 0 0 0 4.5 12" stroke="currentColor" stroke-width="1.4"/></svg><span>복사</span>';
    header.appendChild(btn);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code') || pre;
      const lbl = btn.querySelector('span');
      try {
        await navigator.clipboard.writeText(code.textContent);
        btn.classList.add('copied'); if (lbl) lbl.textContent = '복사됨!';
        setTimeout(() => { btn.classList.remove('copied'); if (lbl) lbl.textContent = '복사'; }, 2000);
      } catch (e) { if (lbl) lbl.textContent = '실패'; }
    });
  });
})();

// ToC Scroll Highlight
(function() {
  const toc = document.getElementById('toc');
  const content = document.getElementById('post-content');
  if (!toc || !content) return;
  const headings = content.querySelectorAll('h2[id], h3[id]');
  if (headings.length < 2) return;
  const tocLinks = toc.querySelectorAll('a');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        tocLinks.forEach(a => a.classList.remove('toc-active'));
        const active = toc.querySelector(`a[href="#${entry.target.id}"]`);
        if (active) active.classList.add('toc-active');
      }
    });
  }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
  headings.forEach(h => observer.observe(h));
})();

// Sticky ToC Sidebar (Desktop)
(function() {
  if (window.innerWidth < 1280) return;
  const inlineToc = document.getElementById('toc');
  const content = document.getElementById('post-content');
  if (!inlineToc || !content) return;
  const headings = content.querySelectorAll('h2[id], h3[id]');
  if (headings.length < 2) return;
  const sidebar = document.createElement('nav');
  sidebar.className = 'toc-sidebar';
  sidebar.innerHTML = `
    <div class="toc-sidebar-header">
      <span class="toc-sidebar-title">목차</span>
      <button class="toc-sidebar-close" aria-label="목차 닫기">&times;</button>
    </div>
    ${inlineToc.innerHTML.replace(/<h4[^>]*>.*?<\/h4>/i, '')}
    <div class="toc-progress"><div class="toc-progress-bar"></div></div>
  `;
  document.body.appendChild(sidebar);
  sidebar.querySelector('.toc-sidebar-close').addEventListener('click', function() {
    // visObserver가 심은 인라인 opacity가 .toc-hidden의 opacity:0을 덮지 않게 제거
    sidebar.style.opacity = '';
    sidebar.classList.add('toc-hidden');
  });
  const sidebarLinks = sidebar.querySelectorAll('a');
  const sidebarObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        sidebarLinks.forEach(a => a.classList.remove('toc-active'));
        const active = sidebar.querySelector(`a[href="#${entry.target.id}"]`);
        if (active) {
          active.classList.add('toc-active');
          active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    });
  }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
  headings.forEach(h => sidebarObserver.observe(h));
  const progressBar = sidebar.querySelector('.toc-progress-bar');
  if (progressBar) {
    window.addEventListener('scroll', function() {
      const rect = content.getBoundingClientRect();
      const total = content.scrollHeight;
      const scrolled = Math.max(0, -rect.top);
      const pct = Math.min(100, (scrolled / (total - window.innerHeight)) * 100);
      progressBar.style.width = pct + '%';
    }, { passive: true });
  }
  const visObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!sidebar.classList.contains('toc-hidden')) {
        sidebar.style.opacity = entry.isIntersecting ? '1' : '0.3';
      }
    });
  }, { threshold: 0.01 });
  visObserver.observe(content);
})();

// Accordion FAQ
(function() {
  const content = document.getElementById('post-content');
  if (!content) return;
  const faqHeading = Array.from(content.querySelectorAll('h2')).find(
    h => h.textContent.includes('자주 묻는 질문') || h.textContent.includes('FAQ')
  );
  if (!faqHeading) return;
  const items = [];
  let el = faqHeading.nextElementSibling;
  let currentQ = null, currentId = '', currentA = [];
  while (el && el.tagName !== 'H2') {
    if (el.tagName === 'H3') {
      if (currentQ) items.push({ q: currentQ, a: currentA.join(''), id: currentId });
      currentQ = el.textContent.replace(/^Q\d*[\.\:]\s*/, '').replace(/^\d+\.\s*/, '');
      currentId = el.id || '';   // 목차 앵커(heading-N) 이관용
      currentA = [];
    } else if (currentQ) {
      currentA.push(el.outerHTML);
    }
    el = el.nextElementSibling;
  }
  if (currentQ) items.push({ q: currentQ, a: currentA.join(''), id: currentId });
  if (items.length === 0) return;
  const container = document.createElement('div');
  container.className = 'faq-accordion';
  items.forEach(item => {
    const details = document.createElement('details');
    details.className = 'faq-item';
    if (item.id) details.id = item.id;   // 삭제된 h3의 id를 이관 → 목차 링크가 여기로 스크롤
    details.innerHTML = `<summary>${item.q}</summary><div class="faq-answer">${item.a}</div>`;
    container.appendChild(details);
  });
  // 목차에서 FAQ 항목 클릭 시 해당 아코디언 자동 열림
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('.toc a, .toc-sidebar a');
    if (!a) return;
    const id = (a.getAttribute('href') || '').replace(/^#/, '');
    const t = id && document.getElementById(id);
    if (t && t.tagName === 'DETAILS') { t.open = true; t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  let removeEl = faqHeading.nextElementSibling;
  while (removeEl && removeEl.tagName !== 'H2') {
    const next = removeEl.nextElementSibling;
    removeEl.remove();
    removeEl = next;
  }
  faqHeading.after(container);
})();

// Difficulty Badge (auto-detect)
(function() {
  const content = document.getElementById('post-content');
  const meta = document.querySelector('.post-meta');
  if (!content || !meta) return;
  const text = content.textContent || '';
  const codeBlocks = content.querySelectorAll('pre code').length;
  const length = text.length;
  let level = 'beginner';
  let label = '초급';
  let icon = '\uD83D\uDFE2';
  if (length > 8000 || codeBlocks > 5) {
    level = 'advanced'; label = '고급'; icon = '\uD83D\uDD34';
  } else if (length > 4000 || codeBlocks > 2) {
    level = 'intermediate'; label = '중급'; icon = '\uD83D\uDFE1';
  }
  const badge = document.createElement('span');
  badge.className = `difficulty-badge ${level}`;
  badge.textContent = `${icon} ${label}`;
  meta.appendChild(badge);
})();

// Bookmark Toggle
(function() {
  const btn = document.getElementById('bookmark-btn');
  if (!btn) return;
  const slug = btn.dataset.slug || '';
  const KEY = 'blog_bookmarks';
  function getBookmarks() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }
  function isBookmarked() { return getBookmarks().includes(slug); }
  function render() {
    const icon = btn.querySelector('.bookmark-icon');
    if (isBookmarked()) {
      btn.classList.add('bookmarked');
      if (icon) icon.setAttribute('fill', 'currentColor');
    } else {
      btn.classList.remove('bookmarked');
      if (icon) icon.setAttribute('fill', 'none');
    }
  }
  btn.addEventListener('click', function() {
    let bm = getBookmarks();
    if (bm.includes(slug)) {
      bm = bm.filter(s => s !== slug);
    } else {
      bm.push(slug);
    }
    localStorage.setItem(KEY, JSON.stringify(bm));
    render();
  });
  render();
})();

// Interactive Table Sort
(function() {
  const content = document.getElementById('post-content');
  if (!content) return;
  content.querySelectorAll('table').forEach(function(table) {
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;
    const headers = thead.querySelectorAll('th');
    if (headers.length < 2) return;
    table.classList.add('sortable-table');
    headers.forEach(function(th, colIdx) {
      th.style.cursor = 'pointer';
      th.setAttribute('title', '클릭하여 정렬');
      const arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = ' ↕';
      th.appendChild(arrow);
      let asc = true;
      th.addEventListener('click', function() {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort(function(a, b) {
          const aText = (a.children[colIdx]?.textContent || '').trim();
          const bText = (b.children[colIdx]?.textContent || '').trim();
          const aNum = parseFloat(aText.replace(/[^0-9.\-]/g, ''));
          const bNum = parseFloat(bText.replace(/[^0-9.\-]/g, ''));
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return asc ? aNum - bNum : bNum - aNum;
          }
          return asc ? aText.localeCompare(bText, 'ko') : bText.localeCompare(aText, 'ko');
        });
        rows.forEach(r => tbody.appendChild(r));
        headers.forEach(h => {
          const a = h.querySelector('.sort-arrow');
          if (a) a.textContent = ' ↕';
        });
        arrow.textContent = asc ? ' ↑' : ' ↓';
        asc = !asc;
      });
    });
  });
})();

// Popular Posts Widget
(function() {
  const widget = document.getElementById('popular-posts-widget');
  const list = document.getElementById('popular-posts-list');
  if (!widget || !list) return;
  const SUPABASE_URL = 'https://xyprbsmagtlzebxyxsvj.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cHJic21hZ3RsemVieHl4c3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NjY4NTQsImV4cCI6MjA4NjA0Mjg1NH0.dajN0n0IWzOgYOSCglxVLzddg7jJFRHNCHwTWMG62uU';
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); };
  // 홈 인기글과 동일한 정상 RPC(get_top_pages) 사용 — 기존 analytics 직접 쿼리는 400
  fetch(`${SUPABASE_URL}/rest/v1/rpc/get_top_pages`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_limit: 40 })
  })
  .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
  .then(function (data) {
    if (!Array.isArray(data)) throw new Error('bad');
    const seen = {}; const top = [];
    for (var i = 0; i < data.length; i++) {
      var p = data[i];
      var raw = (p.slug || p.path || '').replace(/^\/blog\//, '').replace(/\/$/, '');
      if (!raw || raw.indexOf('/') >= 0 || seen[raw]) continue;   // /blog/ 하위 글만, 중복 제거
      seen[raw] = 1;
      var title = (p.title && p.title !== 'null') ? String(p.title).split(' | ')[0].split(' - ')[0]
        : decodeURIComponent(raw).replace(/-/g, ' ');
      top.push({ slug: raw, views: Number(p.views) || 0, title: title });
      if (top.length >= 5) break;
    }
    if (top.length === 0) { list.innerHTML = '<p class="popular-posts-empty">아직 충분한 데이터가 없습니다.</p>'; return; }
    list.innerHTML = top.map(function (item, i) {
      return '<a href="/blog/' + item.slug + '/" class="popular-post-item">' +
        '<span class="popular-post-rank">' + (i + 1) + '</span>' +
        '<span class="popular-post-title">' + esc(item.title) + '</span>' +
        '<span class="popular-post-views">' + item.views.toLocaleString() + ' views</span></a>';
    }).join('');
  })
  .catch(function () {
    list.innerHTML = '<p class="popular-posts-empty">인기글을 불러올 수 없습니다.</p>';
  });
})();

// 임베드 팝업 전용: 좌/우 스와이프 → 부모(홈)에 이전/다음 글 요청
(function () {
  if (!document.documentElement.classList.contains('embed')) return;
  let sx = 0, sy = 0, st = 0, tracking = false;
  window.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  window.addEventListener('touchend', function (e) {
    if (!tracking) return; tracking = false;
    var t = e.changedTouches[0]; var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st > 700) return;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      try { parent.postMessage({ source: 'pd-post-swipe', dir: dx < 0 ? 'next' : 'prev' }, '*'); } catch (err) {}
    }
  }, { passive: true });
})();
