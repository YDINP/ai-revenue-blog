// GSC → Supabase 동기화 엔드포인트 (수동 백필/재동기화)
//   /api/gsc-sync?days=30&secret=<CRON_SECRET>   또는  Authorization: Bearer <CRON_SECRET>
//
// 조회 모드(저장 안 함): dim 파라미터를 주면 GSC 원본 행을 그대로 반환한다.
//   /api/gsc-sync?dim=query&blog=tf&days=28&limit=200&secret=…
//   /api/gsc-sync?dim=query,page&…   (어떤 검색어가 어떤 글로 떨어지는지)
// gsc_daily 는 date×page 만 저장해서 검색어 단위 진단(CTR·식인)이 불가능하다. 별도 엔드포인트를
// 만들면 Hobby 플랜 서버리스 함수 12개 상한에 걸리므로 이 핸들러에 조회 모드를 얹는다.
import { syncGsc } from './_gsc-sync.js';
import { blogList } from './_blogs.js';
import { gscDay, gscInspect, gscRaw, gscSitemaps, hasGsc } from './_gsc.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url, 'http://x');
  const token =
    url.searchParams.get('secret') || (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (secret && token !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const dim = url.searchParams.get('dim');
  if (dim) return probe(url, res);
  if (url.searchParams.get('inspect')) return inspect(url, res);
  if (url.searchParams.get('sitemaps')) return sitemaps(url, res);

  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '5', 10) || 5, 1), 90);
  try {
    const result = await syncGsc({ days });
    return res.status(200).json({ ok: true, days, ...result });
  } catch (e) {
    console.error('gsc-sync error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// 제출된 사이트맵 현황 — /api/gsc-sync?blog=mg&sitemaps=1&secret=…
async function sitemaps(url, res) {
  if (!hasGsc()) return res.status(500).json({ error: 'no-gsc-env' });
  const blogs = blogList().filter((b) => b.gscSite);
  const blog = blogs.find((b) => b.key === (url.searchParams.get('blog') || 'mg'));
  if (!blog) return res.status(400).json({ error: 'unknown blog', available: blogs.map((b) => b.key) });
  try {
    return res.status(200).json({ ok: true, site: blog.gscSite, sitemaps: await gscSitemaps(blog.gscSite) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// URL 색인 상태 검사 — 301 이전 진행률 확인용
//   /api/gsc-sync?blog=mg&inspect=/2026-02-26-…/,/indie-game-ad-revenue-iaa-ecpm-2026/&secret=…
// inspect 는 경로 또는 절대 URL을 콤마로 구분. GSC 쿼터가 낮아 한 번에 최대 10개.
async function inspect(url, res) {
  if (!hasGsc()) return res.status(500).json({ error: 'no-gsc-env' });
  const blogs = blogList().filter((b) => b.gscSite);
  const blog = blogs.find((b) => b.key === (url.searchParams.get('blog') || 'mg'));
  if (!blog) return res.status(400).json({ error: 'unknown blog', available: blogs.map((b) => b.key) });

  const origin = new URL(blog.gscSite).origin;
  const targets = url.searchParams
    .get('inspect')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((u) => (/^https?:\/\//.test(u) ? u : origin + (u.startsWith('/') ? u : `/${u}`)));

  const results = [];
  for (const t of targets) {
    try {
      results.push(await gscInspect(blog.gscSite, t));
    } catch (e) {
      results.push({ url: t, error: e.message });
    }
  }
  return res.status(200).json({ ok: true, site: blog.gscSite, count: results.length, results });
}

// 저장 없이 GSC 원본 행만 반환 — 검색어 진단용
async function probe(url, res) {
  if (!hasGsc()) return res.status(500).json({ error: 'no-gsc-env' });

  const blogs = blogList().filter((b) => b.gscSite);
  const key = url.searchParams.get('blog') || 'tf';
  const blog = blogs.find((b) => b.key === key);
  if (!blog) {
    return res.status(400).json({ error: `unknown blog '${key}'`, available: blogs.map((b) => b.key) });
  }

  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '28', 10) || 28, 1), 480);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 5000);
  const dimensions = url.searchParams.get('dim').split(',').map((s) => s.trim()).filter(Boolean);

  // GSC 는 2~3일 지연 → 종료일을 2일 전으로 잡아야 마지막 날이 0으로 보이지 않는다
  const endDate = gscDay(2);
  const startDate = gscDay(1 + days);

  try {
    const rows = await gscRaw(blog.gscSite, { startDate, endDate, dimensions, rowLimit: limit, type: 'web' });
    return res.status(200).json({
      ok: true,
      site: blog.gscSite,
      startDate,
      endDate,
      dimensions,
      count: rows.length,
      rows: rows.map((r) => ({
        keys: r.keys,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
