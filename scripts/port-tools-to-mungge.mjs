#!/usr/bin/env node
// LifeFlow(/tools/) 계산기 → mungge.com WordPress 페이지 이식
// ─────────────────────────────────────────────────────────────
// 사용:
//   node scripts/port-tools-to-mungge.mjs --list                 # 대상만 출력(WP 호출 X)
//   node scripts/port-tools-to-mungge.mjs --only vat-calculator --status draft
//   node scripts/port-tools-to-mungge.mjs --status publish       # 전체 발행
//
// env: automation/.env 의 WP_URL / WP_USER / WP_APP_PASS 를 읽는다(값에 공백이 있어 소싱 금지).
//
// 조각을 어디서 가져오는지와 그 이유는 PRD-tools-to-mungge.md 참조.
//   본문   = dist/tools/<slug>/index.html 의 <main> 내부  (Astro 표현식이 해소된 상태)
//   CSS/JS = src/pages/tools/<slug>.astro 의 style is:global / script is:inline
//   JSON-LD= dist 의 application/ld+json
//
// slug 로 기존 페이지를 먼저 찾아 있으면 갱신한다 — 재실행해도 중복이 생기지 않는다.

import fs from 'node:fs';
import path from 'node:path';

const LF = 'C:/Users/a/Documents/Ben_Claude/life-revenue-blog';
const ENV = 'C:/Users/a/Documents/Ben_Claude/automation/.env';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const LIST = has('--list');
const ONLY = val('--only', '');
const STATUS = val('--status', 'draft');

// automation/.env — 값에 공백이 있어 셸 소싱이 안 된다. 직접 파싱한다.
const env = {};
for (const raw of fs.readFileSync(ENV, 'utf8').split('\n')) {
  const m = raw.replace(/\r$/, '').match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const BASE = (env.WP_URL || '').replace(/\/$/, '');
const AUTH = 'Basic ' + Buffer.from(`${env.WP_USER}:${env.WP_APP_PASS}`).toString('base64');

const wp = async (route, init = {}) => {
  const r = await fetch(`${BASE}/wp-json/wp/v2/${route}`, {
    ...init,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};

// ── 추출 ────────────────────────────────────────────────────
const between = (s, open, close) => {
  const i = s.indexOf(open);
  if (i < 0) return '';
  const j = s.indexOf(close, i + open.length);
  return j < 0 ? '' : s.slice(i + open.length, j);
};

function extract(slug) {
  const src = fs.readFileSync(path.join(LF, 'src/pages/tools', `${slug}.astro`), 'utf8');
  const distPath = path.join(LF, 'dist/tools', slug, 'index.html');
  if (!fs.existsSync(distPath)) throw new Error(`빌드 산출물 없음: ${distPath} (LF에서 npm run build 필요)`);
  const dist = fs.readFileSync(distPath, 'utf8');

  const body = between(dist, '<main class>', '</main>').trim();
  if (!body) throw new Error('본문(<main>) 추출 실패');

  const css = between(src, '<style is:global>', '</style>').trim();
  const js = between(src, '<script is:inline>', '</script>').trim();

  const ld = [...dist.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1].trim())
    .filter((x) => {
      try {
        const t = JSON.parse(x)['@type'];
        return t && t !== 'BreadcrumbList'; // 사이트 구조가 달라진 빵부스러기는 버린다
      } catch {
        return false;
      }
    });

  const title = (src.match(/^const title\s*=\s*['"`](.+?)['"`]\s*;?\s*$/m) || [])[1] || slug;
  const description = (src.match(/^const description\s*=\s*['"`](.+?)['"`]\s*;?\s*$/m) || [])[1] || '';

  return { slug, title, description, body, css, js, ld };
}

// Kadence 가 <h1 class="entry-title"> 를 따로 렌더해 계산기 자체 h1 과 중복된다 → 테마 제목만 숨긴다.
const HIDE_THEME_TITLE = '.entry-hero,.page-hero-section{display:none!important}';

// mungge 출력 필터가 본문을 두 가지로 망가뜨린다. 저장은 멀쩡하고 **렌더 시점**에만 일어난다.
//
//  (1) wpautop 이 <script> 안에서도 줄머리의 `<div` 를 블록 태그로 보고 </p><p> 를 끼워 넣는다.
//      JS 템플릿 리터럴(`<div class=...`)이 그대로 깨진다 → wp:html 블록으로 감싸면 막힌다.
//  (2) `&` 가 `&#038;` 로 치환된다. <script> 안에서는 엔티티가 해석되지 않으므로 `a && b` 가
//      `a &#038;&#038; b` 라는 문법 오류가 된다. wp:html 로도 못 막는다.
//      → JS 에 & 가 있으면 base64 로 실어 보낸다. base64 알파벳엔 & < > 가 없어 어떤 필터도 못 건드린다.
//        간접 eval `(0,eval)` 이라 함수들이 전역에 정의된다(본문의 onclick="calc()" 인라인 핸들러가 이걸 요구).

const WP_HTML_OPEN = '<!-- wp:html -->';
const WP_HTML_CLOSE = '<!-- /wp:html -->';

function scriptTag(js) {
  if (!js.includes('&')) return `<script>\n${js}\n</script>`;
  const b64 = Buffer.from(js, 'utf8').toString('base64');
  return `<script>(0,eval)(new TextDecoder().decode(Uint8Array.from(atob("${b64}"),c=>c.charCodeAt(0))))</script>`;
}

function buildContent({ body, css, js, ld }) {
  const parts = [];
  parts.push(css ? `<style>${HIDE_THEME_TITLE}\n${css}</style>` : `<style>${HIDE_THEME_TITLE}</style>`);
  parts.push(body);
  for (const x of ld) parts.push(`<script type="application/ld+json">${x}</script>`);
  if (js) parts.push(scriptTag(js));
  return `${WP_HTML_OPEN}\n${parts.join('\n')}\n${WP_HTML_CLOSE}`;
}

// index.astro 의 tools 배열 → 카드 그리드. 계산기들이 쓰는 색 토큰을 여기서도 자체 정의해
// 테마와 무관하게 같은 톤을 유지한다.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseToolList(src) {
  const block = between(src, 'const tools = [', '];');
  const out = [];
  for (const line of block.split('\n')) {
    const g = (k) => (line.match(new RegExp(`${k}:\\s*'((?:[^'\\\\]|\\\\.)*)'`)) || [])[1];
    const slug = g('slug');
    if (!slug) continue;
    out.push({ slug, emoji: g('emoji') || '🔧', cat: g('cat') || '', title: g('title') || slug, desc: g('desc') || '', tag: g('tag') || '' });
  }
  return out;
}

const INDEX_CSS = `.entry-hero,.page-hero-section{display:none!important}
.mgt{--mgt-line:#e5e7eb;--mgt-mut:#6b7280;--mgt-text:#111827;--mgt-accent:#4f46e5;--mgt-surface:#fff;--mgt-soft:#f9fafb;color:var(--mgt-text)}
.mgt-head{text-align:center;padding:8px 0 24px}
.mgt-head h1{font-size:1.9rem;font-weight:800;margin:0 0 10px}
.mgt-head .mgt-lead{color:var(--mgt-mut);margin:0;font-size:.98rem;line-height:1.6}
.mgt-cat{margin:26px 0 10px;font-size:.82rem;font-weight:800;letter-spacing:.02em;color:var(--mgt-mut)}
.mgt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.mgt-card{display:block;border:1px solid var(--mgt-line);border-radius:14px;padding:16px;background:var(--mgt-surface);text-decoration:none;color:inherit;transition:border-color .15s,transform .15s,box-shadow .15s}
.mgt-card,.mgt-card:hover,.mgt-card *{text-decoration:none!important}
.mgt-card:hover{border-color:var(--mgt-accent);transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.07)}
.mgt-top{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.mgt-emoji{font-size:1.35rem;line-height:1}
.mgt-title{font-weight:700;font-size:1rem}
.mgt-tag{margin-left:auto;font-size:.66rem;font-weight:800;padding:2px 7px;border-radius:999px;background:rgba(79,70,229,.1);color:var(--mgt-accent)}
.mgt-desc{display:block;font-size:.85rem;color:var(--mgt-mut);line-height:1.55;margin:0}
.mgt-soon{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.mgt-soon span{border:1px dashed var(--mgt-line);border-radius:12px;padding:12px 14px;color:var(--mgt-mut);font-size:.85rem;background:var(--mgt-soft)}
@media(prefers-color-scheme:dark){.mgt{--mgt-line:#374151;--mgt-mut:#9ca3af;--mgt-text:#f3f4f6;--mgt-surface:#1f2937;--mgt-soft:#111827}}`;

function buildIndex(src, title, desc) {
  const tools = parseToolList(src);
  const cats = [...new Set(tools.map((t) => t.cat))];
  const sections = cats
    .map((c) => {
      const cards = tools
        .filter((t) => t.cat === c)
        .map(
          (t) =>
            `<a class="mgt-card" href="/tools/${t.slug}/"><span class="mgt-top"><span class="mgt-emoji">${t.emoji}</span><span class="mgt-title">${esc(t.title)}</span>${t.tag ? `<span class="mgt-tag">${esc(t.tag)}</span>` : ''}</span><span class="mgt-desc">${esc(t.desc)}</span></a>`
        )
        .join('');
      return `<div class="mgt-cat">${esc(c)}</div><div class="mgt-grid">${cards}</div>`;
    })
    .join('');

  const soonBlock = between(src, 'const soon = [', '];');
  const soon = [...soonBlock.matchAll(/title:\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  const soonHtml = soon.length
    ? `<div class="mgt-cat">준비 중</div><div class="mgt-soon">${soon.map((s) => `<span>${esc(s)}</span>`).join('')}</div>`
    : '';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    itemListElement: tools.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.title,
      url: `https://mungge.com/tools/${t.slug}/`,
    })),
  };

  // wpautop 이 <a> 안의 <p> 를 쪼개 카드가 두 조각으로 갈라졌다 → wp:html 로 감싸고 <a> 안엔 <span> 만 쓴다
  return [
    WP_HTML_OPEN,
    `<style>${INDEX_CSS}</style>`,
    `<div class="mgt"><div class="mgt-head"><h1>${esc(title)}</h1><div class="mgt-lead">${esc(desc)}</div></div>${sections}${soonHtml}</div>`,
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    WP_HTML_CLOSE,
  ].join('\n');
}

// ── 발행 ────────────────────────────────────────────────────
async function upsert({ slug, title, description, content, parent }) {
  const found = await wp(`pages?slug=${encodeURIComponent(slug)}&status=publish,draft,pending,private&context=edit`);
  // Kadence 가 <h1 class="entry-title"> 를 따로 렌더해 계산기 자체 h1 과 H1 이 2개가 된다.
  // CSS 로 숨기면 DOM 에는 남아 여전히 중복이므로, 테마 메타로 제목 출력 자체를 끈다.
  // (값은 'hide' 만 동작 — disable/false/0 은 저장은 되지만 제목이 그대로 나온다)
  const payload = { title, slug, content, status: STATUS, excerpt: description, meta: { _kad_post_title: 'hide' } };
  if (parent) payload.parent = parent;

  if (found.length) {
    const p = await wp(`pages/${found[0].id}`, { method: 'POST', body: JSON.stringify(payload) });
    return { id: p.id, link: p.link, action: '갱신' };
  }
  const p = await wp('pages', { method: 'POST', body: JSON.stringify(payload) });
  return { id: p.id, link: p.link, action: '생성' };
}

(async () => {
  const dir = path.join(LF, 'src/pages/tools');
  let slugs = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.astro') && f !== 'index.astro')
    .map((f) => f.replace(/\.astro$/, ''));
  if (ONLY) slugs = slugs.filter((s) => s === ONLY);
  if (!slugs.length) {
    console.error(ONLY ? `대상 없음: ${ONLY}` : '대상 없음');
    process.exit(1);
  }

  if (LIST) {
    console.log(`대상 ${slugs.length}개 (부모 tools 제외)`);
    for (const s of slugs) {
      try {
        const e = extract(s);
        console.log(`  ${s.padEnd(34)} 본문 ${String(e.body.length).padStart(5)}B  CSS ${String(e.css.length).padStart(5)}B  JS ${String(e.js.length).padStart(5)}B  LD ${e.ld.length}`);
      } catch (err) {
        console.log(`  ${s.padEnd(34)} ❌ ${err.message}`);
      }
    }
    return;
  }

  // 부모 페이지 — index.astro 는 계산기들과 달리 **스코프드** <style> 을 쓴다. 빌드하면 astro-XXXX
  // 해시 클래스 + 번들 CSS 로 흩어져서 그대로 옮기면 BaseLayout 전역 CSS 까지 딸려와 테마와 충돌한다.
  // 목록 데이터만 뽑아 카드 그리드를 새로 생성한다.
  const idxSrc = fs.readFileSync(path.join(dir, 'index.astro'), 'utf8');
  const idxTitle = (idxSrc.match(/^const title\s*=\s*['"`](.+?)['"`]/m) || [])[1] || '도구 모음';
  const idxDesc = (idxSrc.match(/^const description\s*=\s*['"`](.+?)['"`]/m) || [])[1] || '';
  const parent = await upsert({
    slug: 'tools',
    title: idxTitle,
    description: idxDesc,
    content: buildIndex(idxSrc, idxTitle, idxDesc),
  });
  console.log(`부모 [${parent.action}] #${parent.id}  ${parent.link}`);

  let ok = 0;
  let fail = 0;
  for (const slug of slugs) {
    try {
      const e = extract(slug);
      const r = await upsert({
        slug,
        title: e.title,
        description: e.description,
        content: buildContent(e),
        parent: parent.id,
      });
      console.log(`  [${r.action}] ${slug.padEnd(34)} ${r.link}`);
      ok++;
    } catch (err) {
      console.log(`  [실패] ${slug.padEnd(34)} ${err.message}`);
      fail++;
    }
    await new Promise((r) => setTimeout(r, 400)); // WP 부하 완화
  }
  console.log(`\n완료: 성공 ${ok} / 실패 ${fail} (status=${STATUS})`);
})().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
