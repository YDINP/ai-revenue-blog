#!/usr/bin/env node
// 네이버 색인 추적 — `site:<도메인>` 웹검색 결과를 렌더링해서 실제 색인된 URL을 센다.
//
// 왜 렌더링이 필요한가: 네이버 검색결과는 클라이언트에서 그려진다. curl로 받은 HTML엔
// 결과 항목이 없어서 "0건"과 "차단"과 "미색인"이 구분되지 않는다 → playwright로 실물 확인.
//
// 사용법:
//   node scripts/naver-index-check.mjs                     # mungge.com 확인 + 이력 저장
//   node scripts/naver-index-check.mjs --site example.com
//   node scripts/naver-index-check.mjs --json              # JSON 출력(자동화용)
//   node scripts/naver-index-check.mjs --no-save           # 이력 저장 안 함
//   node scripts/naver-index-check.mjs --history           # 저장된 이력만 출력하고 종료
//
// 이력: scripts/naver-index-history.json (실행할 때마다 1건 append, 같은 날 재실행은 덮어씀)
// 종료코드: 색인 0건이면 1 (cron/CI에서 실패로 잡고 싶을 때)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../api/_shared.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const HISTORY = path.join(__dir, 'naver-index-history.json');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const SITE = opt('site', 'mungge.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
const MAX_PAGES = Number(opt('pages', 10));
const JSON_OUT = flag('json');
const SAVE = !flag('no-save');

// gsc_daily 의 source 키 — 블로그 레지스트리 key 와 같다(_gsc-sync.js 참고)
const GSC_SOURCE = { 'mungge.com': 'mg' }[SITE] || null;

const KST = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString();
const today = () => KST().slice(0, 10);

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY, 'utf8'));
  } catch {
    return [];
  }
}

// ── 사이트맵의 URL 총수(색인률 분모) ───────────────────────────────
// sitemapindex 면 하위 사이트맵을 한 번 더 펼친다. 글 수만 알면 되므로 2단계까지만.
async function sitemapCount(site) {
  const fetchText = async (u) => {
    const r = await fetch(u, { redirect: 'follow' });
    if (!r.ok) throw new Error(`${u} → HTTP ${r.status}`);
    return r.text();
  };
  const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

  const root = await fetchText(`https://${site}/sitemap.xml`);
  if (!/<sitemapindex/i.test(root)) return { total: locs(root).length, children: 1 };

  const children = locs(root);
  let total = 0;
  for (const c of children) {
    try {
      total += locs(await fetchText(c)).length;
    } catch (e) {
      console.error(`  ⚠️ 하위 사이트맵 실패: ${e.message}`);
    }
  }
  return { total, children: children.length };
}

// ── 네이버 웹검색 site: 색인 수집 ─────────────────────────────────
async function naverIndexed(site) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      'playwright 가 없습니다. 상위 폴더(Ben_Claude)에서 `npm i -D playwright` 후 `npx playwright install chromium`'
    );
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 2400 },
  });
  const page = await ctx.newPage();

  const host = site.replace(/\./g, '\\.');
  const found = new Map();
  let blocked = false;
  let pagesRead = 0;

  try {
    for (let n = 1; n <= MAX_PAGES; n++) {
      const start = (n - 1) * 10 + 1;
      const url = `https://search.naver.com/search.naver?where=web&query=${encodeURIComponent(
        `site:${site}`
      )}&start=${start}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1200);
      pagesRead = n;

      const res = await page.evaluate((hostRe) => {
        const re = new RegExp(`^https?://(www\\.)?${hostRe}`);
        const body = document.body.innerText || '';
        const hits = [];
        document.querySelectorAll('a[href]').forEach((a) => {
          const href = a.href || '';
          const title = (a.innerText || '').trim().replace(/\s+/g, ' ');
          // 검색결과 카드의 제목 링크만 — 파비콘/더보기 같은 빈 앵커는 제목이 없다
          if (re.test(href) && title.length > 3) hits.push({ href, title: title.slice(0, 70) });
        });
        return {
          hits,
          blocked: /비정상적인 검색|자동입력 방지|보안문자/.test(body),
          empty: /검색결과가 없습니다|검색 결과가 없습니다/.test(body),
        };
      }, host);

      if (res.blocked) {
        blocked = true;
        break;
      }

      const before = found.size;
      for (const h of res.hits) {
        const clean = h.href.split(/[?#]/)[0];
        if (!found.has(clean)) found.set(clean, h.title);
      }
      // 새 URL이 안 나오면 마지막 페이지 — 더 넘겨도 같은 결과만 반복된다
      if (found.size === before) break;
    }
  } finally {
    await browser.close();
  }

  return { urls: found, blocked, pagesRead };
}

// ── 구글 쪽 대조(GSC → Supabase gsc_daily) ─────────────────────────
// 네이버만 보면 "색인은 됐는데 구글도 죽었나?"를 알 수 없어서 같은 화면에 띄운다.
async function gscRecent(source, days = 7) {
  if (!source) return null;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const q =
    `${SUPABASE_URL}/rest/v1/gsc_daily?source=eq.${source}&page=eq._TOTAL_` +
    `&date=gte.${since}&order=date.asc&select=date,clicks,impressions`;
  try {
    const r = await fetch(q, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!rows.length) return { rows: [], clicks: 0, impressions: 0 };
    return {
      rows,
      clicks: rows.reduce((s, x) => s + (x.clicks || 0), 0),
      impressions: rows.reduce((s, x) => s + (x.impressions || 0), 0),
    };
  } catch {
    return null;
  }
}

// ── 이력만 출력 ────────────────────────────────────────────────────
if (flag('history')) {
  const h = loadHistory().filter((x) => x.site === SITE);
  if (JSON_OUT) {
    console.log(JSON.stringify(h, null, 2));
  } else if (!h.length) {
    console.log(`이력 없음 (${HISTORY})`);
  } else {
    console.log(`📈 네이버 색인 이력 — ${SITE}`);
    let prev = null;
    for (const e of h) {
      const d = prev === null ? '' : ` (${e.indexed - prev >= 0 ? '+' : ''}${e.indexed - prev})`;
      console.log(`  ${e.date}  색인 ${e.indexed} / 사이트맵 ${e.sitemap}${d}`);
      prev = e.indexed;
    }
  }
  process.exit(0);
}

// ── 실행 ───────────────────────────────────────────────────────────
const sm = await sitemapCount(SITE).catch((e) => {
  console.error(`⚠️ 사이트맵 조회 실패: ${e.message}`);
  return { total: 0, children: 0 };
});
const nv = await naverIndexed(SITE);
const gsc = await gscRecent(GSC_SOURCE);

const indexed = nv.urls.size;
const rate = sm.total ? (indexed / sm.total) * 100 : 0;

const history = loadHistory();
const mine = history.filter((x) => x.site === SITE);
const prev = mine.filter((x) => x.date !== today()).slice(-1)[0] || null;
const delta = prev ? indexed - prev.indexed : null;

const entry = {
  site: SITE,
  date: today(),
  at: KST(),
  sitemap: sm.total,
  indexed,
  blocked: nv.blocked,
  urls: [...nv.urls.keys()].slice(0, 50),
};

if (SAVE) {
  const kept = history.filter((x) => !(x.site === SITE && x.date === today()));
  kept.push(entry);
  fs.writeFileSync(HISTORY, JSON.stringify(kept, null, 2) + '\n');
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ...entry, delta, rate: Number(rate.toFixed(2)), gsc }, null, 2));
} else {
  console.log(`\n🔍 네이버 색인 추적 — ${SITE}   (${entry.at.replace('T', ' ').slice(0, 16)} KST)`);
  console.log('─'.repeat(52));
  if (nv.blocked) {
    console.log('🚫 네이버가 자동 접근을 차단했습니다(보안문자). 잠시 후 다시 실행하세요.');
  }
  console.log(`사이트맵 URL   ${String(sm.total).padStart(6)}   (하위 사이트맵 ${sm.children}개)`);
  console.log(
    `네이버 색인    ${String(indexed).padStart(6)}   (${rate.toFixed(1)}%)` +
      (delta === null ? '   ※ 첫 측정' : `   전회(${prev.date}) 대비 ${delta >= 0 ? '+' : ''}${delta}`)
  );

  if (indexed <= 1 && !nv.blocked) {
    console.log(
      '\n⚠️ 홈 외에는 색인이 없습니다. 서치어드바이저(searchadvisor.naver.com)에서\n' +
        `   ① 사이트 등록·소유확인 ② 요청 → 사이트맵 제출(https://${SITE}/sitemap.xml)\n` +
        '   ③ 요청 → 웹페이지 수집 으로 대표 글 몇 개 수동 요청 을 확인하세요.'
    );
  }

  if (indexed) {
    console.log('\n색인된 URL(최대 15):');
    [...nv.urls.entries()].slice(0, 15).forEach(([u, t]) => console.log(`  · ${u}\n      ${t}`));
  }

  if (gsc) {
    console.log(`\n[대조] 구글 GSC 최근 ${gsc.rows.length}일: 클릭 ${gsc.clicks} · 노출 ${gsc.impressions}`);
    if (gsc.rows.length) {
      console.log(
        '  ' + gsc.rows.map((r) => `${r.date.slice(5)} ${r.clicks}/${r.impressions}`).join('  ')
      );
    }
  }
  if (SAVE) console.log(`\n이력 저장: ${path.relative(process.cwd(), HISTORY)}  (--history 로 추이 보기)`);
}

process.exit(indexed > 0 ? 0 : 1);
