// 수익화 커버리지 — 트래픽은 있는데 쿠팡 링크가 없는 글 찾기 (뭉게 기준)
//
// 조회수가 나오는 글에 제휴 링크가 없으면 그대로 새는 수익이다.
//
// 2026-07-30 재작성: 예전 구현은 get_top_pages(analytics pageview) + GitHub repo 마크다운을
// 읽었다. 둘 다 뭉게에서 안 된다 —
//   · 뭉게 조회는 pageview_mg / GA4 라서 get_top_pages 에 안 들어온다
//   · 뭉게는 WordPress 직접 운영이라 repo 가 없다(getPost 불가)
// → 인기글은 loadMungge(GA4+자체트래커), 본문은 WP REST 로 읽는다.

import { loadMungge, MG_SITE } from './_mungge.js';
import { escapeHtml, kstDay } from './_shared.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const cut = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n) + '…' : s);

const HAS_COUPANG = /link\.coupang\.com|coupang-inline|coupang\.com\/vp\//i;

// path(/2026-07-24-foo/) → slug. 홈·목록·도구 페이지는 글이 아니라 제외한다.
function slugOfPath(p) {
  const s = String(p || '').split('?')[0].replace(/^\/+|\/+$/g, '');
  if (!s || s === 'blog') return null;
  if (/^(category|tag|page|author|tools)(\/|$)/.test(s)) return null;
  if (s.includes('/')) return null;             // 계층 경로는 글이 아니다
  return s;
}

// WP REST — slug 로 본문 조회. 글이 없으면 null.
async function wpPost(slug) {
  try {
    const r = await fetch(
      `${MG_SITE}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_fields=id,title,link,content`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

// 최근 발행 글 (트래픽이 아직 안 붙은 글도 링크 누락을 잡아야 한다)
async function wpRecent(perPage = 10) {
  try {
    const r = await fetch(
      `${MG_SITE}/wp-json/wp/v2/posts?per_page=${perPage}&_fields=id,title,link,slug,content`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// /money [n] — 링크 없는 인기글 상위 n개 (기본 8)
export async function moneyMessage(_blogArg, n = 8) {
  n = Math.min(Math.max(n, 1), 15);

  const mg = await loadMungge(kstDay(29), kstDay(0), { dims: ['total', 'page_all'] }).catch(() => null);
  const lines = ['🛒 <b>수익화 커버리지</b> — 트래픽 있는데 쿠팡 링크 없는 글', '<i>뭉게 · 최근 30일 조회 기준</i>', ''];
  if (!mg) return lines.concat('⚠️ 뭉게 조회 데이터를 읽지 못했습니다.').join('\n');

  // 30일 조회 합산 → 상위 25개 글만 본문 확인(WP 호출 절약)
  const byPath = {};
  for (let i = 29; i >= 0; i--) {
    for (const p of mg.topPages(kstDay(i), 50)) {
      const slug = slugOfPath(p.path);
      if (!slug) continue;
      const a = (byPath[slug] ||= { slug, title: p.title, views: 0 });
      a.views += p.views;
    }
  }
  const top = Object.values(byPath).sort((a, b) => b.views - a.views).slice(0, 25);

  if (!top.length) {
    return lines.concat('아직 글 단위 조회 데이터가 없습니다 (GA4 수집 2026-07-27 시작).').join('\n');
  }

  const checked = (
    await Promise.all(
      top.map(async (p) => {
        const post = await wpPost(p.slug);
        if (!post) return null;                 // 슬러그 불일치(고정페이지 등)
        return {
          ...p,
          title: String(post.title?.rendered || p.title).replace(/<[^>]*>/g, '').trim(),
          link: post.link,
          hasLink: HAS_COUPANG.test(String(post.content?.rendered || '')),
        };
      })
    )
  ).filter(Boolean);

  if (!checked.length) return lines.concat('조회 상위 경로가 모두 글이 아닙니다(홈·목록).').join('\n');

  const missing = checked.filter((p) => !p.hasLink).sort((a, b) => b.views - a.views);
  const covered = checked.length - missing.length;
  const lostViews = missing.reduce((s, p) => s + p.views, 0);

  lines.push(
    `<b>인기글 커버리지</b> ${covered}/${checked.length} (${Math.round((covered / checked.length) * 100)}%)`
  );
  if (missing.length) {
    lines.push(`  누락 ${missing.length}개 · 이 글들의 30일 조회 <b>${fmt(lostViews)}</b>`);
    missing.slice(0, n).forEach((p, i) => {
      lines.push(
        `${i + 1}. ${escapeHtml(cut(p.title || p.slug, 34))} — 조회 <b>${fmt(p.views)}</b>`,
        `    <a href="${p.link}">글 열기</a> · <code>${escapeHtml(p.slug)}</code>`
      );
    });
  } else {
    lines.push('  ✅ 인기글은 전부 링크 있음');
  }

  // 아직 트래픽이 안 붙은 최근 글 — 새 글은 링크를 빠뜨리기 쉽고, 유입이 붙는 순간부터 샌다
  const known = new Set(checked.map((p) => p.slug));
  const freshMissing = (await wpRecent(10))
    .filter((p) => !known.has(p.slug))
    .filter((p) => !HAS_COUPANG.test(String(p.content?.rendered || '')));
  if (freshMissing.length) {
    lines.push('', `🆕 <b>최근 글 중 링크 없음</b> ${freshMissing.length}개`);
    freshMissing.slice(0, 5).forEach((p) =>
      lines.push(`  · ${escapeHtml(cut(String(p.title?.rendered || p.slug).replace(/<[^>]*>/g, ''), 32))}`)
    );
  }

  lines.push(
    '',
    '<i>링크 추가는 뭉게 관리화면에서:</i> <a href="' + MG_SITE + '/wp-admin/edit.php">글 목록</a>'
  );
  return lines.join('\n');
}
