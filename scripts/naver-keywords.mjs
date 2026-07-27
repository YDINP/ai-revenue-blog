#!/usr/bin/env node
// 네이버 검색광고 키워드도구 API — 월간 검색량 조회 CLI (블랙키위 무료데이터의 원본 소스)
//
// 사용법:
//   node scripts/naver-keywords.mjs "게이밍 노트북 추천" "기계식 키보드" ...
//   node scripts/naver-keywords.mjs --related "챗GPT"      # 연관키워드까지 넓게
//   node scripts/naver-keywords.mjs --json "키워드"         # JSON 출력
//
// 자격증명: .env.local 의 NAVER_AD_API_KEY / NAVER_AD_SECRET_KEY / NAVER_AD_CUSTOMER_ID
// (검색광고 계정 searchad.naver.com → 도구 → API 사용 관리 에서 발급)
//
// 반환: 힌트 키워드 + 연관 키워드의 PC/모바일/합계 월검색량 + 경쟁정도.
// 힌트키워드는 공백 제거해서 보냄(네이버 규격). "< 10"은 극소량(≈5로 환산 표기).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// .env.local 로드(레포 루트) — dotenv 의존성 없이 직접 파싱
function loadEnv() {
  const p = path.join(__dir, '..', '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadEnv();

const API_KEY = process.env.NAVER_AD_API_KEY;
const SECRET = process.env.NAVER_AD_SECRET_KEY;
const CUSTOMER = process.env.NAVER_AD_CUSTOMER_ID;
if (!API_KEY || !SECRET || !CUSTOMER) {
  console.error('❌ .env.local 에 NAVER_AD_API_KEY / NAVER_AD_SECRET_KEY / NAVER_AD_CUSTOMER_ID 필요');
  process.exit(1);
}

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const wide = args.includes('--related');
const keywords = args.filter((a) => !a.startsWith('--'));
if (!keywords.length) {
  console.error('사용법: node scripts/naver-keywords.mjs "키워드1" "키워드2" ... [--related] [--json]');
  process.exit(1);
}

// 네이버 규격: 힌트키워드는 공백 제거, 최대 5개.
// ⚠️ 공백만 지우면 부족하다. 한글·영숫자 외 문자가 하나라도 남으면 API가 요청 전체를
//    400(code 11001 "hintKeywords 파라미터가 유효하지 않습니다")으로 거절한다.
//    실제 사례: "METAL GEAR SOLID Δ: SNAKE EATER"의 Δ와 콜론 때문에 같은 배치의
//    멀쩡한 키워드까지 검색량 0으로 떨어졌다.
const normalizeHint = (k) => String(k).replace(/[^0-9A-Za-z가-힣]/g, '');
// 원본→정규화 대응을 남긴다. 응답의 keyword는 정규화형이라 호출자가 원본으로 못 찾는다.
const hintPairs = keywords.map((k) => ({ raw: k, hint: normalizeHint(k) })).filter((p) => p.hint).slice(0, 5);
const hints = hintPairs.map((p) => p.hint);
if (!hints.length) {
  if (jsonOut) console.log('[]'); else console.error('유효한 키워드 없음(정규화 후 빈 문자열)');
  process.exit(0);
}

function sign(ts, method, uri) {
  return crypto.createHmac('sha256', SECRET).update(`${ts}.${method}.${uri}`).digest('base64');
}

const num = (x) => (x === '< 10' ? 5 : Number(x) || 0);
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

async function main() {
  const ts = Date.now().toString();
  const uri = '/keywordstool';
  const url = `https://api.naver.com${uri}?hintKeywords=${encodeURIComponent(hints.join(','))}&showDetail=1`;
  const res = await fetch(url, {
    headers: {
      'X-Timestamp': ts,
      'X-API-KEY': API_KEY,
      'X-Customer': CUSTOMER,
      'X-Signature': sign(ts, 'GET', uri),
    },
  });
  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}`, (await res.text()).slice(0, 300));
    process.exit(1);
  }
  const data = await res.json();
  let list = (data.keywordList || []).map((k) => ({
    keyword: k.relKeyword,
    pc: num(k.monthlyPcQcCnt),
    mobile: num(k.monthlyMobileQcCnt),
    total: num(k.monthlyPcQcCnt) + num(k.monthlyMobileQcCnt),
    comp: k.compIdx,
  }));

  // 기본: 내가 물어본 힌트 키워드만. --related: 연관까지 전부(검색량순).
  const hintSet = new Set(hints.map((h) => h.toLowerCase()));
  if (!wide) list = list.filter((r) => hintSet.has(String(r.keyword).toLowerCase()));
  // 정규화 때문에 응답 keyword가 원본과 달라지므로 원본 표기를 함께 실어준다.
  const rawOf = new Map(hintPairs.map((p) => [p.hint.toLowerCase(), p.raw]));
  list = list.map((r) => ({ ...r, input: rawOf.get(String(r.keyword).toLowerCase()) ?? r.keyword }));
  list.sort((a, b) => b.total - a.total);
  if (wide) list = list.slice(0, 40);

  if (jsonOut) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  if (!list.length) {
    console.log('결과 없음 (연관 키워드까지 보려면 --related)');
    return;
  }
  const w = Math.max(...list.map((r) => [...r.keyword].length), 8);
  const pad = (s, n) => { const len = [...String(s)].length; return String(s) + ' '.repeat(Math.max(0, n - len)); };
  console.log(pad('키워드', w) + '  ' + pad('PC', 8) + pad('모바일', 9) + pad('합계', 10) + '경쟁도');
  console.log('─'.repeat(w + 38));
  for (const r of list) {
    console.log(pad(r.keyword, w) + '  ' + pad(fmt(r.pc), 8) + pad(fmt(r.mobile), 9) + pad(fmt(r.total), 10) + (r.comp || ''));
  }
  console.log('\n💡 합계 = PC+모바일 월간 검색수. "5" 는 실제 <10(극소량). 네이버 발행은 합계 500+ 권장.');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
