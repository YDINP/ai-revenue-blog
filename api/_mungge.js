// 뭉게(mungge.com) 집계 — 봇 리포트/대시보드 명령의 뭉게 측 SSOT
//
// 왜 별도 모듈인가: TF·LF 는 mungge 로 301 통합됐고(잔존 조회 한 자릿수) 실제 트래픽은
// 전부 뭉게로 온다. 그런데 뭉게는 WordPress 직접 운영이라 TF/LF 가 쓰는 analytics
// 'pageview' 이벤트가 없어서, blogList() 를 source 로 필터링하는 기존 리포트 경로에서
// 통째로 빠져 있었다(mg.source = null). 뭉게 수치는 아래 두 소스를 합쳐야 나온다.
//
//   1) ga4_daily (source='mg')  — Site Kit GA4 태그. 하루 1회 배치(syncGa4).
//   2) analytics event_type='pageview_mg' — WP footer 에 심은 자체 트래커(scripts/wp-track.js).
//      GA4 배치가 아직 안 돈 당일치와 "어느 글을 봤나"의 개별 기록을 담당한다.
//
// ⚠️ 같은 날을 두 소스로 더하면 이중계산이다. **GA4 행이 있는 날은 GA4 만 쓰고, 없는 날만
// 자체 트래커로 채운다** — 대시보드(dashboard.astro mgDay/mgTopPages)와 동일한 원칙이고,
// 폴백이 걸린 날은 live=true 로 표시해 리포트 라벨에 기준을 밝힌다.

import { SUPABASE_ANON_KEY, SUPABASE_URL, kstDayOf } from './_shared.js';
import { classifyGa4Source, classifyRef, channelKo } from './_refs.js';

export const MG_SITE = 'https://mungge.com';

async function rest(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

const ZERO = { sessions: 0, users: 0, views: 0, engaged: 0 };

// ── 원자료 로드 ─────────────────────────────────────────────
// ga4_daily 는 dim 마다 행이 갈리므로 필요한 dim 만 골라 한 번에 받는다.
// (source='mg' 필터: ga4Property 가 있는 블로그는 현재 뭉게뿐이지만 명시해 둔다)
async function ga4Rows(from, to, dims) {
  const dimFilter = `dim=in.(${dims.join(',')})`;
  return rest(
    `ga4_daily?source=eq.mg&date=gte.${from}&date=lte.${to}&${dimFilter}` +
      '&select=date,dim,key,sessions,users,views,engaged&limit=20000'
  );
}

// 자체 트래커 원본 이벤트 (KST 날짜 경계로 여유를 두고 UTC 로 받는다)
async function liveRows(from, to) {
  const start = new Date(`${from}T00:00:00+09:00`).toISOString();
  const end = new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86400000).toISOString();
  return rest(
    `analytics?event_type=eq.pageview_mg&created_at=gte.${start}&created_at=lt.${end}` +
      '&select=created_at,metadata&order=created_at.desc&limit=5000'
  );
}

// 리포트 한 번에 쓰이는 것들을 한 묶음으로 — 같은 원자료를 여러 번 안 받게 한다
export async function loadMungge(from, to, { dims = ['total', 'channel', 'source_medium', 'page_all'] } = {}) {
  const [ga4, live, syncedAt] = await Promise.all([
    ga4Rows(from, to, dims).catch(() => []),
    liveRows(from, to).catch(() => []),
    rest('ga4_daily?source=eq.mg&select=updated_at&order=updated_at.desc&limit=1')
      .then((r) => r[0]?.updated_at || null)
      .catch(() => null),
  ]);
  return new Mungge(ga4, live, syncedAt);
}

class Mungge {
  constructor(ga4, live, syncedAt) {
    this.ga4 = Array.isArray(ga4) ? ga4 : [];
    this.live = (Array.isArray(live) ? live : []).map((e) => ({
      day: kstDayOf(e.created_at),
      created_at: e.created_at,
      m: e.metadata || {},
    }));
    this.syncedAt = syncedAt;
  }

  // 이 날 GA4 배치가 돌았는가 — 폴백 판단의 유일한 기준
  hasGa4(day) {
    return this.ga4.some((r) => r.dim === 'total' && r.date === day);
  }

  // dim 별 key 합계 (day 지정 시 그 날만)
  agg(dim, day) {
    const acc = {};
    for (const r of this.ga4) {
      if (r.dim !== dim) continue;
      if (day && r.date !== day) continue;
      const a = (acc[r.key] ||= { key: r.key, ...ZERO });
      a.sessions += r.sessions || 0;
      a.users += r.users || 0;
      a.views += r.views || 0;
      a.engaged += r.engaged || 0;
    }
    return Object.values(acc).sort((a, b) => b.views - a.views);
  }

  liveOf(day) {
    return this.live.filter((e) => !day || e.day === day);
  }

  // 자체 트래커 기준 하루 수치 — 조회수=이벤트 수, 방문자=고유 UA(대시보드와 같은 추정 기준)
  liveStats(day) {
    const ua = new Set();
    let views = 0;
    for (const e of this.liveOf(day)) {
      views++;
      ua.add(e.m.user_agent || '?');
    }
    return { sessions: ua.size, users: ua.size, views, engaged: 0 };
  }

  // 하루 수치.
  //   live=true   → GA4 가 아직 못 받은 날이라 자체 트래커 기준
  //   nodata=true → 두 소스 모두 그 날 기록이 없다(수집 시작 전). "조회 0" 과 반드시 구분해야
  //                 한다 — 0 으로 보이면 "트래픽이 없었다"로 오독되고 추이 판단이 틀어진다.
  //                 (GA4 수집 시작 2026-07-27, 자체 트래커 2026-07-28)
  stats(day) {
    if (this.hasGa4(day)) {
      const t = this.agg('total', day)[0] || ZERO;
      return { ...t, live: false, nodata: false };
    }
    const live = this.liveStats(day);
    return { ...live, live: true, nodata: live.views === 0 };
  }

  // 유입 경로 — GA4 가 있으면 sessionSourceMedium 을 우리 라벨로 재분류(네이버 검색 보정),
  // 없으면 자체 트래커 referrer 로 같은 라벨 체계를 만든다.
  //
  // ⚠️ '사이트 내 이동' 은 유입이 아니라 내부 이동이므로 refs 에서 빼고 따로 돌려준다.
  // 자체 트래커는 모든 페이지뷰에서 발사돼(GA4 세션과 달리) 내부 이동이 그대로 섞이는데,
  // 그걸 분모에 넣으면 "검색 유입 6 / 33%" 처럼 비율이 실제보다 낮게 찍힌다.
  refs(day) {
    const out = {};
    let internal = 0;
    const add = (label, n) => {
      if (label === '사이트 내 이동') internal += n;
      else out[label] = (out[label] || 0) + n;
    };
    if (this.hasGa4(day)) {
      for (const r of this.agg('source_medium', day)) {
        // GA4 는 세션이 곧 유입 1건이다. views 는 세션 없는 행(0)도 있어 세션으로 센다.
        add(classifyGa4Source(r.key), r.sessions || 0);
      }
      return { refs: out, internal, unit: 'sessions', live: false };
    }
    for (const e of this.liveOf(day)) {
      add(classifyRef(e.m.referrer, e.m.user_agent, e.m.utm_source), 1);
    }
    return { refs: out, internal, unit: 'views', live: true };
  }

  // GA4 기본 채널그룹 — "GA4 는 뭐라고 봤나". 네이버가 Referral 로 빠지는 걸 보여주는 용도.
  channels(day) {
    return this.agg('channel', day).map((r) => ({ ...r, label: channelKo(r.key) }));
  }

  // path → 제목. GA4 pagePath 에는 제목이 없어 자체 트래커 기록에서 끌어온다.
  titleMap() {
    if (this._titles) return this._titles;
    const m = {};
    for (const e of this.live) {
      const p = e.m.path || (e.m.slug ? `/${e.m.slug}/` : '');
      if (p && e.m.title && !m[p]) m[p] = e.m.title;
    }
    return (this._titles = m);
  }

  // 조회된 글 TOP — GA4 는 pagePath(dim='page_all'), 폴백은 자체 트래커 path
  topPages(day, n = 5) {
    const titles = this.titleMap();
    const label = (path) => titles[path] || (path === '/' ? '홈' : path.replace(/^\/|\/$/g, ''));
    if (this.hasGa4(day)) {
      return this.agg('page_all', day)
        .filter((r) => r.key && r.key !== '(not set)')
        .slice(0, n)
        .map((r) => ({ path: r.key, title: label(r.key), views: r.views || r.sessions }));
    }
    const by = {};
    for (const e of this.liveOf(day)) {
      const p = e.m.path || '/';
      by[p] = (by[p] || 0) + 1;
    }
    return Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([path, views]) => ({ path, title: label(path), views }));
  }

  // 글별 조회수 (새 글 초기 성과 조회용) — path 로 찾는다
  viewsOfPath(day, path) {
    const p = String(path || '');
    if (this.hasGa4(day)) {
      const row = this.agg('page_all', day).find((r) => r.key === p || r.key === p.replace(/\/$/, ''));
      return row ? row.views || row.sessions : 0;
    }
    return this.liveOf(day).filter((e) => (e.m.path || '/') === p).length;
  }

  // 마지막 GA4 동기화 시각 (KST HH:MM) — 하루 1회 배치라 "몇 시 기준 수치인가"를 밝혀야 한다
  syncedLabel() {
    if (!this.syncedAt) return '';
    const d = new Date(new Date(this.syncedAt).getTime() + 9 * 3600 * 1000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
}

// ── WordPress REST — 글 수 / 특정일 발행 글 ─────────────────
// 뭉게는 repo·RSS 파이프라인이 없어(WP 직접 운영) 발행 목록을 WP REST 로 읽는다.
export async function mgPosts({ perPage = 20 } = {}) {
  try {
    const r = await fetch(
      `${MG_SITE}/wp-json/wp/v2/posts?per_page=${perPage}&_fields=title,link,date,slug`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return { total: 0, recent: [] };
    const total = Number(r.headers.get('x-wp-total')) || 0;
    const posts = await r.json();
    return {
      total,
      recent: (Array.isArray(posts) ? posts : []).map((p) => ({
        title: String(p.title?.rendered || '').replace(/<[^>]*>/g, '').trim(),
        link: p.link,
        slug: p.slug,
        // WP date 는 사이트 타임존(KST) 로컬시각이라 그대로 잘라 쓰면 된다
        day: String(p.date || '').slice(0, 10),
        path: (() => {
          try {
            return new URL(p.link).pathname;
          } catch {
            return `/${p.slug}/`;
          }
        })(),
      })),
    };
  } catch {
    return { total: 0, recent: [] };
  }
}

// 네이버 색인 최신치 (로컬 scripts/naver-index-check.mjs 가 analytics 에 남긴 값)
export async function mgNaverIndex() {
  try {
    const rows = await rest(
      'analytics?event_type=eq.naver_index&source=eq.mg&metadata->>__probe=is.null' +
        '&select=metadata,created_at&order=created_at.desc&limit=30'
    );
    const seen = new Set();
    const days = [];
    for (const r of rows) {
      const day = String(r.metadata?.date || r.created_at).slice(0, 10);
      if (seen.has(day)) continue;         // 같은 날 재측정은 최신 1건만
      seen.add(day);
      days.push({ day, ...r.metadata, at: r.created_at });
      if (days.length === 2) break;
    }
    return days.length ? { cur: days[0], prev: days[1] || null } : null;
  } catch {
    return null;
  }
}
