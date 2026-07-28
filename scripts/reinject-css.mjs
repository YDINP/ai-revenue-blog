// mungge footer 위젯(custom_html-2)의 <style id="mg-chart-css"> 안쪽만 로컬 CSS 로 교체한다.
//
// 라이브 CSS 의 SSOT 는 테마도 Code Snippets 도 아니라 이 위젯이다. 위젯 안에는 CSS 말고도
// 앵커 광고 마크업과 프론트 JS 블록이 같이 들어 있어서, 통째로 PUT 하면 그것들이 날아간다.
// 그래서 style 여는 태그 ~ 첫 </style> 사이만 잘라 끼운다.
//
//   node scripts/reinject-css.mjs              # 백업 후 교체
//   node scripts/reinject-css.mjs --dry-run    # PUT 없이 크기/차이만 확인
//
// 자격증명: ../automation/.env 의 WP_URL / WP_USER / WP_APP_PASS
// (값에 공백이 있어 `. .env` 소싱이 깨지므로 직접 파싱한다)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ENV_PATH = path.resolve(ROOT, '..', 'automation', '.env');
const CSS_PATH = path.join(HERE, 'wp-chart-css.css');
const WIDGET_ID = 'custom_html-2';
const OPEN_RE = /<style id="mg-chart-css"[^>]*>/;

const dryRun = process.argv.includes('--dry-run');

function loadEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv(ENV_PATH);
const base = String(env.WP_URL || '').replace(/\/$/, '');
const auth = 'Basic ' + Buffer.from(`${env.WP_USER}:${env.WP_APP_PASS}`).toString('base64');
const api = `${base}/wp-json/wp/v2/widgets/${WIDGET_ID}`;

const res = await fetch(`${api}?context=edit`, { headers: { Authorization: auth } });
if (!res.ok) throw new Error(`위젯 조회 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
const widget = await res.json();
const before = widget.instance?.raw?.content || '';
if (!before) throw new Error('위젯 내용이 비어 있음 — 덮어쓰면 전부 날아가므로 중단');

const open = before.match(OPEN_RE);
if (!open) throw new Error('<style id="mg-chart-css"> 를 못 찾음 — 중단');
const start = open.index + open[0].length;
const end = before.indexOf('</style>', start);
if (end === -1) throw new Error('style 닫는 태그를 못 찾음 — 위젯 손상 의심, 중단');

const liveCss = before.slice(start, end);
const localCss = fs.readFileSync(CSS_PATH, 'utf8');
if (liveCss.trim() === localCss.trim()) {
  console.log('라이브 CSS 와 로컬 파일이 동일 — 할 일 없음');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13);
const backupAt = path.join(ROOT, '.tmp', `widget-backup-${stamp}.html`);
fs.mkdirSync(path.dirname(backupAt), { recursive: true });
fs.writeFileSync(backupAt, before);
console.log(`백업: ${backupAt} (${before.length}자)`);

const after = before.slice(0, start) + '\n' + localCss.trim() + '\n' + before.slice(end);
console.log(`CSS ${liveCss.length}자 → ${localCss.length}자 / 위젯 ${before.length}자 → ${after.length}자`);

if (dryRun) { console.log('--dry-run: PUT 생략'); process.exit(0); }

const put = await fetch(api, {
  method: 'PUT',
  headers: { Authorization: auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...widget, instance: { ...widget.instance, raw: { ...widget.instance.raw, content: after } } }),
});
if (!put.ok) throw new Error(`위젯 저장 실패 ${put.status}: ${(await put.text()).slice(0, 300)}`);
console.log('위젯 저장 완료');
