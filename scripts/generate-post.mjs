#!/usr/bin/env node

/**
 * Daily Blog Post Auto-Generator
 *
 * 매일 자동으로 블로그 포스트를 생성하는 스크립트.
 * GitHub Actions에서 실행되며, Claude Haiku API로 콘텐츠를 생성하고
 * Pexels에서 히어로 이미지를 가져오고, Supabase에 등록합니다.
 *
 * 필요한 환경변수:
 *   ANTHROPIC_API_KEY - Claude API 키 (필수)
 *   PEXELS_API_KEY    - Pexels API 키 (선택)
 *   SUPABASE_URL      - Supabase 프로젝트 URL (선택)
 *   SUPABASE_ANON_KEY - Supabase anon key (선택)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { autoPublishToWP } from "./wp-autopublish.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

// ─── Config ───────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// 게이트웨이 호환: ANTHROPIC_BASE_URL/BLOG_CLAUDE_MODEL 있으면 우선(로컬), 없으면 공식 API(GH Actions)
const CLAUDE_MODEL = process.env.BLOG_CLAUDE_MODEL || "claude-haiku-4-5-20251001";
const CLAUDE_API_URL = `${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`;
const PEXELS_API_URL = "https://api.pexels.com/v1/search";

// 글 생성 LLM 호출 경로.
// 기본은 Claude Code CLI(사용자 구독 세션) — 게이트웨이 크레딧 소진(403)이나
// 장시간 요청 504를 타지 않는다. CLI를 못 쓰면 기존 HTTP 경로로 폴백하고,
// BLOG_LLM=http 면 처음부터 HTTP를 쓴다(GitHub Actions 등 CLI 없는 환경).
async function callLLM(prompt) {
  if (process.env.BLOG_LLM !== "http") {
    try {
      const cli = await import("../../automation/llm-cli.mjs");
      if (cli.claudeCliAvailable()) {
        console.log("[LLM] Claude Code CLI");
        return await cli.callClaudeCli(prompt, { model: process.env.BLOG_CLAUDE_CLI_MODEL || "" });
      }
      console.warn("[LLM] CLI 없음 → HTTP 폴백");
    } catch (e) {
      console.warn(`[LLM] CLI 경로 실패(${e.message}) → HTTP 폴백`);
    }
  }

  console.log("[LLM] HTTP API");
  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      stream: true,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API ${response.status}: ${errorText}`);
  }
  return await readClaudeStream(response);
}

// SSE(stream:true) 응답에서 텍스트 델타만 이어붙여 반환.
// 왜 스트리밍인가: 본문 생성은 max_tokens 8192짜리 장시간 요청이라, 논스트리밍으로 보내면
// 게이트웨이(nginx)가 첫 바이트를 못 받고 504 Gateway Time-out을 낸다(2026-07-28 발행 실패).
async function readClaudeStream(response) {
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let stopReason = null;
  let sawStop = false;
  for await (const chunk of response.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let ev;
      try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.type === "content_block_delta" && ev.delta?.text) text += ev.delta.text;
      if (ev.type === "error") throw new Error(`Claude stream error: ${JSON.stringify(ev.error)}`);
      if (ev.type === "message_delta" && ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
      if (ev.type === "message_stop") sawStop = true;
    }
  }

  /* ⚠ 잘린 응답을 정상 반환값처럼 돌려주지 않는다. 2026-08-19 LF 글이 본문 1/3 지점에서
     끊긴 채 발행된 사고의 원인이 이 검증의 부재였다. */
  if (stopReason === "max_tokens") {
    throw new Error("Claude 응답이 max_tokens 로 잘렸습니다(본문 미완성) — 재시도 필요");
  }
  if (!sawStop) {
    throw new Error(`Claude 스트림이 정상 종료되지 않음(message_stop 없음, 수신 ${text.length}자) — 중간에 끊긴 응답이므로 폐기`);
  }
  if (!text.trim()) {
    throw new Error("Claude 응답이 비어 있습니다");
  }
  return text;
}

const AUTHOR = "TechFlow";
const CATEGORY_ORDER = ["AI", "Dev", "Review", "Game"];
const CHART_COLORS = ["#3b82f6", "#f59e0b", "#009e73", "#d55e00", "#8b5cf6"];

// ─── Helpers ──────────────────────────────────────────────────────────

function getToday() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function pickRandom(arr, count = 1) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return count === 1 ? shuffled[0] : shuffled.slice(0, count);
}

function selectCategory() {
  const dayOfMonth = new Date().getDate();
  const index = dayOfMonth % CATEGORY_ORDER.length;
  return CATEGORY_ORDER[index];
}

/**
 * 3개의 서로 다른 카테고리를 날짜 기반으로 선택
 * dayOfMonth를 기준으로 연속 3개 카테고리를 순환 선택
 */
function selectCategories(count = 3) {
  const dayOfMonth = new Date().getDate();
  const categories = [];
  for (let i = 0; i < count; i++) {
    const index = (dayOfMonth + i) % CATEGORY_ORDER.length;
    categories.push(CATEGORY_ORDER[index]);
  }
  return categories;
}

// ─── Data Loading ─────────────────────────────────────────────────────

function loadJSON(filename) {
  const filepath = join(__dirname, filename);
  if (!existsSync(filepath)) {
    console.error(`[ERROR] File not found: ${filepath}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(filepath, "utf-8"));
}

/**
 * 기존 블로그 포스트 제목+카테고리 목록을 읽어서 중복 방지에 활용
 */
function loadExistingPostTitles(category) {
  const blogDir = join(PROJECT_ROOT, "src", "blog");
  if (!existsSync(blogDir)) return [];

  const files = readdirSync(blogDir).filter(f => f.endsWith(".md"));
  const posts = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(blogDir, file), "utf-8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const fm = fmMatch[1];
      const titleMatch = fm.match(/^title:\s*"?(.+?)"?\s*$/m);
      const catMatch = fm.match(/^category:\s*"?(.+?)"?\s*$/m);
      if (!titleMatch) continue;

      const postCat = catMatch ? catMatch[1] : "";
      const postTitle = titleMatch[1];

      // 같은 카테고리 포스트는 항상 포함, 다른 카테고리도 최근 것만
      if (postCat === category) {
        posts.push(`[${postCat}] ${postTitle}`);
      }
    } catch { /* skip unreadable files */ }
  }

  return posts;
}

/**
 * 기존 블로그 포스트 슬러그 + 제목 목록 (내부 링크용)
 */
function loadExistingPostSlugs() {
  const blogDir = join(PROJECT_ROOT, "src", "blog");
  if (!existsSync(blogDir)) return [];
  const files = readdirSync(blogDir).filter(f => f.endsWith(".md"));
  const posts = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(blogDir, file), "utf-8");
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;
      const fm = fmMatch[1];
      const titleMatch = fm.match(/^title:\s*"?(.+?)"?\s*$/m);
      if (!titleMatch) continue;
      const slug = file.replace('.md', '');
      posts.push({ title: titleMatch[1], slug });
    } catch { /* skip */ }
  }
  return posts;
}

// ─── Claude API ───────────────────────────────────────────────────────

async function generatePostContent(categoryName, keyword, searchTerm, existingTitles, engaging = false, revenue = false, allPosts = []) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  // 동적 날짜 (프롬프트에서 사용)
  const now = new Date();
  const yyyy = now.getFullYear();
  const dateStr = `${yyyy}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // 오케스트레이터(automation/post-research.mjs)가 생성 직전에 모아 넘긴 근거.
  // 이게 없던 시절엔 모델이 자료 없이 인용해 가짜 통계·가짜 링크를 만들었다(2026-07-31 사고).
  // ⚠️ 뉴스 헤드라인 묶음은 링크가 news.google.com 리다이렉트라 **참고자료로 인용 불가**다.
  //    인용 가능한 URL 은 INPUT_SOURCES 로 따로 넘어온 것뿐이다.
  const evidenceRaw = (process.env.INPUT_EVIDENCE || '').trim();
  let citableSources = [];
  try { citableSources = JSON.parse(process.env.INPUT_SOURCES || '[]'); } catch { citableSources = []; }

  const evidenceInstruction = evidenceRaw ? `
━━━ 근거 자료(이 글을 쓰기 직전에 수집한 실제 자료) ━━━
${evidenceRaw}
━━━ 근거 자료 끝 ━━━

⛔ **근거 사용 규칙(최우선)**:
- 본문의 **모든 수치·날짜·고유명사는 위 근거 자료에 있는 것만** 쓰세요. 근거에 없으면 쓰지 마세요.
  기억에 있는 값이라도, 위 자료가 뒷받침하지 않으면 **그 문장을 빼는 쪽**을 택하세요.
- 근거가 서로 어긋나면(예: 매체마다 종료 시점이 다름) **단정하지 말고 양쪽을 병기**하고
  "공식 공지 확인 필요"라고 밝히세요. 하나를 골라 단정하는 것이 가장 큰 사고입니다.
- 근거의 모호한 표현을 구체적 숫자로 좁히지 마세요("여러 해"→"평균 5년" 금지).
- **매체명도 근거에 있는 것만** 쓰세요. 위 헤드라인 목록에 없는 매체("연합뉴스가 보도했다" 등)를
  끌어오지 마세요 — 있을 법한 매체를 적는 것도 날조입니다. 헤드라인에 적힌 매체·보도일 그대로만 인용하세요.
- ⛔ **주제 이탈 금지.** 근거 묶음에는 뉴스 수집이 넓게 훑는 탓에 이 글의 주제와 무관한
  헤드라인이 섞여 들어옵니다. 무관한 항목은 근거에 있더라도 **쓰지 마세요.**
  한 글은 한 주제만 다룹니다. 분량이 모자라면 주제를 더 깊게 파세요.
- ⛔ **잡다한 제도·행사·마감을 모아 붙이는 섹션을 만들지 마세요.** "이번 주 같이 챙길 것",
  "~하는 김에 같이 챙기면 좋은 것" 같은 곁다리 묶음은 금지입니다. 실제로 이 형태에서
  근거 없는 날짜·금액이 반복해서 나왔습니다.
- ⛔ **헤드라인만 있고 본문이 없는 항목으로 단정하지 마세요.** 제목 한 줄만 확보된 건은
  지급일·수량·마감일·요금을 확정 서술할 근거가 되지 못합니다. 그런 항목은 아예 빼세요.
- 근거에서 **추론한 것**을 사실처럼 쓰지 마세요. 두 날짜가 겹친다고 "병행 사용 가능"이라고
  단정하는 식은 금지입니다. 추론이면 "~로 보인다", "공식 안내 확인 필요"로 명확히 낮추세요.
${citableSources.length ? `- "## 참고 자료" 섹션에는 **아래 URL만** 쓰세요. 목록에 없는 URL을 지어내지 마세요.
${citableSources.map((s) => `  - [${s.title}](${s.url})`).join('\n')}` : `- 인용 가능한 URL이 확보되지 않았습니다. **URL을 지어내지 마세요.**
  "## 참고 자료" 섹션에는 링크 대신 근거로 삼은 **매체명과 보도일**을 텍스트로 적으세요
  (예: "- 동아일보 2026-07-30 보도"). 없는 링크를 만드는 것보다 링크가 없는 편이 낫습니다.`}
` : `
⚠️ 이번 글은 수집된 근거 자료가 없습니다. 확실하지 않은 수치·날짜는 아예 쓰지 말고,
   차트는 만들지 마세요. 출처 URL을 지어내는 것은 절대 금지입니다.
`;

  const chartInstruction = `
시각자료 배치 규칙(필수):

⛔⛔ **최우선 규칙 — 차트 수치의 출처**: 차트에 넣는 모든 숫자는 아래 셋을 **전부** 만족해야 합니다.
  (1) 본문에 그 숫자가 출처와 함께 서술돼 있을 것 — 차트에만 등장하는 숫자는 금지입니다.
  (2) 그 출처가 이 글의 "참고 자료" 목록에 **구체적 링크**로 들어 있을 것
      (기관 홈페이지 링크는 출처가 아닙니다. 그 수치가 실제로 실린 보고서·조항·설문 페이지여야 합니다.)
  (3) 제공된 근거 자료에 실제로 있는 값일 것 — 근거의 모호한 표현을 구체적 숫자로 좁히지 마세요.
      (실제 사고: 원문 "multiple years"를 "평균 5년 이상"으로, 비율 조각을 임의 분해해 도넛에 채움)
  하나라도 못 채우면 **그 차트는 만들지 마세요.**

- 차트는 **최대 4~6개까지** 넣을 수 있습니다. 이것은 **상한이지 할당량이 아닙니다** —
  출처 있는 수치가 2개 섹션에만 있으면 차트도 2개입니다. 개수를 채우려고 숫자를 만들지 마세요.
  (도입부·마무리/FAQ 섹션은 제외)
- **유형을 반드시 분산**: 한 글에서 같은 유형은 **최대 2개까지**, 서로 다른 유형을 **3종 이상** 쓰세요.
  단, 위 출처 규칙이 항상 우선입니다 — 유형을 분산하려고 없는 데이터를 만들지 마세요.
  (유형 분산은 차트가 3개 이상일 때만 적용되는 규칙입니다.)
- ⛔ **데이터가 없으면 차트를 만들지 마세요.** 근거가 없는 섹션은 표·목록·문장으로 대체하세요.
  (실제 사고: 체크리스트 섹션에 없는 값 95를 만들고 단위를 "필수"로 붙여 "95필수"가 렌더됨)
- 계산으로 만든 파생 수치(환급액·손익분기·연 환산 등)를 차트에 넣을 때는, 그 계산의 **입력값이
  위 출처 규칙을 통과한 것**이어야 하고 본문에 계산 근거를 밝히세요. 미검증 요율에서 뽑은
  금액 차트는 요율이 틀리면 통째로 틀립니다.

아래 5가지 차트 유형 중 각 섹션의 데이터 성격에 맞는 것을 고르세요:

1) chart-bar (막대 차트) - 항목별 수치 비교. 라벨 짧으면 data-orient="vertical"(세로), 핵심 하나 강조는 data-highlight="max":
<div class="chart-bar" data-orient="vertical" data-title="A 엔진이 빌드 속도 40% 빠르다" data-labels="A,B,C" data-values="90,72,64" data-colors="#3b82f6,#f59e0b,#009e73" data-unit="점"></div>

2) chart-radar (카드형 점수 비교) - 제품/서비스 다항목 평가:
<div class="chart-radar" data-title="종합 비교" data-items='[{"name":"제품A","scores":[{"label":"성능","value":9,"color":"#009e73"},{"label":"가격","value":7,"color":"#3b82f6"}]},{"name":"제품B","scores":[{"label":"성능","value":8,"color":"#f59e0b"},{"label":"가격","value":9,"color":"#d55e00"}]}]'></div>

3) chart-donut (도넛 차트) - 비율/점유율/구성비 시각화:
<div class="chart-donut" data-title="시장 점유율" data-labels="항목1,항목2,항목3" data-values="60,25,15" data-colors="#3b82f6,#009e73,#f59e0b" data-unit="%"></div>

4) chart-versus (VS 비교) - 두 대상 1:1 대결 비교:
<div class="chart-versus" data-title="A vs B" data-name-a="제품A" data-name-b="제품B" data-color-a="#3b82f6" data-color-b="#009e73" data-items='[{"label":"성능","a":85,"b":90},{"label":"가격","a":70,"b":80}]'></div>

5) chart-progress (원형 게이지) - 개별 점수/달성률:
<div class="chart-progress" data-title="평가 점수" data-labels="항목1,항목2,항목3" data-values="85,72,90" data-colors="#009e73,#3b82f6,#f59e0b" data-max="100" data-unit="점"></div>

선택 가이드: 비율/점유율→donut, 1:1 대결→versus, 개별 평점·달성률→progress, 수치 비교→bar, 다항목 제품 평가→radar.
섹션 역할별 권장 배치(예): 시장/현황 섹션→donut, 제품·요금제 비교 섹션→versus 또는 radar,
성능·비용 수치 섹션→bar, 체크리스트·단계별 달성 섹션→progress(단, 실제 점수 데이터가 있을 때만).

주의:
- div 안에 자식 요소를 넣지 마세요.
- **항목은 반드시 2개 이상(권장 3~5개).** 1항목 차트는 비교 정보가 0이라 자리만 차지합니다.
- data-labels는 쉼표로 구분한 하나의 문자열입니다. \`data-labels="A","B"\`처럼 항목마다
  따옴표를 씌우면 첫 항목만 인식됩니다. 반드시 \`data-labels="A,B,C"\` 형식으로.
- data-labels 개수와 data-values 개수가 정확히 일치해야 합니다.
- data-unit에는 실제 단위(%, 원, 만원, 점, 시간 등)만. "필수"·"권장" 같은 낱말을 넣으면
  값과 붙어 "95필수"처럼 렌더됩니다.
- 같은 제목의 차트를 두 번 넣지 마세요.

차트 공통 규칙(필수):
- 제목은 결론형: "A vs B 비교"가 아니라 "A가 B보다 40% 빠르다"처럼 결론이 한눈에 읽히게.
- 색은 색맹 안전 팔레트만: #3b82f6·#f59e0b·#009e73·#d55e00·#8b5cf6. ⚠️빨강(#ef4444)-초록(#10b981) 조합 절대 금지.
- 비교 막대는 라벨 짧으면(각 8자↓·2~6개) data-orient="vertical". 세로 막대 축은 0 기준(자르지 말 것).
- 핵심 하나 강조: chart-bar에 data-highlight="max"|"min"|인덱스(0부터) → 나머지 회색, 그 막대만 강조색.

**강조 포인트 — 콜아웃 박스 사용 금지**:
- 콜아웃 박스(callout-tip/warning/info)를 사용하지 마세요.
- 강조할 내용은 마크다운 **bold** 또는 > blockquote로 충분합니다.
- 본문에서 이미 설명한 내용을 별도 박스로 반복하는 것은 가독성을 해칩니다.
- 이 글에서 독자가 **단 한 줄만 가져간다면 그 문장**은 앞뒤를 등호 두 개로 감싸세요(예: ==핵심 문장==).
  발행 시 <mark> 로 바뀌어 스크롤 진입할 때 형광펜이 칠해집니다.
  ⚠ **글 전체에서 최대 2회**. 3회 이상 쓰면 강조가 아니라 배경이 되니 절대 넘기지 마세요.
  ⚠ 등호 바로 안쪽에 공백을 두지 마세요(== 문장 == 은 변환되지 않습니다).
  ⚠ 이미 **bold** 인 구간을 다시 등호로 감싸지 마세요. 둘 중 하나만 씁니다.`;

  // 기존 포스트 중복 방지 지시
  const dupeGuard = existingTitles && existingTitles.length > 0
    ? `\n**중복 방지**: 아래는 이미 발행된 같은 카테고리 포스트입니다. 이들과 겹치지 않는 새로운 각도/주제로 작성하세요:\n${existingTitles.map(t => `- ${t}`).join('\n')}\n`
    : '';

  // 독자 유입 극대화 모드: 호기심 자극 + 클릭 유도 스타일
  const engagingInstruction = engaging ? `
**독자 유입 극대화 스타일 (필수 적용)**:
- 제목: 호기심을 자극하되 정중한 표현 사용 ("혹시 알고 계셨나요?", "직접 비교해보았습니다", "이것만 알아두시면 됩니다", "의외의 차이점", "놓치기 쉬운 핵심 포인트")
- 제목에 숫자 활용 ("TOP 5", "3가지 핵심", "꼭 알아야 할 7가지")
- 첫 문단(도입부): 독자의 고민에 공감하는 존댓말로 시작 ("~하고 계신 분들 많으시죠?", "~이 궁금하셨던 분들께 도움이 될 것 같습니다")
- 중간중간 흥미 유발 문장 배치 ("여기서 주목할 점이 있습니다", "하지만 가장 중요한 부분은 따로 있었습니다")
- 비교 구도는 객관적 톤 유지 ("A와 B, 어떤 선택이 좋을까요?", "가성비를 따져보았습니다")
- 경험 공유 톤 ("직접 사용해본 결과", "저도 처음에는 몰랐는데요", "실제로 경험해보니")
- 결론부에 부드러운 행동 유도 ("한번 시도해보시는 건 어떨까요?", "참고하시면 도움이 되실 겁니다")
- 전체적으로 존댓말(~합니다, ~하세요, ~드립니다) 톤 유지
- 단, 허위/과장 금지 — 팩트 기반으로 친근하고 신뢰감 있게 작성
` : '';

  // 수익 극대화 모드: 자연스러운 상품 추천 + 구매 유도
  const revenueInstruction = revenue ? `
**수익 극대화 모드 (필수 적용)**:
- 본문 중간에 자연스럽게 관련 상품/서비스를 추천하세요 ("이 작업에는 **[상품명]**이 가장 적합했습니다")
- "추천 이유", "실사용 후기" 톤으로 제품을 언급하세요
- 비교표에 "구매 포인트" 또는 "추천 대상" 컬럼을 추가하세요
- 결론부에 "가장 추천하는 제품/서비스"를 명시하세요
- "가성비", "최저가", "할인", "무료 체험" 등 구매 전환 키워드를 자연스럽게 사용하세요
- 단, 광고처럼 보이지 않게 정보 제공 위주로 작성하세요
` : '';

  // 내부 링크 지시 (기존 포스트 슬러그 활용)
  const internalLinkInstruction = allPosts.length > 0 ? `
**내부 링크 삽입 (필수)**:
아래 기존 포스트 중 관련된 글이 있다면 본문에 자연스럽게 1~2개 링크를 삽입하세요.
형식: "더 자세한 내용은 [관련 글 제목](/blog/슬러그/)을 참고하세요"
기존 포스트 목록:
${allPosts.slice(-20).map(p => `- "${p.title}" → /blog/${p.slug}/`).join('\n')}
` : '';

  const prompt = `당신은 한국어 기술 블로그 전문 작가입니다. 아래 주제로 SEO 최적화된 블로그 포스트를 작성하세요.

카테고리: ${categoryName}
키워드: ${keyword}
${dupeGuard}${engagingInstruction}${revenueInstruction}${internalLinkInstruction}
**최우선 원칙 — 최신 데이터 기반 작성 (정보 신뢰도가 핵심)**:
- 오늘은 ${dateStr}입니다. 이 시점 기준 실제 존재하는 제품, 서비스, 벤치마크 수치만 사용
- 허구의 수치나 제품명을 만들어내지 말 것. 확실하지 않으면 "공식 발표 예정" 등으로 표기
- 가격, 성능 수치, 출시일 등은 반드시 실제 데이터를 근거로 작성
- 비교 글 작성 시 각 제품의 공식 벤치마크(SWE-bench, Terminal-Bench 등)를 인용
- 단순 일반론이 아닌 구체적인 시의성 있는 최신 내용 위주
- 기존 포스트와 제목이나 핵심 내용이 유사하면 안 됩니다
- 제목에 "${yyyy}년" 또는 구체적 시점을 포함
- 출처가 불분명한 통계나 수치는 사용하지 말 것

요구사항:
- 한국어로 작성
- 본문 길이: 1500~2500자
- H2, H3 제목 구조 사용
- 표(table)를 1개 이상 포함
- SEO 키워드를 자연스럽게 포함
- 실용적이고 구체적인 정보 위주
- 2026년 최신 트렌드 반영
- 본문 마지막에 "## 참고 자료" 섹션을 추가하고, 글에서 참고한 공식 사이트·문서·벤치마크 등 2~4개의 출처를 하이퍼링크로 제공하세요. 형식: "- [출처 이름](https://실제URL)"
${evidenceInstruction}
${chartInstruction}

**메타 설명(description) 작성 규칙**:
- 반드시 숫자 포함 ("TOP 5", "3가지", "7단계")
- 행동 유도 문구 포함 ("지금 확인하세요", "바로 비교해보세요")
- 궁금증 유발 ("이것만 알면 충분합니다", "모르면 손해")
- 120~160자 범위 엄수

반드시 아래 JSON 형식으로만 응답하세요 (JSON 외 텍스트 금지):
{
  "title": "포스트 제목 (40~60자)",
  "slug": "english-slug-for-url (영문 소문자, 하이픈으로 연결, 예: best-coding-monitors-2026)",
  "description": "메타 설명 (120~160자, 위 규칙 적용)",
  "tags": ["태그1", "태그2", "태그3", "태그4"],
  "content": "마크다운 본문 (H2/H3/표/차트 포함)",
  "faq": [
    {"q": "자주 묻는 질문 1", "a": "답변 1 (2~3문장)"},
    {"q": "자주 묻는 질문 2", "a": "답변 2 (2~3문장)"},
    {"q": "자주 묻는 질문 3", "a": "답변 3 (2~3문장)"}
  ]
}`;

  console.log(`[Claude] Generating post for "${keyword}"...`);

  const text = (await callLLM(prompt)).trim();

  // JSON 파싱 (코드블록 감싸기 + 잘림 대응)
  let jsonStr = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "");

  let result;
  try {
    result = JSON.parse(jsonStr);
  } catch (e) {
    // JSON이 잘린 경우 content 필드를 잘라서라도 파싱 시도
    console.warn("[WARN] Direct JSON parse failed, attempting recovery...");
    try {
      // content 필드에서 마지막 유효한 위치를 찾아 잘라내기
      const contentMatch = jsonStr.match(/"content"\s*:\s*"/);
      if (contentMatch) {
        const contentStart = contentMatch.index + contentMatch[0].length;
        let truncated = jsonStr.slice(0, contentStart);
        const remaining = jsonStr.slice(contentStart);
        const lastGoodPos = remaining.lastIndexOf('\\n');
        const safeContent = lastGoodPos > 0 ? remaining.slice(0, lastGoodPos) : remaining.slice(0, -50);
        truncated += safeContent + '"\n}';
        result = JSON.parse(truncated);
      }
    } catch (e2) {
      // 최종 fallback: 정규식으로 각 필드 추출
      console.warn("[WARN] Recovery failed, extracting fields manually...");
      const titleMatch = jsonStr.match(/"title"\s*:\s*"([^"]+)"/);
      const slugMatch = jsonStr.match(/"slug"\s*:\s*"([^"]+)"/);
      const descMatch = jsonStr.match(/"description"\s*:\s*"([^"]+)"/);
      const tagsMatch = jsonStr.match(/"tags"\s*:\s*\[([^\]]+)\]/);
      const contentMatch = jsonStr.match(/"content"\s*:\s*"([\s\S]+)/);

      if (titleMatch && contentMatch) {
        const tags = tagsMatch
          ? tagsMatch[1].match(/"([^"]+)"/g).map(t => t.replace(/"/g, ''))
          : ["자동생성"];
        let rawContent = contentMatch[1];
        // ⚠️ lastIndexOf('"') 로 자르면 content 뒤에 오는 "faq": [...] 가 통째로 본문에
        //    딸려 들어간다. 발행글 끝에 원시 JSON 이 노출되고 frontmatter faq 는 비어
        //    FAQ 위젯·FAQPage 스키마가 통째로 빠졌다(2026-08-05 TF, 08-06 LF 연속 발생).
        //    content 문자열의 진짜 끝 = 닫는 따옴표 뒤에 "," + 다음 키가 오는 지점이다.
        const endAt = rawContent.search(/"\s*,\s*"[a-zA-Z_][a-zA-Z0-9_]*"\s*:/);
        if (endAt > 0) rawContent = rawContent.slice(0, endAt);
        else {
          const lastQuote = rawContent.lastIndexOf('"');
          if (lastQuote > 0) rawContent = rawContent.slice(0, lastQuote);
        }
        rawContent = rawContent.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

        // 잘린 JSON 에서라도 faq 를 살려낸다. 못 살리면 빈 배열 → 위젯만 안 뜨고
        // 본문에 원시 JSON 이 새는 일은 없다.
        const recoveredFaq = [];
        {
          const src = (jsonStr.split(/"faq"\s*:\s*\[/)[1] || '');
          const re = /"q"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"a"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
          let mm;
          while ((mm = re.exec(src))) {
            recoveredFaq.push({
              q: mm[1].replace(/\\"/g, '"').replace(/\\n/g, ' '),
              a: mm[2].replace(/\\"/g, '"').replace(/\\n/g, ' '),
            });
          }
        }

        result = {
          title: titleMatch[1],
          slug: slugMatch ? slugMatch[1] : null,
          description: descMatch ? descMatch[1] : titleMatch[1],
          tags,
          content: rawContent,
          faq: recoveredFaq,
        };
      }
    }

    if (!result) {
      throw new Error(`Failed to parse Claude response as JSON: ${text.slice(0, 200)}`);
    }
  }

  // ⚠️ FAQ 를 본문 하단에 마크다운 섹션으로 덧붙이지 않는다(2026-08-04 제거).
  //    publish-wordpress.mjs 가 frontmatter 의 faq 로 `<div class="mg-faq"><h2>자주 묻는 질문</h2>…`
  //    위젯을 이미 렌더한다. 둘 다 넣으면 발행글에 "자주 묻는 질문" H2 가 2개 생기고
  //    ez-toc 목차에도 `자주_묻는_질문`, `자주_묻는_질문-2` 로 중복 등재된다.
  //    (mg-faq 위젯이 도입된 뒤 이 블록만 남아 08-02~08-04 발행분 4편이 중복 렌더됐다.)
  //    FAQ 는 frontmatter 의 faq 가 SSOT — 위젯과 FAQPage JSON-LD 둘 다 거기서 나온다.

  return result;
}

// ─── Pexels API ───────────────────────────────────────────────────────

// TF(개발/AI=추상)용 codex 일러스트 히어로. 실패 시 Pexels 폴백. 로컬 /heroes/*.jpg 반환(setFeatured가 업로드)
async function fetchHeroImageCodex(searchTerm) {
  const safe = (searchTerm || "hero").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "hero";
  const rel = ".tmp-hero/" + safe + ".png";
  const png = join(PROJECT_ROOT, rel);
  const outDir = join(PROJECT_ROOT, "public", "heroes");
  const jpg = join(outDir, safe + ".jpg");
  const RESIZE = join(PROJECT_ROOT, "..", ".claude", "skills", "codex-imagegen", "scripts", "resize-cover.mjs");
  try {
    mkdirSync(join(PROJECT_ROOT, ".tmp-hero"), { recursive: true });
    mkdirSync(outDir, { recursive: true });
    const prompt = "Use your built-in image_gen tool to generate 1 image and save it to " + rel + ". A clean modern flat vector editorial illustration representing the software/tech/AI topic \"" + searchTerm + "\". Blue and teal palette, soft gradients, subtle geometric tech shapes, NO TEXT, NO LOGOS, NO letters, wide 16:9, professional hero banner. Do not ask questions; generate and save to that exact path, then stop.";
    console.log("[Codex] Generating hero for \"" + searchTerm + "\"...");
    const r = spawnSync("codex", ["exec", "-s", "workspace-write", "--skip-git-repo-check", "-C", PROJECT_ROOT, prompt], { timeout: 360000, stdio: "ignore" });
    if (r.status !== 0 || !existsSync(png)) throw new Error("codex no output");
    spawnSync("node", [RESIZE, "--in", png, "--out", jpg, "--w", "1200", "--h", "630", "--q", "0.85"], { timeout: 60000, stdio: "ignore" });
    if (!existsSync(jpg)) throw new Error("resize failed");
    console.log("[Codex] Hero saved: /heroes/" + safe + ".jpg");
    return { url: "/heroes/" + safe + ".jpg", alt: searchTerm };
  } catch (e) {
    console.log("[Codex] failed (" + e.message + "), fallback to Pexels");
    return await fetchHeroImage(searchTerm);
  }
}

// ⚠️⚠️ 2026-07-30 사고 — 대표이미지가 본문과 전혀 무관하게 붙던 원인 2가지.
//  ① --topic 으로 발행하면 searchTerm 이 **한국어 제목 그대로**다. Pexels 는 영문 스톡 사이트라
//     "육아휴직급여 2026 조건·신청방법·상한액 총정리" 같은 질의에 아무거나 돌려준다.
//  ② 그걸 per_page=1 로 받아 **첫 결과를 무조건 채택**했다. 관련성 검사가 전혀 없었다.
//  실제 피해: 육아휴직급여 글 → 졸업사진 / AI 코딩 보안 글 → 배달로봇 / 신용카드 글 → 졸업사진.
// → 한국어 제목에서 영문 검색어를 뽑고, 후보를 여러 개 받아 관련성으로 고른다.
//   맞는 게 없으면 **아무거나 쓰지 않고 null 을 반환한다**(틀린 대표이미지보다 없는 편이 낫다).

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "for", "with", "in", "on", "to"]);

// ⚠️ 2026-08-11 사고 — 서로 다른 두 글이 같은 대표이미지로 나갔다(pexels 4386366).
//    후보를 여러 개 받아도 **사이트가 이미 쓴 사진을 거르지 않으면** 인기 사진이 계속 재선택된다.
//    mungge 미디어 slug 가 `pexels-photo-<id>-<ts>` 라 거기서 기사용 id 를 역추적한다.
//    자격증명/네트워크가 없으면 빈 Set → 중복 검사 없이 기존 동작으로 degrade.
let _usedPexelsIds = null;
async function usedPexelsIds() {
  if (_usedPexelsIds) return _usedPexelsIds;
  const used = new Set();
  const { WP_URL, WP_USER, WP_APP_PASS } = process.env;
  if (WP_URL && WP_USER && WP_APP_PASS) {
    const auth = "Basic " + Buffer.from(`${WP_USER}:${WP_APP_PASS}`).toString("base64");
    try {
      for (let page = 1; page <= 10; page++) {
        const res = await fetch(`${WP_URL}/wp-json/wp/v2/media?per_page=100&page=${page}&_fields=slug`, {
          headers: { Authorization: auth },
        });
        if (!res.ok) break;
        const items = await res.json();
        if (!Array.isArray(items) || !items.length) break;
        for (const m of items) {
          const hit = (m.slug || "").match(/pexels-photo-(\d+)/);
          if (hit) used.add(hit[1]);
        }
        if (items.length < 100) break;
      }
    } catch (e) {
      console.log(`[Pexels] 기사용 목록 조회 실패(${e.message.slice(0, 60)}) — 중복 검사 없이 진행`);
    }
  }
  _usedPexelsIds = used;
  return used;
}

// 한국어 주제 → 영문 스톡 검색어 2~3개. LLM 실패 시 원문을 그대로 쓴다(최소한 기존 동작 유지).
async function deriveImageQueries(searchTerm) {
  if (!/[가-힣]/.test(searchTerm)) return [searchTerm];
  try {
    const raw = await callLLM(
      `다음 한국어 블로그 주제에 어울리는 **영문 스톡사진 검색어** 3개를 만들어줘.\n` +
      `- 각 2~4단어, 사진으로 찍힐 수 있는 구체적 장면일 것(추상 개념 금지)\n` +
      `- 주제의 핵심 대상이 화면에 보여야 함\n` +
      `- JSON 배열만 출력: ["...","...","..."]\n\n주제: ${searchTerm}`
    );
    const m = raw.match(/\[[\s\S]*?\]/);
    const arr = m ? JSON.parse(m[0]) : null;
    if (Array.isArray(arr) && arr.length) return arr.filter((x) => typeof x === "string" && x.trim()).slice(0, 3);
  } catch (e) {
    console.log(`[Pexels] 영문 검색어 생성 실패(${e.message.slice(0, 60)}) — 원문 사용`);
  }
  return [searchTerm];
}

async function fetchHeroImage(searchTerm) {
  if (!PEXELS_API_KEY) {
    console.log("[Pexels] No API key, skipping hero image");
    return null;
  }

  const queries = await deriveImageQueries(searchTerm);
  console.log(`[Pexels] 검색어: ${queries.join(" | ")}`);

  const used = await usedPexelsIds();
  const candidates = [];
  for (const q of queries) {
    try {
      const res = await fetch(`${PEXELS_API_URL}?query=${encodeURIComponent(q)}&per_page=20&orientation=landscape`, {
        headers: { Authorization: PEXELS_API_KEY },
      });
      if (!res.ok) { console.error(`[Pexels] API error ${res.status} (${q})`); continue; }
      const data = await res.json();
      for (const p of data.photos || []) {
        if (used.has(String(p.id))) continue; // 이미 다른 글이 쓴 사진 (2026-08-11 중복 사고)
        candidates.push({ q, p });
      }
    } catch (err) {
      console.error(`[Pexels] Error: ${err.message}`);
    }
  }
  if (!candidates.length) { console.log("[Pexels] 후보 0건 — 대표이미지 없음"); return null; }

  // 관련성 점수: 검색어 토큰이 사진 alt 에 얼마나 들어있나. 0점이면 주제와 무관하다고 본다.
  const tokens = [...new Set(queries.join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t)))];
  const scored = candidates.map(({ q, p }) => {
    const alt = (p.alt || "").toLowerCase();
    return { p, q, score: tokens.reduce((s, t) => s + (alt.includes(t) ? 1 : 0), 0) };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score === 0) {
    console.log(`[Pexels] 관련 후보 없음(${candidates.length}건 모두 0점) — 대표이미지 없이 진행`);
    return null;
  }
  console.log(`[Pexels] 채택(점수 ${best.score}/${tokens.length}): ${best.p.alt?.slice(0, 70)}`);
  return {
    url: best.p.src.large2x,
    alt: best.p.alt || best.q,
    photographer: best.p.photographer,
  };
}

// ─── Coupang Links ────────────────────────────────────────────────────

// 차트 div의 data-labels/title에 LLM이 넣은 \\n·따옴표·중복콤마 정리(HTML 속성 깨짐 방지)
function fixChartLabels(md) {
  return md.replace(/<div class="chart-[^"]*"[^>]*><\/div>/g, (tag) =>
    tag
      .replace(/data-labels="([\s\S]*?)"(?=\s+data-|\s*>)/g, (m, v) =>
        `data-labels="${v.replace(/\\n|\n/g, ' ').replace(/"/g, '').replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim()}"`)
      .replace(/data-title="([\s\S]*?)"(?=\s+data-|\s*>)/g, (m, v) =>
        `data-title="${v.replace(/\\n|\n/g, ' ').replace(/"/g, '').trim()}"`)
  );
}

function selectCoupangLinks(coupangData, categoryKey) {
  const links = coupangData[categoryKey];
  if (!links || links.length === 0) return [];
  const count = Math.min(links.length, Math.random() < 0.5 ? 2 : 3);
  return pickRandom(links, count);
}

// ─── Frontmatter + File Assembly ──────────────────────────────────────

function buildMarkdownFile(post, category, heroImage, coupangLinks, date) {
  const slug = post.slug || toSlug(post.title);
  const filename = `${date}-${category.toLowerCase()}-${slug}.md`;

  // Coupang links YAML
  let coupangYaml = "";
  if (coupangLinks.length > 0) {
    coupangYaml = `coupangLinks:\n`;
    for (const link of coupangLinks) {
      coupangYaml += `  - title: "${link.title}"\n    url: "${link.url}"\n    imageUrl: "${link.imageUrl || ''}"\n`;
    }
  }

  // Hero image (alt 내부 따옴표 제거 - YAML 파싱 에러 방지)
  const imageLine = heroImage
    ? `image:\n  url: "${heroImage.url}"\n  alt: "${(heroImage.alt || '').replace(/"/g, '')}"`
    : "";

  // FAQ YAML
  let faqYaml = "";
  if (post.faq && Array.isArray(post.faq) && post.faq.length > 0) {
    faqYaml = `faq:\n`;
    for (const item of post.faq) {
      faqYaml += `  - q: "${item.q.replace(/"/g, '\\"')}"\n    a: "${item.a.replace(/"/g, '\\"')}"\n`;
    }
  }

  const frontmatter = `---
title: "${post.title}"
description: "${post.description}"
pubDate: ${date}
author: "${AUTHOR}"
category: "${category}"
tags: [${post.tags.map((t) => `"${t}"`).join(", ")}]
${imageLine}
${coupangYaml}${faqYaml}---`;

  const content = `${frontmatter}

${post.content}
`;

  return { filename, slug, content };
}

// ─── Supabase Registration ────────────────────────────────────────────

async function registerToSupabase(post, category, slug, date, heroImage) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log("[Supabase] No credentials, skipping registration");
    return;
  }

  const payload = {
    slug: `${date}-${slug}`,
    title: post.title,
    description: post.description,
    category: category.toLowerCase(),
    tags: post.tags,
    pub_date: date,
    image_url: heroImage?.url || null,
    views: 0,
  };

  console.log(`[Supabase] Registering post "${post.title}"...`);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log("[Supabase] Post registered successfully");
    } else {
      const errorText = await response.text();
      console.error(`[Supabase] Error ${response.status}: ${errorText}`);
    }
  } catch (err) {
    console.error(`[Supabase] Error: ${err.message}`);
  }
}

// ─── Workflow Dispatch 입력 처리 ──────────────────────────────────────

function resolveInputs(seeds) {
  const inputCategory = process.env.INPUT_CATEGORY || "auto";
  const inputTopic = process.env.INPUT_TOPIC || "";
  const inputCount = parseInt(process.env.INPUT_COUNT || "3", 10);
  const inputEngaging = process.env.INPUT_ENGAGING === "true";
  const inputRevenue = process.env.INPUT_REVENUE === "true";
  const count = Math.min(Math.max(inputCount, 1), 3);

  let categoryNames;
  if (inputCategory !== "auto") {
    // 수동 선택: 같은 카테고리를 count만큼 반복
    categoryNames = Array(count).fill(inputCategory);
  } else {
    // 자동: 날짜 기반 순환 선택
    categoryNames = selectCategories(count);
  }

  // 수동 주제 입력 시: 첫 번째 포스트에만 적용
  const customTopic = inputTopic.trim();

  return { categoryNames, customTopic, count, engaging: inputEngaging, revenue: inputRevenue };
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const inputCategory = process.env.INPUT_CATEGORY || "auto";
  const inputTopic = process.env.INPUT_TOPIC || "";
  const inputCount = process.env.INPUT_COUNT || "3";

  console.log("=== Blog Post Generator ===");
  console.log(`[Mode] category=${inputCategory}, topic="${inputTopic}", count=${inputCount}\n`);

  const today = getToday();
  console.log(`[Info] Date: ${today}`);

  // 0. 스케줄 실행 시 중복 확인 (수동 트리거는 항상 실행)
  const isManual = inputCategory !== "auto" || inputTopic.trim() !== "";
  const blogDir = join(PROJECT_ROOT, "src", "blog");
  if (!isManual && existsSync(blogDir)) {
    const existing = readdirSync(blogDir).filter(f => f.startsWith(today));
    if (existing.length >= 3) {
      console.log(`[Skip] Today's 3 posts already exist: ${existing.join(", ")}`);
      console.log("=== Done (skipped) ===");
      process.exit(0);
    }
  }

  // 1. Load data files
  const seeds = loadJSON("category-seeds.json");
  const coupangData = loadJSON("coupang-links.json");

  // 2. Resolve inputs
  const { categoryNames, customTopic, count, engaging, revenue } = resolveInputs(seeds);
  const allPosts = loadExistingPostSlugs();
  console.log(`[Info] Categories: ${categoryNames.join(", ")} (${count}편)`);
  console.log(`[Info] Existing posts for internal linking: ${allPosts.length}개`);
  if (customTopic) console.log(`[Info] Custom topic: "${customTopic}"`);
  if (engaging) console.log(`[Info] Engaging mode: ON (독자 유입 극대화)`);
  if (revenue) console.log(`[Info] Revenue mode: ON (수익 극대화)`);

  // 3. Generate posts sequentially
  let generated = 0;
  for (let i = 0; i < categoryNames.length; i++) {
    const categoryName = categoryNames[i];
    // ⚠ 시드 키는 레포마다 표기가 다르다(TF=AI/Dev/Review/Game, LF=finance/lifestyle).
    //   대소문자만 달라도 조용히 0편이 나오므로(2026-08-20 --category ai 로 두 번 날림) 무시하고 찾는다.
    const categoryData = seeds.categories.find((c) => c.name === categoryName)
      || seeds.categories.find((c) => String(c.name).toLowerCase() === String(categoryName).toLowerCase());
    if (!categoryData) {
      console.error(`[ERROR] Category "${categoryName}" not found in seeds`);
      continue;
    }

    console.log(`\n--- Post ${i + 1}/${count}: ${categoryName} ---`);

    try {
      // 수동 주제가 있으면 첫 번째 포스트에 적용
      let keyword, searchTerm;
      if (customTopic && i === 0) {
        keyword = customTopic;
        searchTerm = customTopic;
      } else {
        const keywordIndex = Math.floor(
          Math.random() * categoryData.keywords.length
        );
        keyword = categoryData.keywords[keywordIndex];
        searchTerm =
          categoryData.searchTerms[keywordIndex % categoryData.searchTerms.length];
      }

      console.log(`[Info] Keyword: ${keyword}`);
      console.log(`[Info] Search term: ${searchTerm}`);

      // 기존 같은 카테고리 포스트 제목 로드 (중복 방지)
      const existingTitles = loadExistingPostTitles(categoryName);
      console.log(`[Info] Existing ${categoryName} posts: ${existingTitles.length}개`);

      // Generate content via Claude API
      const post = await generatePostContent(categoryName, keyword, searchTerm, existingTitles, engaging, revenue, allPosts);
      console.log(`[Claude] Generated: "${post.title}"`);

      // Fetch hero image via Pexels
      const heroImage = await fetchHeroImageCodex(searchTerm);

      // Select coupang links
      const categoryKey = categoryName.toLowerCase();
      const coupangLinks = revenue ? selectCoupangLinks(coupangData, categoryKey) : [];
      console.log(`[Coupang] Selected ${coupangLinks.length} product links`);

      // Assemble markdown file
      const { filename, slug, content } = buildMarkdownFile(
        post,
        categoryName,
        heroImage,
        coupangLinks,
        today
      );

      // Write file
      const outputPath = join(PROJECT_ROOT, "src", "blog", filename);
      writeFileSync(outputPath, fixChartLabels(content), "utf-8");
      console.log(`[File] Written: src/blog/${filename}`);

      // Register to Supabase
      await registerToSupabase(post, categoryName, slug, today, heroImage);
      // mungge.com(WordPress) 자동 발행 — WP env 있을 때만(없으면 Astro만)
      // INPUT_WP_STATUS=draft 면 라이브 대신 초안으로 올린다(사람이 검토 후 수동 공개).
      // 기본은 publish — 기존 자동발행 동작을 바꾸지 않는다.
      await autoPublishToWP(outputPath, { silo: "테크·개발", status: process.env.INPUT_WP_STATUS || "publish" });
      generated++;
    } catch (err) {
      console.error(`[ERROR] Post ${i + 1}/${count} (${categoryName}) failed: ${err.message}`);
      console.log(`[Info] Continuing to next post...`);
      continue;
    }
  }

  console.log(`\n=== Done! (${generated}/${count} posts generated) ===`);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
