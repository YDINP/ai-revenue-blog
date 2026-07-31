// GSC → Supabase 동기화 엔드포인트 (수동 백필/재동기화)
//   /api/gsc-sync?days=30&secret=<CRON_SECRET>   또는  Authorization: Bearer <CRON_SECRET>
//
// 조회 모드(저장 안 함): dim 파라미터를 주면 GSC 원본 행을 그대로 반환한다.
//   /api/gsc-sync?dim=query&blog=mg&days=28&limit=200&secret=…
//   /api/gsc-sync?dim=query,page&…   (어떤 검색어가 어떤 글로 떨어지는지)
// gsc_daily 는 date×page 만 저장해서 검색어 단위 진단(CTR·식인)이 불가능하다. 별도 엔드포인트를
// 만들면 Hobby 플랜 서버리스 함수 12개 상한에 걸리므로 이 핸들러에 조회 모드를 얹는다.
//
// 진단 모드(저장 안 함): SEO 개선 대상을 골라낸다. 조회 모드와 마찬가지로 함수 상한 때문에 여기 얹는다.
//   /api/gsc-sync?diag=striking&blog=mg&days=28&minPos=4&maxPos=20&minImp=50&secret=…
//   /api/gsc-sync?diag=decay&blog=mg&dim=page&days=28&minClicks=5&drop=30&secret=…
//
// GA4(유입경로) 도 같은 서비스 계정을 쓰므로 이 핸들러에 함께 얹는다.
//   /api/gsc-sync?ga4=whoami&secret=…                 서비스계정 이메일·연동 상태
//   /api/gsc-sync?ga4=properties&secret=…             접근 가능한 GA4 속성 목록(속성 ID 확인)
//   /api/gsc-sync?ga4=probe&blog=mg&days=28&dim=sessionSourceMedium&secret=…   원본 조회
//   /api/gsc-sync?ga4=sync&days=30&secret=…           ga4_daily 저장
//     └ 이 모드만 대시보드 비밀번호로도 호출 가능: 헤더 `x-admin-key: <COMMENT_ADMIN_KEY>`
import { syncGsc } from './_gsc-sync.js';
import { syncGa4 } from './_ga4-sync.js';
import { blogList, resolveBlog } from './_blogs.js';
import { gscDay, gscInspect, gscRaw, gscSitemaps, hasGsc } from './_gsc.js';
import { ga4Day, ga4Properties, ga4Report, hasGa4, saEmail } from './_ga4.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url, 'http://x');
  const token =
    url.searchParams.get('secret') || (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  // 대시보드의 '지금 동기화' 버튼용 대안 자격.
  // ga4_daily 는 하루 1회 배치라 오늘치가 마지막 동기화 시점에 멈춰 있고, 그 상태로 Site Kit
  // 실시간 수치와 비교하면 대시보드가 틀린 것처럼 보인다. 브라우저에서 직접 갱신할 수 있어야
  // 하는데 CRON_SECRET 을 클라이언트에 실을 수는 없다 → 대시보드 입장 비밀번호
  // (COMMENT_ADMIN_KEY, 이미 서버에만 있는 값)를 헤더로 받는다.
  // 권한은 ga4=sync 하나로만 좁힌다 — GSC 동기화·원본 조회는 여전히 CRON_SECRET 전용.
  const adminKey = process.env.COMMENT_ADMIN_KEY;
  const adminOk =
    !!adminKey &&
    (req.headers['x-admin-key'] || '') === adminKey &&
    url.searchParams.get('ga4') === 'sync';
  if (secret && token !== secret && !adminOk) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (url.searchParams.get('ga4')) return ga4(url, res);

  // diag 는 dim 을 함께 받으므로(decay 의 집계 차원) probe 보다 먼저 갈라야 한다
  const diag = url.searchParams.get('diag');
  if (diag) return diagnose(diag, url, res);

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

// ── GA4(유입경로) ───────────────────────────────────────────────────────────
// GSC 는 구글 검색 유입만 보여준다. 네이버·직접·추천·소셜이 어디서 얼마나 오는지는 GA4 만 안다.
async function ga4(url, res) {
  const mode = url.searchParams.get('ga4');
  if (!hasGa4()) return res.status(500).json({ error: 'no-google-sa-env' });

  try {
    // 연동 진단 — GA4 속성에 어느 이메일을 '뷰어'로 추가해야 하는지 알려준다
    if (mode === 'whoami') {
      const out = { ok: true, serviceAccount: saEmail(), adminApi: null, properties: null };
      try {
        const props = await ga4Properties();
        out.adminApi = 'ok';
        out.properties = props;
        if (!props.length) {
          out.hint = '접근 가능한 GA4 속성이 없습니다 — GA4 관리 > 속성 액세스 관리에서 위 serviceAccount 를 뷰어로 추가하세요.';
        }
      } catch (e) {
        out.adminApi = `error: ${e.message}`;
        out.hint = /SERVICE_DISABLED|has not been used/i.test(e.message)
          ? 'GCP 프로젝트에서 Google Analytics Admin API / Data API 를 활성화하세요.'
          : 'GA4 관리 > 속성 액세스 관리에서 위 serviceAccount 를 뷰어로 추가하세요.';
      }
      return res.status(200).json(out);
    }

    if (mode === 'properties') {
      return res.status(200).json({ ok: true, serviceAccount: saEmail(), properties: await ga4Properties() });
    }

    if (mode === 'sync') {
      const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '7', 10) || 7, 1), 400);
      return res.status(200).json({ ok: true, days, ...(await syncGa4({ days })) });
    }

    if (mode === 'probe') {
      const blog = resolveBlog(url.searchParams.get('blog') || 'mg');
      const propertyId = url.searchParams.get('property') || blog?.ga4Property;
      if (!propertyId) {
        return res.status(400).json({
          error: 'GA4 속성 ID 없음 — ?property=<숫자> 로 직접 주거나 _blogs.js 의 ga4Property 를 설정하세요.',
        });
      }
      const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '28', 10) || 28, 1), 400);
      const dimensions = (url.searchParams.get('dim') || 'sessionSourceMedium')
        .split(',').map((s) => s.trim()).filter(Boolean);
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 5000);
      const r = await ga4Report(propertyId, {
        startDate: ga4Day(days),
        endDate: ga4Day(0),
        dimensions,
        metrics: ['sessions', 'totalUsers', 'screenPageViews', 'engagedSessions'],
        limit,
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      });
      return res.status(200).json({ ok: true, propertyId, days, ...r });
    }

    return res.status(400).json({ error: `unknown ga4 mode '${mode}'`, modes: ['whoami', 'properties', 'probe', 'sync'] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ── SEO 진단 ────────────────────────────────────────────────────────────────
// gsc_daily 는 date×page 집계라 "몇 위였나"는 남지만 "어떤 검색어가 문턱에 걸려 있나",
// "어떤 글이 죽어가나"는 알 수 없다. 두 판정을 GSC 원본에서 바로 계산한다.
// 판정 기준은 ericosiu/ai-marketing-skills 의 seo-ops(MIT)를 참고했다.
async function diagnose(mode, url, res) {
  if (!hasGsc()) return res.status(500).json({ error: 'no-gsc-env' });

  const blogs = blogList().filter((b) => b.gscSite);
  const key = url.searchParams.get('blog') || 'mg';
  const blog = blogs.find((b) => b.key === key);
  if (!blog) {
    return res.status(400).json({ error: `unknown blog '${key}'`, available: blogs.map((b) => b.key) });
  }

  // ⚠️ `parseFloat(v) || dflt` 로 쓰면 v='0' 이 falsy 라 기본값으로 되돌아간다.
  // minImp=0 / minClicks=0 (필터 끄고 전량 보기)이 조용히 무시됐다.
  const num = (name, dflt, lo, hi) => {
    const v = parseFloat(url.searchParams.get(name));
    return Math.min(Math.max(Number.isFinite(v) ? v : dflt, lo), hi);
  };
  const days = num('days', 28, 7, 180);

  try {
    let out;
    if (mode === 'striking') out = await striking(blog, url, days, num);
    else if (mode === 'decay') out = await decay(blog, url, days, num);
    else return res.status(400).json({ error: `unknown diag mode '${mode}'`, modes: ['striking', 'decay'] });
    return res.status(out.ok === false ? 400 : 200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// 문턱 키워드 — 4~20위 × 노출 충분. "조금만 밀면 1페이지" 목록이라 신규 집필보다 우선순위가 높다.
async function striking(blog, url, days, num) {
  const minPos = num('minPos', 4, 1, 100);
  const maxPos = num('maxPos', 20, 1, 100);
  const minImp = num('minImp', 50, 0, 1e6);
  const limit = Math.round(num('limit', 100, 1, 1000));

  // GSC 는 2~3일 지연 → 종료일을 2일 전으로 잡아야 마지막 날이 0으로 보이지 않는다
  const endDate = gscDay(2);
  const startDate = gscDay(1 + days);

  const rows = await gscRaw(blog.gscSite, {
    startDate,
    endDate,
    dimensions: ['query', 'page'],
    rowLimit: 5000,
    type: 'web',
  });

  const hits = rows
    .filter((r) => r.position >= minPos && r.position <= maxPos && r.impressions >= minImp)
    .map((r) => ({
      query: r.keys[0],
      page: (r.keys[1] || '').split('#')[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
      // 3위까지 밀었을 때 추가로 얻는 클릭의 거친 추정. 정렬 기준이자 우선순위다.
      // 위치별 CTR 곡선은 사이트마다 다르므로 "10% 라면" 이라는 가정치일 뿐 예측이 아니다.
      upside: Math.round(r.impressions * Math.max(0.1 - (r.ctr || 0), 0)),
    }))
    .sort((a, b) => b.upside - a.upside || b.impressions - a.impressions);

  return {
    ok: true,
    mode: 'striking',
    site: blog.gscSite,
    startDate,
    endDate,
    filter: { minPos, maxPos, minImp },
    scanned: rows.length,
    count: hits.length,
    rows: hits.slice(0, limit),
    ...(hits.length ? {} : {
      hint: rows.length
        ? '문턱(4~20위) 안에 든 검색어가 없습니다 — minImp 를 낮추거나 minPos/maxPos 범위를 넓혀 보세요.'
        : '이 기간 GSC 노출 자체가 0입니다 — 순위 문제가 아니라 색인 문제입니다. ?sitemaps=1 / ?inspect= 로 확인하세요.',
    }),
  };
}

// 하락 페이지 — 최근 창 vs 직전 같은 길이의 창.
// ⚠️ 원본(seo-ops)은 28일을 90일×(28/90)과 비교하는데, 90일 창이 28일 창을 포함해서
//    최근 하락분이 기준선에도 섞여 들어간다(하락을 과소평가). 겹치지 않는 인접 창으로 바꿨다.
async function decay(blog, url, days, num) {
  const dim = (url.searchParams.get('dim') || 'page').trim();
  if (dim !== 'page' && dim !== 'query') {
    return { ok: false, error: `decay 는 dim=page 또는 dim=query 만 지원합니다 (받은 값: '${dim}')` };
  }
  const minClicks = num('minClicks', 5, 0, 1e6);
  const dropPct = num('drop', 30, 1, 99);
  const limit = Math.round(num('limit', 50, 1, 500));

  const recent = { startDate: gscDay(1 + days), endDate: gscDay(2) };
  const prior = { startDate: gscDay(1 + days * 2), endDate: gscDay(2 + days) };

  const fetchWindow = (w) =>
    gscRaw(blog.gscSite, { ...w, dimensions: [dim], rowLimit: 5000, type: 'web' });
  const [rowsRecent, rowsPrior] = await Promise.all([fetchWindow(recent), fetchWindow(prior)]);

  const a = index(rowsRecent, dim);
  const b = index(rowsPrior, dim);

  const hits = [];
  for (const [k, before] of Object.entries(b)) {
    if (before.clicks < minClicks) continue;          // 기준선이 얇으면 노이즈다
    const after = a[k] || { clicks: 0, impressions: 0, position: 0 };
    if (after.clicks >= before.clicks * (1 - dropPct / 100)) continue;

    const impDropPct = before.impressions ? ((before.impressions - after.impressions) / before.impressions) * 100 : 0;
    const posDelta = after.position && before.position ? after.position - before.position : 0;
    hits.push({
      key: k,
      clicksBefore: before.clicks,
      clicksAfter: after.clicks,
      lossPct: +(((before.clicks - after.clicks) / before.clicks) * 100).toFixed(1),
      impressionsBefore: before.impressions,
      impressionsAfter: after.impressions,
      positionBefore: +before.position.toFixed(1),
      positionAfter: +after.position.toFixed(1),
      // 같은 "클릭 감소"라도 처방이 다르다: 순위가 밀렸나, 수요가 빠졌나, 제목이 안 먹히나.
      cause: posDelta >= 2 ? 'rank' : impDropPct >= 30 ? 'demand' : 'ctr',
    });
  }
  hits.sort((x, y) => y.clicksBefore - x.clicksBefore || y.lossPct - x.lossPct);

  return {
    ok: true,
    mode: 'decay',
    site: blog.gscSite,
    dim,
    window: { recent, prior, days },
    filter: { minClicks, dropPct },
    count: hits.length,
    causes: hits.reduce((acc, h) => ({ ...acc, [h.cause]: (acc[h.cause] || 0) + 1 }), {}),
    rows: hits.slice(0, limit),
    ...(hits.length || rowsPrior.length ? {} : {
      hint: '직전 창에도 데이터가 없습니다 — 비교할 기준선이 없어 하락 판정이 불가능합니다.',
    }),
  };
}

// 노출 가중 평균 순위로 합산. page 차원은 앵커 URL(#heading)이 별도 행으로 잡히므로 본문 URL로 묶는다.
function index(rows, dim) {
  const acc = {};
  for (const r of rows) {
    const k = dim === 'page' ? (r.keys[0] || '').split('#')[0] : (r.keys[0] || '').toLowerCase();
    if (!k) continue;
    const e = (acc[k] ||= { clicks: 0, impressions: 0, _pos: 0 });
    e.clicks += r.clicks || 0;
    e.impressions += r.impressions || 0;
    e._pos += (r.position || 0) * (r.impressions || 0);
  }
  for (const e of Object.values(acc)) e.position = e.impressions ? e._pos / e.impressions : 0;
  return acc;
}

// 저장 없이 GSC 원본 행만 반환 — 검색어 진단용
async function probe(url, res) {
  if (!hasGsc()) return res.status(500).json({ error: 'no-gsc-env' });

  const blogs = blogList().filter((b) => b.gscSite);
  const key = url.searchParams.get('blog') || 'mg';
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
