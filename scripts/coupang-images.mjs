#!/usr/bin/env node
/**
 * 쿠팡 파트너스 Open API로 각 글의 coupangLinks[].title 을 키워드 검색해
 * 첫 번째 상품의 썸네일(productImage)을 frontmatter 의 imageUrl 로 주입한다.
 *
 * 쿠팡 검색 페이지는 봇 차단(403)이라 스크래핑이 불가능해 공식 API만이 유일한 경로다.
 * 링크(url)는 건드리지 않는다 — 이미지 필드만 채운다.
 *
 * 사용법:
 *   COUPANG_ACCESS_KEY=... COUPANG_SECRET_KEY=... node scripts/coupang-images.mjs [--dry-run] [--only <slug-substr>]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BLOG_DIR = path.join(process.cwd(), 'src', 'blog');
const HOST = 'api-gateway.coupang.com';
const API_PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';

const ACCESS = process.env.COUPANG_ACCESS_KEY;
const SECRET = process.env.COUPANG_SECRET_KEY;
const DRY = process.argv.includes('--dry-run');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

if (!ACCESS || !SECRET) {
  console.error('COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 환경변수가 필요하다 (파트너스 > 마이페이지 > API 키).');
  process.exit(1);
}

// CEA HMAC 서명: datetime(YYMMDDTHHmmssZ) + METHOD + path + query
function authHeader(query) {
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(2, 16) + 'Z';
  const message = datetime + 'GET' + API_PATH + query;
  const signature = crypto.createHmac('sha256', SECRET).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${ACCESS}, signed-date=${datetime}, signature=${signature}`;
}

async function firstProductImage(keyword) {
  const query = `keyword=${encodeURIComponent(keyword)}&limit=1`;
  const res = await fetch(`https://${HOST}${API_PATH}?${query}`, {
    headers: { Authorization: authHeader(query), 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const json = await res.json();
  const item = json?.data?.productData?.[0];
  return item?.productImage || null;
}

// frontmatter 의 coupangLinks 항목(- title: / url: / imageUrl:)만 라인 단위로 수정한다.
// (YAML 파서를 끼우면 나머지 frontmatter 포맷이 재작성되므로 최소 침습으로 간다.)
function injectImage(lines, itemStart, imageUrl) {
  let end = itemStart + 1;
  while (end < lines.length && /^\s{4}\w+:/.test(lines[end])) end++;
  const existing = lines.slice(itemStart, end).findIndex((l) => /^\s{4}imageUrl:/.test(l));
  const entry = `    imageUrl: "${imageUrl}"`;
  if (existing !== -1) {
    lines[itemStart + existing] = entry;
    return false;
  }
  lines.splice(end, 0, entry);
  return true;
}

const cache = new Map();
let touched = 0;
let filled = 0;

for (const file of fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'))) {
  if (ONLY && !file.includes(ONLY)) continue;
  const full = path.join(BLOG_DIR, file);
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  const fmEnd = lines.indexOf('---', 1);
  if (fmEnd === -1) continue;

  let changed = false;
  for (let i = 1; i < fmEnd; i++) {
    const m = lines[i].match(/^ {2}- title: "?(.+?)"?$/);
    if (!m) continue;
    // coupangLinks 블록 소속인지 확인 (직전의 최상위 키가 coupangLinks 여야 한다)
    let owner = null;
    for (let j = i - 1; j > 0; j--) {
      const k = lines[j].match(/^(\w+):/);
      if (k) { owner = k[1]; break; }
    }
    if (owner !== 'coupangLinks') continue;

    const keyword = m[1];
    if (!cache.has(keyword)) {
      try {
        cache.set(keyword, await firstProductImage(keyword));
        await new Promise((r) => setTimeout(r, 350)); // rate limit 여유
      } catch (e) {
        console.error(`  ! "${keyword}" 조회 실패: ${e.message}`);
        cache.set(keyword, null);
      }
    }
    const img = cache.get(keyword);
    if (!img) continue;
    if (injectImage(lines, i, img)) filled++;
    changed = true;
    console.log(`  ${file} :: ${keyword} → ${img}`);
  }

  if (changed) {
    touched++;
    if (!DRY) fs.writeFileSync(full, lines.join('\n'), 'utf8');
  }
}

console.log(`\n${DRY ? '[dry-run] ' : ''}글 ${touched}편 / imageUrl ${filled}개 주입, 키워드 ${cache.size}종 조회`);
