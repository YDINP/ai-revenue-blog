// mungge 글 본문 맨 앞에 제휴 고지 문구를 넣는다.
//
// 왜: 공정위 추천·보증 심사지침이 2024-12-01 개정되면서 블로그 같은 문자 매체는
// 고지를 "제목 또는 첫 부분"에 둬야 한다(종전엔 끝부분도 허용). 실측 결과 뭉게 글은
// 첫 제휴링크가 본문 13% 지점인데 고지는 36% 지점이라 링크보다 뒤였다.
//
// 기존 중간 고지는 건드리지 않는다 — 쿠팡 CTA 블록 안에 박혀 있어 떼어내면 마크업이
// 깨질 위험이 있고, 고지가 두 번 나오는 것 자체는 위반이 아니다.
//
//   node scripts/fix-affiliate-notice.mjs --dry-run   # 대상만 집계
//   node scripts/fix-affiliate-notice.mjs             # 실제 적용
//   node scripts/fix-affiliate-notice.mjs --revert    # 넣은 문구 제거(마커 기준)
//
// ⚠️ 서버가 스로틀링에 민감하다(공유호스팅). 요청마다 간격을 둔다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(HERE, '..', '..', 'automation', '.env');

const MARK = '<!-- MG-AFF-NOTICE -->';
// 색을 고정하지 않고 opacity/currentColor 로 처리 — 라이트·다크 양쪽에서 읽힌다
const NOTICE =
  `${MARK}\n<p class="mg-aff-notice" style="font-size:.82rem;opacity:.72;border-left:3px solid #f59e0b;` +
  `padding:.5rem .8rem;margin:0 0 1.25rem;line-height:1.6;">` +
  `이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>\n`;

// 제휴 링크가 실제로 있는 글만 대상. 없는 글에 고지를 붙이면 오히려 오해를 부른다.
const AFFILIATE = /partners\.coupang|link\.coupang|coupang\.com|lptag/i;

function loadEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const revert = argv.includes('--revert');

const env = loadEnv(ENV_PATH);
const base = String(env.WP_URL || '').replace(/\/$/, '');
const auth = 'Basic ' + Buffer.from(`${env.WP_USER}:${env.WP_APP_PASS}`).toString('base64');
const H = { Authorization: auth };

// ── 1) 전체 글 수집 (본문 포함) ──
const posts = [];
for (let page = 1; page <= 30; page++) {
  const r = await fetch(
    `${base}/wp-json/wp/v2/posts?per_page=20&page=${page}&context=edit&status=publish&_fields=id,slug,content`,
    { headers: H }
  );
  if (r.status === 400) break;                 // 마지막 페이지 초과
  if (!r.ok) throw new Error(`목록 ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  if (!j.length) break;
  posts.push(...j);
  process.stdout.write(`\r수집 ${posts.length}편`);
  await sleep(250);
}
console.log(`\n총 ${posts.length}편`);

// ── 2) 대상 선별 ──
const targets = [];
const stats = { noAffiliate: 0, already: 0, ok: 0 };
for (const p of posts) {
  const c = p.content?.raw || '';
  if (revert) {
    if (c.includes(MARK)) targets.push(p);
    continue;
  }
  if (!AFFILIATE.test(c)) { stats.noAffiliate++; continue; }
  if (c.includes(MARK)) { stats.already++; continue; }
  stats.ok++;
  targets.push(p);
}
console.log(
  revert
    ? `되돌릴 대상 ${targets.length}편`
    : `제휴링크 없음 ${stats.noAffiliate} · 이미 처리됨 ${stats.already} · 처리 대상 ${stats.ok}`
);

// 처리 전 고지 위치가 실제로 링크보다 뒤였는지 표본 확인 — 근거 없이 190편을 고치지 않는다
if (!revert && targets.length) {
  let behind = 0, none = 0;
  for (const p of targets) {
    const c = p.content.raw;
    const d = c.search(/파트너스 활동|일정액의 수수료/);
    const l = c.search(AFFILIATE);
    if (d < 0) none++;
    else if (d > l) behind++;
  }
  console.log(`  ↳ 기존 고지가 첫 링크보다 뒤: ${behind}편 · 고지 자체 없음: ${none}편`);
}

if (dryRun) { console.log('--dry-run: 저장 생략'); process.exit(0); }
if (!targets.length) { console.log('처리할 글 없음'); process.exit(0); }

// ── 3) 적용 ──
let done = 0, failed = [];
for (const p of targets) {
  const c = p.content.raw;
  const next = revert
    ? c.replace(new RegExp(`${MARK}\\s*<p class="mg-aff-notice"[\\s\\S]*?</p>\\s*`), '')
    : NOTICE + c;
  try {
    const r = await fetch(`${base}/wp-json/wp/v2/posts/${p.id}`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: next }),
    });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 120)}`);
    done++;
    process.stdout.write(`\r적용 ${done}/${targets.length}`);
  } catch (e) {
    failed.push(`${p.slug}: ${e.message}`);
  }
  await sleep(400);   // 공유호스팅 배려
}
console.log(`\n완료 ${done}편${failed.length ? ` · 실패 ${failed.length}편` : ''}`);
failed.slice(0, 10).forEach((f) => console.log('  ⚠️ ' + f));
