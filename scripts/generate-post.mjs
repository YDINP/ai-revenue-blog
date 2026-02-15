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

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

// ─── Config ───────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const PEXELS_API_URL = "https://api.pexels.com/v1/search";

const AUTHOR = "TechFlow";
const CATEGORY_ORDER = ["AI", "Dev", "Review", "Game"];
const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

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

  const chartInstruction = `
본문 중간에 아래 5가지 차트 유형 중 주제에 맞는 것을 1~2개 선택하여 반드시 포함하세요:

1) chart-bar (막대 차트) - 항목별 수치 비교:
<div class="chart-bar" data-title="차트 제목" data-labels="항목1,항목2,항목3" data-values="85,72,90" data-colors="#10b981,#3b82f6,#f59e0b" data-unit="점"></div>

2) chart-radar (카드형 점수 비교) - 제품/서비스 다항목 평가:
<div class="chart-radar" data-title="종합 비교" data-items='[{"name":"제품A","scores":[{"label":"성능","value":9,"color":"#10b981"},{"label":"가격","value":7,"color":"#3b82f6"}]},{"name":"제품B","scores":[{"label":"성능","value":8,"color":"#f59e0b"},{"label":"가격","value":9,"color":"#ef4444"}]}]'></div>

3) chart-donut (도넛 차트) - 비율/점유율/구성비 시각화:
<div class="chart-donut" data-title="시장 점유율" data-labels="항목1,항목2,항목3" data-values="60,25,15" data-colors="#3b82f6,#10b981,#f59e0b" data-unit="%"></div>

4) chart-versus (VS 비교) - 두 대상 1:1 대결 비교:
<div class="chart-versus" data-title="A vs B" data-name-a="제품A" data-name-b="제품B" data-color-a="#3b82f6" data-color-b="#10b981" data-items='[{"label":"성능","a":85,"b":90},{"label":"가격","a":70,"b":80}]'></div>

5) chart-progress (원형 게이지) - 개별 점수/달성률:
<div class="chart-progress" data-title="평가 점수" data-labels="항목1,항목2,항목3" data-values="85,72,90" data-colors="#10b981,#3b82f6,#f59e0b" data-max="100" data-unit="점"></div>

선택 가이드: 비율/점유율→donut, 1:1 대결→versus, 개별 평점→progress, 수치 비교→bar, 다항목 제품 평가→radar.
주의: div 안에 자식 요소를 넣지 마세요. 항목 3~5개. chart-bar만 반복하지 말고 다양한 유형을 활용하세요.

**강조 포인트 — 콜아웃 박스 사용 금지**:
- 콜아웃 박스(callout-tip/warning/info)를 사용하지 마세요.
- 강조할 내용은 마크다운 **bold** 또는 > blockquote로 충분합니다.
- 본문에서 이미 설명한 내용을 별도 박스로 반복하는 것은 가독성을 해칩니다.`;

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
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();

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
        const lastQuote = rawContent.lastIndexOf('"');
        if (lastQuote > 0) rawContent = rawContent.slice(0, lastQuote);
        rawContent = rawContent.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

        result = {
          title: titleMatch[1],
          slug: slugMatch ? slugMatch[1] : null,
          description: descMatch ? descMatch[1] : titleMatch[1],
          tags,
          content: rawContent,
        };
      }
    }

    if (!result) {
      throw new Error(`Failed to parse Claude response as JSON: ${text.slice(0, 200)}`);
    }
  }

  // FAQ가 있으면 본문 하단에 "자주 묻는 질문" 섹션 추가
  if (result.faq && Array.isArray(result.faq) && result.faq.length > 0) {
    let faqSection = '\n\n---\n\n## 자주 묻는 질문\n\n';
    for (const item of result.faq) {
      faqSection += `### ${item.q}\n\n${item.a}\n\n`;
    }
    result.content += faqSection;
  }

  return result;
}

// ─── Pexels API ───────────────────────────────────────────────────────

async function fetchHeroImage(searchTerm) {
  if (!PEXELS_API_KEY) {
    console.log("[Pexels] No API key, skipping hero image");
    return null;
  }

  const query = encodeURIComponent(searchTerm);
  const url = `${PEXELS_API_URL}?query=${query}&per_page=1&orientation=landscape`;

  console.log(`[Pexels] Searching for "${searchTerm}"...`);

  try {
    const response = await fetch(url, {
      headers: { Authorization: PEXELS_API_KEY },
    });

    if (!response.ok) {
      console.error(`[Pexels] API error ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.photos && data.photos.length > 0) {
      const photo = data.photos[0];
      console.log(`[Pexels] Found image: ${photo.src.large2x}`);
      return {
        url: photo.src.large2x,
        alt: photo.alt || searchTerm,
        photographer: photo.photographer,
      };
    }
  } catch (err) {
    console.error(`[Pexels] Error: ${err.message}`);
  }
  return null;
}

// ─── Coupang Links ────────────────────────────────────────────────────

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
      coupangYaml += `  - title: "${link.title}"\n    url: "${link.url}"\n`;
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
    const categoryData = seeds.categories.find((c) => c.name === categoryName);
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
      const heroImage = await fetchHeroImage(searchTerm);

      // Select coupang links
      const categoryKey = categoryName.toLowerCase();
      const coupangLinks = selectCoupangLinks(coupangData, categoryKey);
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
      writeFileSync(outputPath, content, "utf-8");
      console.log(`[File] Written: src/blog/${filename}`);

      // Register to Supabase
      await registerToSupabase(post, categoryName, slug, today, heroImage);
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
