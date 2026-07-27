#!/usr/bin/env node
// TF(ai-revenue-blog) → mungge.com 301 이전 진행률 점검
// ─────────────────────────────────────────────────────────────
// 사용:  CRON_SECRET=… node scripts/migration-status.mjs [--urls N]
//
// 이전 직후에는 GSC 노출이 0이어도 "순위가 아직 안 붙은 것"인지 "색인이 안 된 것"인지
// 구분되지 않는다. 구 도메인이 아직 색인을 쥐고 있는지, 신 도메인이 크롤됐는지를
// URL 검사 API로 직접 확인해야 진행률을 말할 수 있다.
//
// 판정 기준
//   구 도메인(TF)  : googleCanonical 이 mungge 로 바뀌면 그 URL은 이전 완료
//   신 도메인(mg)  : coverageState 가 '색인이 생성되었습니다' 면 완료

const API = 'https://ai-revenue-blog.vercel.app/api/gsc-sync';
const SECRET = process.env.CRON_SECRET;
if (!SECRET) {
  console.error('env CRON_SECRET 필요');
  process.exit(1);
}

const argN = process.argv.includes('--urls') ? Number(process.argv[process.argv.indexOf('--urls') + 1]) : 10;
const N = Math.min(Math.max(argN || 10, 1), 10); // URL 검사는 호출당 10개 상한

const call = async (params) => {
  const qs = new URLSearchParams({ ...params, secret: SECRET });
  const r = await fetch(`${API}?${qs}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};

// 노출 상위 페이지 = 이전 성패가 걸린 페이지. 여기부터 본다.
async function topPaths(days) {
  const j = await call({ dim: 'page', blog: 'tf', days, limit: '300' });
  const agg = {};
  for (const r of j.rows) {
    const path = r.keys[0].split('#')[0].replace(/^https?:\/\/[^/]+\/blog/, '');
    if (!/^\/\d{4}-|^\/[a-z]/.test(path) || path.startsWith('/tags')) continue;
    agg[path] = (agg[path] || 0) + r.impressions;
  }
  return Object.entries(agg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, N)
    .map(([path, impressions]) => ({ path: path.endsWith('/') ? path : `${path}/`, impressions }));
}

const pad = (s, n) => String(s).padEnd(n);

(async () => {
  const days = 28;
  const paths = await topPaths(days);
  console.log(`상위 ${paths.length}개 페이지(최근 ${days}일 노출 기준)로 이전 진행률을 확인한다.\n`);

  const [tf, mg] = await Promise.all([
    call({ blog: 'tf', inspect: paths.map((p) => `https://ai-revenue-blog.vercel.app/blog${p.path}`).join(',') }),
    call({ blog: 'mg', inspect: paths.map((p) => `https://mungge.com${p.path}`).join(',') }),
  ]);

  let moved = 0;
  let indexed = 0;
  console.log(`${pad('노출', 6)}${pad('구 도메인 canonical', 22)}${pad('신 도메인 색인상태', 34)}경로`);
  console.log('─'.repeat(110));
  for (let i = 0; i < paths.length; i++) {
    const t = tf.results[i] || {};
    const m = mg.results[i] || {};
    const isMoved = (t.googleCanonical || '').includes('mungge.com');
    const isIndexed = /색인이 생성되었습니다|Submitted and indexed/.test(m.coverageState || '');
    if (isMoved) moved++;
    if (isIndexed) indexed++;
    console.log(
      pad(paths[i].impressions, 6) +
        pad(isMoved ? '→ mungge ✅' : '구 URL 유지', 22) +
        pad((m.coverageState || m.error || '?').slice(0, 32), 34) +
        paths[i].path
    );
  }

  console.log('\n== 진행률 ==');
  console.log(`  구 도메인 canonical 이전 : ${moved}/${paths.length}`);
  console.log(`  신 도메인 색인 완료      : ${indexed}/${paths.length}`);

  for (const key of ['tf', 'mg']) {
    const s = await call({ blog: key, sitemaps: '1' });
    for (const m of s.sitemaps) {
      console.log(
        `  [${key}] 사이트맵 ${m.path}\n        제출 ${(m.lastSubmitted || '-').slice(0, 10)} · 다운로드 ${(m.lastDownloaded || '-').slice(0, 10)} · 오류 ${m.errors} 경고 ${m.warnings}`
      );
    }
  }
})().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
