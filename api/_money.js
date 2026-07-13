// 수익화 커버리지 — 트래픽은 있는데 쿠팡 링크가 없는 글 찾기
//
// 조회수가 나오는 글에 제휴 링크가 없으면 그대로 새는 수익이다.
// 인기 페이지(get_top_pages)를 가져와 각 글의 마크다운에서 쿠팡 링크 유무를 확인한다.
//   - frontmatter coupangLinks:  (하단 배너)
//   - 본문 link.coupang.com / coupang-inline (인라인 CTA)

import { blogList, resolveBlog } from './_blogs.js';
import { getPost, listPosts } from './_github.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, escapeHtml } from './_shared.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const cut = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n) + '…' : s);

const HAS_COUPANG = /coupangLinks:|link\.coupang\.com|coupang-inline/i;

async function topPages(limit = 50) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_top_pages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ p_limit: limit }),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

// /money [n] — 링크 없는 인기글 상위 n개 (기본 8)
export async function moneyMessage(blogArg, n = 8) {
  n = Math.min(Math.max(n, 1), 15);
  const targets = blogArg ? [resolveBlog(blogArg)].filter(Boolean) : blogList().filter((b) => b.source);
  if (!targets.length) throw new Error('블로그를 지정하세요: <code>tf</code> / <code>lf</code>');

  const rows = await topPages(60);
  const lines = ['🛒 <b>수익화 커버리지</b> — 트래픽 있는데 쿠팡 링크 없는 글', ''];

  for (const blog of targets) {
    // 글 상세 페이지만 (홈·목록 제외), 조회수 순
    const posts = rows
      .filter((p) => (p.source || 'blog') === blog.source)
      .map((p) => ({
        slug: (p.slug || '').trim() || (p.path || '').replace(/^\/blog\//, '').replace(/\/$/, ''),
        title: p.title && p.title !== 'null' ? String(p.title).split(' | ')[0].split(' - ')[0] : '',
        views: Number(p.views ?? p.count ?? 0),
      }))
      .filter((p) => p.slug && !/^\/?$/.test(p.slug) && p.slug !== 'blog')
      .slice(0, 25);

    if (!posts.length) continue;

    // 글 본문을 열어 링크 유무 확인 (조회 상위만 → API 호출 절약)
    const checked = await Promise.all(
      posts.map(async (p) => {
        try {
          const f = await getPost(blog, p.slug);
          return { ...p, hasLink: HAS_COUPANG.test(f.content) };
        } catch {
          return null;   // 삭제됐거나 slug 불일치
        }
      })
    );
    const valid = checked.filter(Boolean);
    if (!valid.length) continue;

    const missing = valid.filter((p) => !p.hasLink).sort((a, b) => b.views - a.views);
    const covered = valid.length - missing.length;
    const lostViews = missing.reduce((s, p) => s + p.views, 0);

    lines.push(
      `<b>${escapeHtml(blog.label.split(' (')[0])}</b> — 인기글 커버리지 ${covered}/${valid.length} ` +
        `(${Math.round((covered / valid.length) * 100)}%)`
    );
    if (missing.length) {
      lines.push(`  누락 ${missing.length}개 · 이 글들의 누적 조회 <b>${fmt(lostViews)}</b>`);
      missing.slice(0, n).forEach((p, i) => {
        lines.push(
          `${i + 1}. ${escapeHtml(cut(p.title || p.slug, 34))} — 조회 <b>${fmt(p.views)}</b>`,
          `    <code>${escapeHtml(p.slug)}</code>`
        );
      });
    } else {
      lines.push('  ✅ 인기글은 전부 링크 있음');
    }

    // 아직 트래픽이 안 붙은 최근 글도 확인 — 새 글은 링크를 빠뜨리기 쉽고,
    // 나중에 유입이 붙으면 그때부터 수익이 샌다
    try {
      const recent = await listPosts(blog, 10);
      const known = new Set(valid.map((p) => p.slug));
      const fresh = await Promise.all(
        recent
          .filter((p) => !known.has(p.slug))
          .map(async (p) => {
            try {
              const f = await getPost(blog, p.slug);
              return HAS_COUPANG.test(f.content) ? null : p.slug;
            } catch {
              return null;
            }
          })
      );
      const freshMissing = fresh.filter(Boolean);
      if (freshMissing.length) {
        lines.push(`  🆕 최근 글 중 링크 없음 ${freshMissing.length}개`);
        freshMissing.slice(0, 5).forEach((s) => lines.push(`  · <code>${escapeHtml(s)}</code>`));
      }
    } catch { /* 최근 글 확인 실패는 무시 */ }

    lines.push('');
  }

  lines.push(
    '<i>링크 추가:</i> <code>/edit &lt;블로그&gt; &lt;slug&gt;</code> 로 본문에 인라인 CTA를 넣거나,',
    'frontmatter <code>coupangLinks</code> 에 상품을 추가하세요.'
  );
  return lines.join('\n');
}
