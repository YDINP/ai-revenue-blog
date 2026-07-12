#!/usr/bin/env node
/**
 * coupang-images.mjs 가 남긴 "키워드 → 썸네일 URL" 매핑(로그)을 이용해
 * imageUrl 이 비어 있는 coupangLinks 항목만 오프라인으로 채운다.
 * (파트너스 API가 연속 호출에 스로틀되므로 재조회 없이 기존 결과를 재사용한다.)
 *
 * 사용법: node scripts/coupang-images-fill.mjs <매핑로그경로>
 */
import fs from 'node:fs';
import path from 'node:path';

const BLOG_DIR = path.join(process.cwd(), 'src', 'blog');
const logPath = process.argv[2];
if (!logPath) {
  console.error('매핑 로그 경로가 필요하다.');
  process.exit(1);
}

const map = new Map();
for (const line of fs.readFileSync(logPath, 'utf8').split('\n')) {
  const m = line.match(/ :: (.+?) → (https?:\/\/\S+)$/);
  if (m) map.set(m[1], m[2]);
}
console.log(`매핑 ${map.size}종 로드`);

let filled = 0;
let missing = new Set();

for (const file of fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'))) {
  const full = path.join(BLOG_DIR, file);
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  let fmLast = lines.indexOf('---', 1);
  if (fmLast === -1) continue;

  let changed = false;
  for (let i = 1; i < fmLast; i++) {
    const m = lines[i].match(/^ {2}- title: "?(.+?)"?$/);
    if (!m) continue;
    let owner = null;
    for (let j = i - 1; j > 0; j--) {
      const k = lines[j].match(/^(\w+):/);
      if (k) { owner = k[1]; break; }
    }
    if (owner !== 'coupangLinks') continue;

    // 이 항목의 필드 범위에 imageUrl 이 이미 있으면 건너뛴다.
    let end = i + 1;
    while (end < lines.length && /^\s{4}\w+:/.test(lines[end])) end++;
    if (lines.slice(i, end).some((l) => /^\s{4}imageUrl:/.test(l))) continue;

    const img = map.get(m[1]);
    if (!img) { missing.add(m[1]); continue; }
    lines.splice(end, 0, `    imageUrl: "${img}"`);
    fmLast++;
    filled++;
    changed = true;
  }
  if (changed) fs.writeFileSync(full, lines.join('\n'), 'utf8');
}

console.log(`imageUrl ${filled}개 채움`);
if (missing.size) console.log(`매핑 없는 키워드 ${missing.size}종:`, [...missing].join(', '));
