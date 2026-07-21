#!/usr/bin/env node
// Astro 블로그 → WordPress 벌크 이전 (색인글만, 잉여=noindex 제외)
// ─────────────────────────────────────────────────────────────
// 사용:
//   node scripts/bulk-migrate-wordpress.mjs <blogDir> --list          # KEEP 대상만 출력(WP 호출 X)
//   node scripts/bulk-migrate-wordpress.mjs <blogDir> --status draft  # draft로 벌크 발행
//   node scripts/bulk-migrate-wordpress.mjs <blogDir> --status publish
//
//   blogDir 예) ../ai-revenue-blog/src/blog  또는  ./src/blog
//
// 정책: noindex=true(잉여 143개)는 자동 제외. Astro 원본은 안 건드림(읽기만).
// 재개: .tmp/wp-migrated-<label>.json 에 발행된 slug 기록 → 재실행 시 스킵(중복발행 방지).
// 레이트리밋: 기본 2.5초 간격(WP 부하·429 회피).
//
// env: WP_URL / WP_USER / WP_APP_PASS / CANONICAL_BASE (publish-wordpress.mjs 참조)

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { publishPost, envFromProcess } from './publish-wordpress.mjs';

const dir = process.argv[2];
const listOnly = process.argv.includes('--list');
const keepCharts = process.argv.includes('--keep-charts'); // WP에 blog-post.js+CSS 이식 완료 시 chart div 그대로 발행
const silo = process.argv.includes('--silo') ? process.argv[process.argv.indexOf('--silo') + 1] : ''; // 1사이트 통합: 부모 카테고리(예: "테크·개발" / "생활·재테크")
const status = process.argv.includes('--status') ? process.argv[process.argv.indexOf('--status') + 1] : 'draft';
const delayMs = 2500;
if (!dir) { console.error('사용: node scripts/bulk-migrate-wordpress.mjs <blogDir> [--list|--status draft|publish]'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const label = dir.replace(/[\\/]/g, '_').replace(/[^a-z0-9_]/gi, '');
const logPath = join('.tmp', `wp-migrated-${label}.json`);
if (!existsSync('.tmp')) mkdirSync('.tmp', { recursive: true });
const done = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : {};

// KEEP = noindex!=true. 잉여(noindex) + 이미 발행분 제외.
const keep = [];
for (const name of readdirSync(dir)) {
  if (!name.endsWith('.md')) continue;
  const f = join(dir, name);
  const raw = readFileSync(f, 'utf8');
  // frontmatter 블록(첫 --- ~ 두번째 ---) 전체에서 noindex 검사
  const fmM = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = fmM ? fmM[1] : raw.slice(0, 1200);
  if (/^noindex:\s*true/m.test(fm)) continue; // 잉여(noindex) 제외
  keep.push(f);
}

console.log(`대상 디렉터리: ${dir}`);
console.log(`KEEP(색인글) ${keep.length}개 / 이미 발행 ${Object.keys(done).length}개`);

if (listOnly) {
  keep.forEach((f, i) => console.log(`  ${i + 1}. ${basename(f, '.md')}${done[basename(f, '.md')] ? ' (이미발행)' : ''}`));
  console.log('\n(--list: WP 호출 안 함. 실제 발행은 --status draft 로)');
  process.exit(0);
}

const env = envFromProcess();
let ok = 0, skip = 0, fail = 0;
for (const f of keep) {
  const slug = basename(f, '.md');
  if (done[slug]) { skip++; continue; }
  try {
    const r = await publishPost(f, { status, env, keepChartDivs: keepCharts, silo });
    done[slug] = r.id;
    writeFileSync(logPath, JSON.stringify(done, null, 2));
    ok++;
    console.log(`  ✅ [${ok}] ${slug} → #${r.id}`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${slug}: ${e.message}`);
  }
  await sleep(delayMs);
}
console.log(`\n완료: 발행 ${ok} / 스킵(기발행) ${skip} / 실패 ${fail}. 로그=${logPath}`);
