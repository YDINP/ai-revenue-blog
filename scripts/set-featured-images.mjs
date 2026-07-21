#!/usr/bin/env node
// 이전된 WP 글에 대표이미지(featured image) 일괄 설정.
// 원본 Astro frontmatter의 heroImage(LF)/image.url(TF)을 다운로드→WP 미디어 업로드→featured_media 지정.
// 재개: .tmp/featured-done.json. env: WP_URL/WP_USER/WP_APP_PASS.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const B = process.env.WP_URL.replace(/\/$/, '') + '/wp-json/wp/v2';
const auth = 'Basic ' + Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASS}`).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const maps = [
  ['src/blog', '.tmp/wp-migrated-src_blog.json'],
  ['../life-revenue-blog/src/blog', '.tmp/wp-migrated-_liferevenueblog_src_blog.json'],
];
const heroOf = (fm) => {
  // LF: heroImage(flat) 우선 — coupangLinks.url 오매칭 방지
  let m = fm.match(/^heroImage:\s*["']?([^"'\s]+)/m);
  if (m) return m[1].trim();
  // TF: image: 블록 바로 아래 url: (쿠팡은 coupangLinks 아래라 미매칭)
  m = fm.match(/^image:\s*\n\s+url:\s*["']?([^"'\s]+)/m) || fm.match(/^image:\s*\{[^}]*url:\s*["']?([^"',}]+)/m);
  return m ? m[1].trim() : '';
};

const donePath = '.tmp/featured-done.json';
const done = existsSync(donePath) ? JSON.parse(readFileSync(donePath, 'utf8')) : {};

// 대상 수집
const jobs = [];
for (const [dir, mapPath] of maps) {
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  for (const [slug, wpId] of Object.entries(map)) {
    const f = `${dir}/${slug}.md`;
    if (!existsSync(f)) continue;
    const fmM = readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const url = heroOf(fmM ? fmM[1] : '');
    jobs.push({ slug, wpId, url, dir });
  }
}
console.log(`대상 ${jobs.length}개 / 완료 ${Object.keys(done).length}개`);

let ok = 0, skip = 0, fail = 0;
for (const j of jobs) {
  if (done[j.slug]) { skip++; continue; }
  if (!j.url) { console.log(`  ⏭  ${j.slug}: URL없음`); fail++; continue; }
  try {
    let buf, ct;
    if (/^https?:\/\//.test(j.url)) {
      // 원격 다운로드: node undici는 Pexels가 403 → curl 사용(200 확인됨)
      const tmp = `.tmp/heroimg/${j.slug}.tmp`;
      execSync(`curl -s -L --max-time 25 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" -o "${tmp}" "${j.url}"`, { stdio: 'ignore' });
      if (!existsSync(tmp)) throw new Error('curl 다운로드 실패');
      buf = readFileSync(tmp);
      if (buf.length < 500) throw new Error('다운로드 크기 이상 ' + buf.length);
      ct = /\.png(\?|$)/i.test(j.url) ? 'image/png' : /\.webp(\?|$)/i.test(j.url) ? 'image/webp' : 'image/jpeg';
    } else {
      // 상대경로(/images/x) → 로컬 public 파일에서 읽기
      const publicBase = j.dir === 'src/blog' ? 'public' : '../life-revenue-blog/public';
      const local = publicBase + (j.url.startsWith('/') ? j.url : '/' + j.url);
      if (!existsSync(local)) throw new Error('로컬없음 ' + local);
      buf = readFileSync(local);
      ct = /\.png$/i.test(j.url) ? 'image/png' : /\.webp$/i.test(j.url) ? 'image/webp' : 'image/jpeg';
    }
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    // WP 미디어 업로드
    const up = await fetch(`${B}/media`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': ct, 'Content-Disposition': `attachment; filename="${j.slug}.${ext}"` },
      body: buf,
    });
    const media = await up.json();
    if (!up.ok) throw new Error('업로드 ' + up.status + ' ' + JSON.stringify(media).slice(0, 100));
    // featured_media 지정
    const pr = await fetch(`${B}/posts/${j.wpId}`, {
      method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured_media: media.id }),
    });
    if (!pr.ok) throw new Error('featured ' + pr.status);
    done[j.slug] = media.id;
    writeFileSync(donePath, JSON.stringify(done, null, 2));
    ok++;
    if (ok % 10 === 0) console.log(`  ✅ ${ok}개 완료 (최근: ${j.slug})`);
  } catch (e) {
    fail++;
    console.log(`  ❌ ${j.slug}: ${e.message}`);
  }
  await sleep(1500);
}
console.log(`\n완료: 설정 ${ok} / 스킵 ${skip} / 실패 ${fail}`);
