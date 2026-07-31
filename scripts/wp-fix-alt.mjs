#!/usr/bin/env node
// wp-fix-alt.mjs — 대표이미지 첨부의 alt 텍스트를 글 제목으로 채운다.
//
// 왜: 네이버 서치어드바이저 "Alt 속성 누락"(2026-07-31)을 추적하다 드러난 것.
//   이미지 첨부 308개 중 239개가 alt 비어 있고, 54개는 파일명에서 자동생성된
//   무의미한 값이었다("2026 07 31 ai gemini robotics 2 whole body intelligence 2026").
//
// ⚠️ 무엇을 고치고 무엇을 안 고치는지가 이 스크립트의 핵심이다.
//
//   고침 — **대표이미지**만. 글 페이지에서 대표이미지는 링크 밖 단독 히어로
//          (`post-top-featured`)라 alt 이 유일한 설명 수단이다.
//
//   안 고침 — 홈/목록의 카드 이미지(.mg-hcard__img / .mg-shop__img). 이건 첨부 alt 를
//          쓰지도 않고, `<a>` 안에 글 제목·상품명 텍스트가 이미 있어서 **빈 alt 이 정답**이다
//          (W3C 권장). 채우면 스크린리더가 같은 내용을 두 번 읽는다. 네이버 검사기가
//          맥락을 안 보고 빈 alt 를 일괄로 잡는 것이라 그 경고는 오탐이다.
//
//   안 고침 — 대표이미지가 아닌 첨부(본문 삽입·미사용). 제목을 근거로 삼을 수 없다.
//
// 대상 판정: 대표이미지 AND (alt 비어있음 OR alt 이 파일명에서 파생된 것)
//
// 사용법:
//   node scripts/wp-fix-alt.mjs            # 드라이런(기본) — 무엇을 바꿀지만 출력
//   node scripts/wp-fix-alt.mjs --apply    # 실제 반영
//   node scripts/wp-fix-alt.mjs --apply --limit 20
//
// 필요 env(automation/.env 또는 셸): WP_URL, WP_USER, WP_APP_PASS

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

// automation/.env 로드(이미 있는 env 는 덮지 않음)
for (const p of [join(__dir, '../../automation/.env'), join(__dir, '../.env')]) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { WP_URL, WP_USER, WP_APP_PASS } = process.env;
if (!WP_URL || !WP_USER || !WP_APP_PASS) {
  console.error('WP_URL / WP_USER / WP_APP_PASS 가 필요합니다.');
  process.exit(2);
}
const AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASS}`).toString('base64');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = Number((args.find((a) => a.startsWith('--limit')) || '').split(/[=\s]/)[1]) || Infinity;

async function pages(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const r = await fetch(`${WP_URL}${path}&per_page=100&page=${page}`, { headers: { Authorization: AUTH } });
    if (!r.ok) break;
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) break;
    out.push(...j);
    if (j.length < 100) break;
  }
  return out;
}

// 파일명에서 파생된 alt 인가 — "2026 07 31 ai gemini…" 처럼 슬러그를 공백으로 바꾼 값.
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
const fileSlug = (url) => (url || '').split('/').pop().replace(/\.[a-z]+$/i, '').replace(/-\d+x\d+$/, '');
function isFilenameAlt(m) {
  const a = norm(m.alt_text);
  if (!a) return false;
  return norm(fileSlug(m.source_url)).includes(a.slice(0, 14));
}

const [posts, media] = await Promise.all([
  // context=edit 로 title.raw 를 받는다 — rendered 는 &#8216; 같은 엔티티가 섞인다
  pages('/wp-json/wp/v2/posts?status=any&context=edit&_fields=id,title,featured_media'),
  pages('/wp-json/wp/v2/media?context=edit&_fields=id,alt_text,source_url,media_type'),
]);

const titleOf = new Map();
for (const p of posts) if (p.featured_media) titleOf.set(p.featured_media, (p.title?.raw || '').trim());

const targets = media
  .filter((m) => m.media_type === 'image')
  .filter((m) => titleOf.has(m.id))
  .filter((m) => !(m.alt_text || '').trim() || isFilenameAlt(m))
  .map((m) => ({ id: m.id, before: m.alt_text || '', alt: titleOf.get(m.id) }))
  .filter((t) => t.alt)
  // 이미 제목과 같으면 대상이 아니다. 파일명이 제목에서 만들어진 글은 isFilenameAlt 가
  // "제목=파일명 파생"으로 오판해 매번 유령 대상 1건을 만든다(id 1475 실측).
  .filter((t) => t.before !== t.alt)
  .slice(0, LIMIT);

console.log(`글 ${posts.length} · 이미지 첨부 ${media.filter((m) => m.media_type === 'image').length}`);
console.log(`대상 ${targets.length}건 (빈 alt ${targets.filter((t) => !t.before).length} · 파일명형 ${targets.filter((t) => t.before).length})`);
console.log(APPLY ? '\n=== 반영 ===' : '\n=== 드라이런 (반영하려면 --apply) ===');

// 되돌릴 수 있게 원본을 남긴다
const backup = join(__dir, '../.tmp-alt-backup.json');
if (APPLY) {
  writeFileSync(backup, JSON.stringify(targets.map((t) => ({ id: t.id, alt_text: t.before })), null, 1));
  console.log(`원본 백업: ${backup}`);
}

let ok = 0, fail = 0;
for (const [i, t] of targets.entries()) {
  if (!APPLY) {
    if (i < 8) console.log(`  ${t.id}  ${JSON.stringify(t.before)} → ${t.alt.slice(0, 58)}`);
    continue;
  }
  try {
    const r = await fetch(`${WP_URL}/wp-json/wp/v2/media/${t.id}`, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt_text: t.alt }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    ok++;
    if (ok % 25 === 0) console.log(`  ${ok}/${targets.length}`);
  } catch (e) {
    fail++;
    console.error(`  실패 ${t.id}: ${e.message}`);
  }
}
if (APPLY) console.log(`\n완료 ${ok} · 실패 ${fail}`);
else if (targets.length > 8) console.log(`  … 외 ${targets.length - 8}건`);
