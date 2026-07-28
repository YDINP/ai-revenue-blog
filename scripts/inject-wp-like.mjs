// scripts/wp-like.js 를 mungge footer 위젯(custom_html-2)의 <script> 안에 주입/갱신한다.
//
// 라이브 SSOT 는 위젯이다 — 위젯 내용을 통째로 덮어쓰면 80KB CSS 와 기존 위젯 JS
// (복사버튼·앵커·TOC·FAQ·뉴스레터)가 날아간다. 그래서 마커 사이만 교체한다.
//
//   node scripts/inject-wp-like.mjs            # 주입/갱신
//   node scripts/inject-wp-like.mjs --dry-run  # 결과만 확인(PUT 안 함)
//   node scripts/inject-wp-like.mjs --backup <path>   # 기존 위젯 원문 저장
//
// 자격증명: ../automation/.env 의 WP_URL / WP_USER / WP_APP_PASS
// (값에 공백이 있어 `. .env` 소싱이 깨지므로 직접 파싱한다)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ENV_PATH = path.resolve(ROOT, '..', 'automation', '.env');
const WIDGET_ID = 'custom_html-2';
const BEGIN = '/* ==== MG-LIKE:BEGIN (scripts/wp-like.js — 자동 주입, 직접 수정 금지) ==== */';
const END = '/* ==== MG-LIKE:END ==== */';

function loadEnv(p) {
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const backupAt = argv.includes('--backup') ? argv[argv.indexOf('--backup') + 1] : null;

const env = loadEnv(ENV_PATH);
const base = String(env.WP_URL || '').replace(/\/$/, '');
const auth = 'Basic ' + Buffer.from(`${env.WP_USER}:${env.WP_APP_PASS}`).toString('base64');
const api = `${base}/wp-json/wp/v2/widgets/${WIDGET_ID}`;

const res = await fetch(`${api}?context=edit`, { headers: { Authorization: auth } });
if (!res.ok) throw new Error(`위젯 조회 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
const widget = await res.json();
const current = widget.instance?.raw?.content || '';
if (!current) throw new Error('위젯 내용이 비어 있음 — 덮어쓰면 CSS가 날아가므로 중단');
if (backupAt) { fs.writeFileSync(backupAt, current); console.log(`백업: ${backupAt} (${current.length}자)`); }

const block = `${BEGIN}\n${fs.readFileSync(path.join(HERE, 'wp-like.js'), 'utf8').trim()}\n${END}`;

let next;
const b = current.indexOf(BEGIN);
if (b !== -1) {
  const e = current.indexOf(END, b);
  if (e === -1) throw new Error('BEGIN 은 있는데 END 가 없음 — 위젯이 손상됐을 수 있어 중단');
  next = current.slice(0, b) + block + current.slice(e + END.length);
  console.log('기존 블록 교체');
} else {
  // 마지막 </script> 바로 앞에 넣는다 — 위젯 JS 는 <script> 하나로 끝난다
  const close = current.lastIndexOf('</script>');
  if (close === -1) throw new Error('위젯에 </script> 가 없음 — 삽입 위치를 못 찾음');
  next = current.slice(0, close) + '\n' + block + '\n' + current.slice(close);
  console.log('신규 블록 삽입');
}

console.log(`${current.length}자 → ${next.length}자`);
if (dryRun) { console.log('--dry-run: PUT 생략'); process.exit(0); }

const put = await fetch(api, {
  method: 'PUT',
  headers: { Authorization: auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ instance: { ...widget.instance, raw: { ...widget.instance.raw, content: next } } }),
});
if (!put.ok) throw new Error(`위젯 저장 실패 ${put.status}: ${(await put.text()).slice(0, 300)}`);
const saved = (await put.json()).instance?.raw?.content || '';
console.log(saved.includes(BEGIN) ? `저장 완료 (${saved.length}자)` : '⚠️ 저장은 됐는데 마커가 없음 — 확인 필요');
