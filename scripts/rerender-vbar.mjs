#!/usr/bin/env node
// 세로막대(data-orient="vertical") 포함 글을 새 렌더(색막대+우측범례)로 재생성·업데이트.
// env: WP_URL/WP_USER/WP_APP_PASS/CANONICAL_BASE
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { publishPost } from './publish-wordpress.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const maps = [
  { dir: 'src/blog', log: '.tmp/wp-migrated-src_blog.json', silo: '테크·개발' },
  { dir: '../life-revenue-blog/src/blog', log: '.tmp/wp-migrated-_liferevenueblog_src_blog.json', silo: '생활·재테크' },
];
if (!existsSync('.tmp')) mkdirSync('.tmp', { recursive: true });
const donePath = '.tmp/vbar-rerender-done.json';
const done = existsSync(donePath) ? JSON.parse(readFileSync(donePath, 'utf8')) : {};

// 대상: 소스에 data-orient="vertical" 있는 글
const jobs = [];
for (const m of maps) {
  const map = JSON.parse(readFileSync(m.log, 'utf8'));
  for (const [slug, wpId] of Object.entries(map)) {
    const f = `${m.dir}/${slug}.md`;
    if (!existsSync(f)) continue;
    if (!/data-orient="vertical"/.test(readFileSync(f, 'utf8'))) continue;
    jobs.push({ slug, wpId, file: f, silo: m.silo });
  }
}
console.log(`세로막대 글 ${jobs.length}개 / 완료 ${Object.keys(done).length}`);

let ok = 0, skip = 0, fail = 0;
for (const j of jobs) {
  if (done[j.slug]) { skip++; continue; }
  try {
    await publishPost(j.file, { status: 'publish', keepChartDivs: true, silo: j.silo, updateId: j.wpId });
    done[j.slug] = j.wpId;
    writeFileSync(donePath, JSON.stringify(done, null, 2));
    ok++;
    if (ok % 20 === 0) console.log(`  ${ok}개 재렌더... (최근 ${j.slug})`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${j.slug}: ${e.message}`);
  }
  await sleep(700);
}
console.log(`\n완료: 재렌더 ${ok} / 스킵 ${skip} / 실패 ${fail}`);
