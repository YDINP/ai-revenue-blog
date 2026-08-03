// mungge footer 위젯(custom_html-2)의 script 블록에 이 레포의 JS 조각들을 주입/갱신한다.
//
// 라이브 SSOT 는 위젯이다 — 통째로 덮어쓰면 80KB CSS 와 기존 위젯 JS(복사버튼·앵커·TOC·
// FAQ·뉴스레터)가 날아간다. 그래서 블록마다 마커를 두고 그 사이만 교체한다.
//
//   node scripts/inject-wp-js.mjs                     # 전체 블록 주입/갱신
//   node scripts/inject-wp-js.mjs --only MG-TRACK     # 특정 블록만
//   node scripts/inject-wp-js.mjs --dry-run           # PUT 없이 결과만
//   node scripts/inject-wp-js.mjs --backup <path>     # 기존 위젯 원문 저장
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

// 주입 순서 = 실행 순서. 추적기를 먼저 둬서 뒤 블록이 죽어도 방문 집계는 남게 한다.
// 다크모드는 추적 다음, 나머지보다 앞 — 화면 색을 바꾸는 블록이라 늦을수록 깜빡임이 길다.
const BLOCKS = [
  { marker: 'MG-TRACK', file: 'wp-track.js', desc: '방문 추적(analytics pageview)' },
  // 방문 추적 바로 뒤 — 클릭 리스너 하나뿐이라 가볍고, 뒤 블록이 죽어도 제휴 성과는 남는다
  { marker: 'MG-AFF', file: 'wp-affiliate.js', desc: '쿠팡·페이퍼닥 클릭 추적(coupang_click / paperdoc_click)' },
  { marker: 'MG-DARK', file: 'wp-darkmode.js', desc: '경량 다크모드(WP Dark Mode 플러그인 대체)' },
  { marker: 'MG-LIKE', file: 'wp-like.js', desc: '글 하단 추천 버튼' },
  { marker: 'MG-STH', file: 'wp-scroll-highlight.js', desc: '본문 강조(strong) 스크롤 형광펜' },
  { marker: 'MG-CHARTANIM', file: 'wp-chart-anim.js', desc: '차트 바 스크롤 진입 시 채움' },
  // MG-LIKE 뒤에 와야 한다 — 추천 캡션(.mg-like-cap)을 기준으로 삽입 위치를 잡는다
  { marker: 'MG-ADEND', file: 'wp-ad-postend.js', desc: '글 하단 추천 버튼 아래 애드핏 300x250(데스크톱)' },
  { marker: 'MG-ADMID', file: 'wp-ad-inarticle.js', desc: '본문 한가운데 h2 앞 애드핏 300x250' },
  // 위젯 JS 는 script 하나라 이 블록도 ba.min.js(async) 실행 전에 돈다 → 빈 ins 를 옮겨도 안전
  { marker: 'MG-ADRAIL', file: 'wp-ad-rail.js', desc: '모바일 홈 레일 광고를 피드 3번째 카드 뒤로 이동' },
  // 광고 블록들 **뒤**에 와야 한다 — ADEND/ADMID/ADRAIL 이 삽입·이동을 끝낸 뒤의
  // 최종 슬롯 목록을 관찰해야 한다. 앞에 두면 나중에 꽂힌 슬롯을 놓친다.
  { marker: 'MG-ADOBS', file: 'wp-ad-observe.js', desc: '애드핏 노출/미노출 계측(adfit_slot 이벤트) — 재시도는 안 함' },
];

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
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const backupAt = argv.includes('--backup') ? argv[argv.indexOf('--backup') + 1] : null;

const env = loadEnv(ENV_PATH);
const base = String(env.WP_URL || '').replace(/\/$/, '');
const auth = 'Basic ' + Buffer.from(`${env.WP_USER}:${env.WP_APP_PASS}`).toString('base64');
const api = `${base}/wp-json/wp/v2/widgets/${WIDGET_ID}`;

const res = await fetch(`${api}?context=edit`, { headers: { Authorization: auth } });
if (!res.ok) throw new Error(`위젯 조회 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
const widget = await res.json();
const before = widget.instance?.raw?.content || '';
if (!before) throw new Error('위젯 내용이 비어 있음 — 덮어쓰면 CSS가 날아가므로 중단');
if (backupAt) { fs.writeFileSync(backupAt, before); console.log(`백업: ${backupAt} (${before.length}자)`); }

let content = before;
for (const b of BLOCKS) {
  if (only && only !== b.marker) continue;
  const BEGIN = `/* ==== ${b.marker}:BEGIN (scripts/${b.file} — 자동 주입, 직접 수정 금지) ==== */`;
  const END = `/* ==== ${b.marker}:END ==== */`;
  const body = fs.readFileSync(path.join(HERE, b.file), 'utf8').trim();
  const block = `${BEGIN}\n${body}\n${END}`;

  const i = content.indexOf(BEGIN);
  if (i !== -1) {
    const e = content.indexOf(END, i);
    if (e === -1) throw new Error(`${b.marker}: BEGIN 은 있는데 END 가 없음 — 위젯 손상 의심, 중단`);
    content = content.slice(0, i) + block + content.slice(e + END.length);
    console.log(`교체  ${b.marker}  (${b.desc})`);
  } else {
    // 마지막 </script> 바로 앞 — 위젯 JS 는 script 하나로 끝난다
    const close = content.lastIndexOf('</' + 'script>');
    if (close === -1) throw new Error('위젯에서 script 닫는 태그를 못 찾음');
    content = content.slice(0, close) + '\n' + block + '\n' + content.slice(close);
    console.log(`삽입  ${b.marker}  (${b.desc})`);
  }
}

console.log(`${before.length}자 → ${content.length}자`);
if (content === before) { console.log('변경 없음 — PUT 생략'); process.exit(0); }
if (dryRun) { console.log('--dry-run: PUT 생략'); process.exit(0); }

const put = await fetch(api, {
  method: 'PUT',
  headers: { Authorization: auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ instance: { ...widget.instance, raw: { ...widget.instance.raw, content } } }),
});
if (!put.ok) throw new Error(`위젯 저장 실패 ${put.status}: ${(await put.text()).slice(0, 300)}`);
const saved = (await put.json()).instance?.raw?.content || '';
const missing = BLOCKS.filter((b) => !only || only === b.marker).filter((b) => !saved.includes(`${b.marker}:BEGIN`));
console.log(missing.length ? `⚠️ 저장됐지만 누락: ${missing.map((b) => b.marker).join(', ')}` : `저장 완료 (${saved.length}자)`);
