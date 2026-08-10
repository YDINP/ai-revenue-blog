// 구글 색인 커버리지 추이 수집 — 매일 워치리스트의 URL 검사 결과를 gsc_coverage 에 기록.
//
// 왜 별도 크론인가: URL 검사(Inspection) API 는 호출당 1~3초로 느려서, 수십 편을 daily-report
// 안에서 인라인으로 돌리면 함수 타임아웃(리포트 자체가 안 감)이 난다. 그래서 수집을 분리하고,
// daily-report 는 여기서 쌓아둔 최신 스냅샷을 "읽기만" 한다(_report.js seoTrendLines).
//
// 워치리스트 = 뭉게 이전 통합 타겟 52편(_seo-watchlist.js) + 포스트 사이트맵 최신 15편.
// cron: vercel.json "40 22 * * *"(07:40 KST) — daily-report(08:00 KST)보다 20분 먼저 돈다.
//
// 트리거(수동): /api/gsc-coverage?secret=CRON_SECRET

import { gscInspect, hasGsc } from './_gsc.js';
import { WATCHLIST } from './_seo-watchlist.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, kstDay } from './_shared.js';

const SITE = 'https://mungge.com/';
// functions maxDuration 오버라이드가 이 프로젝트(Astro 어댑터+루트 /api)에서 배포를 깨뜨려
// 기본 타임아웃 안에 끝내야 한다 → 동시성을 높여 벽시계 시간을 줄인다(52편≈13s).
const CONCURRENCY = 8;
const SITEMAP_LATEST = 12;
const CAP = 64;

// 포스트 사이트맵에서 최신 글 URL 몇 개를 끌어와 신규 발행 색인도 추적한다.
async function latestFromSitemap() {
  try {
    const r = await fetch('https://mungge.com/sitemap-post-type-post.xml', {
      headers: { 'User-Agent': 'mungge-seo-coverage/1.0' },
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    // Slim SEO 는 최신순이 아닐 수 있어 lastmod 없이 단순 상위 N 만 취한다(안정적 표본).
    return locs.slice(0, SITEMAP_LATEST);
  } catch {
    return [];
  }
}

function classify(r) {
  const cov = r.coverageState || '';
  if (r.verdict === 'PASS' || /색인이 생성되었|Submitted and indexed|\bindexed\b/i.test(cov)) return 'indexed';
  if (/알려지지 않은|unknown to Google/i.test(cov)) return 'unknown';
  return 'crawled_not_indexed';
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = await fn(items[idx]);
        } catch (e) {
          out[idx] = { url: items[idx], error: e.message };
        }
      }
    })
  );
  return out;
}

async function upsert(row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/gsc_coverage?on_conflict=date,site`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([row]),
  });
  if (!r.ok) throw new Error(`gsc_coverage upsert ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url, 'http://x');
  const token =
    url.searchParams.get('secret') || (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (secret && token !== secret) return res.status(401).json({ error: 'unauthorized' });
  if (!hasGsc()) return res.status(500).json({ error: 'no-gsc-env' });

  try {
    const extra = await latestFromSitemap();
    const seen = new Set();
    const list = [...WATCHLIST, ...extra].filter((u) => (seen.has(u) ? false : (seen.add(u), true))).slice(0, CAP);

    const results = await pool(list, CONCURRENCY, (u) => gscInspect(SITE, u));
    const buckets = { indexed: 0, crawled_not_indexed: 0, unknown: 0 };
    const unknownUrls = [];
    let errors = 0;
    for (const r of results) {
      if (!r || r.error) { errors++; continue; }
      const k = classify(r);
      buckets[k]++;
      if (k === 'unknown') unknownUrls.push(r.url);
    }
    const scanned = results.length - errors;

    const row = {
      date: kstDay(0), // 오늘(KST) 스냅샷
      site: 'mg',
      indexed: buckets.indexed,
      crawled_not_indexed: buckets.crawled_not_indexed,
      unknown: buckets.unknown,
      total: scanned,
      unknown_urls: unknownUrls,
    };
    await upsert(row);
    return res.status(200).json({ ok: true, ...row, errors, watchlist: list.length });
  } catch (e) {
    console.error('gsc-coverage error:', e);
    return res.status(500).json({ error: e.message });
  }
}
