// GSC → Supabase 동기화 엔드포인트 (수동 백필/재동기화)
//   /api/gsc-sync?days=30&secret=<CRON_SECRET>   또는  Authorization: Bearer <CRON_SECRET>
//
// 조회 모드(저장 안 함): dim 파라미터를 주면 GSC 원본 행을 그대로 반환한다.
//   /api/gsc-sync?dim=query&blog=tf&days=28&limit=200&secret=…
//   /api/gsc-sync?dim=query,page&…   (어떤 검색어가 어떤 글로 떨어지는지)
// gsc_daily 는 date×page 만 저장해서 검색어 단위 진단(CTR·식인)이 불가능하다. 별도 엔드포인트를
// 만들면 Hobby 플랜 서버리스 함수 12개 상한에 걸리므로 이 핸들러에 조회 모드를 얹는다.
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
