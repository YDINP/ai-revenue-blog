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

// ─── Data Loading ─────────────────────────────────────────────────────

function loadJSON(filename) {
  const filepath = join(__dirname, filename);
  if (!existsSync(filepath)) {
    console.error(`[ERROR] File not found: ${filepath}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(filepath, "utf-8"));
}

// ─── Claude API ───────────────────────────────────────────────────────

async function generatePostContent(categoryName, keyword, searchTerm) {
  if (!ANTHROPIC_API_KEY) {
    console.error("[ERROR] ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const isComparison =
    keyword.includes("비교") ||
    keyword.includes("추천") ||
    keyword.includes("리뷰");

  const chartInstruction = isComparison
    ? `
이 글은 비교/리뷰 성격이므로, 본문 중간에 아래 형태의 HTML 차트를 반드시 포함해 주세요:

1) chart-bar (막대 차트):
<div class="chart-bar">
  <div class="chart-bar-item" style="--value: 85; --color: ${CHART_COLORS[0]}"><span class="chart-bar-label">항목1</span><span class="chart-bar-value">85점</span></div>
  <div class="chart-bar-item" style="--value: 72; --color: ${CHART_COLORS[1]}"><span class="chart-bar-label">항목2</span><span class="chart-bar-value">72점</span></div>
</div>

2) chart-radar (비교 점수):
<div class="chart-radar">
  <div class="chart-radar-item"><span class="chart-radar-label">성능</span><span class="chart-radar-score" style="--score: 90; --color: ${CHART_COLORS[0]}">90</span></div>
  <div class="chart-radar-item"><span class="chart-radar-label">가격</span><span class="chart-radar-score" style="--score: 75; --color: ${CHART_COLORS[1]}">75</span></div>
</div>

차트의 항목과 점수는 글 주제에 맞게 3~5개 항목으로 구성하세요.`
    : "차트는 필요 없습니다.";

  const prompt = `당신은 한국어 기술 블로그 전문 작가입니다. 아래 주제로 SEO 최적화된 블로그 포스트를 작성하세요.

카테고리: ${categoryName}
키워드: ${keyword}

요구사항:
- 한국어로 작성
- 본문 길이: 1500~2500자
- H2, H3 제목 구조 사용
- 표(table)를 1개 이상 포함
- SEO 키워드를 자연스럽게 포함
- 실용적이고 구체적인 정보 위주
- 2026년 최신 트렌드 반영
${chartInstruction}

반드시 아래 JSON 형식으로만 응답하세요 (JSON 외 텍스트 금지):
{
  "title": "포스트 제목 (40~60자)",
  "slug": "english-slug-for-url (영문 소문자, 하이픈으로 연결, 예: best-coding-monitors-2026)",
  "description": "메타 설명 (120~160자)",
  "tags": ["태그1", "태그2", "태그3", "태그4"],
  "content": "마크다운 본문 (H2/H3/표/차트 포함)"
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
    console.error(`[ERROR] Claude API ${response.status}: ${errorText}`);
    process.exit(1);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();

  // JSON 파싱 (코드블록 감싸기 + 잘림 대응)
  let jsonStr = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "");

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // JSON이 잘린 경우 content 필드를 잘라서라도 파싱 시도
    console.warn("[WARN] Direct JSON parse failed, attempting recovery...");
    try {
      // content 필드에서 마지막 유효한 위치를 찾아 잘라내기
      const contentMatch = jsonStr.match(/"content"\s*:\s*"/);
      if (contentMatch) {
        const contentStart = contentMatch.index + contentMatch[0].length;
        // 마지막으로 닫히지 않은 문자열을 강제로 닫기
        let truncated = jsonStr.slice(0, contentStart);
        // content의 마지막 유효한 텍스트까지 찾기
        const remaining = jsonStr.slice(contentStart);
        // 이스케이프되지 않은 마지막 따옴표 위치 찾기, 없으면 그냥 자르기
        const lastGoodPos = remaining.lastIndexOf('\\n');
        const safeContent = lastGoodPos > 0 ? remaining.slice(0, lastGoodPos) : remaining.slice(0, -50);
        truncated += safeContent + '"\n}';
        return JSON.parse(truncated);
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
        // content에서 마지막 닫는 따옴표 전까지
        let rawContent = contentMatch[1];
        const lastQuote = rawContent.lastIndexOf('"');
        if (lastQuote > 0) rawContent = rawContent.slice(0, lastQuote);
        // JSON 이스케이프 해제
        rawContent = rawContent.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

        return {
          title: titleMatch[1],
          slug: slugMatch ? slugMatch[1] : null,
          description: descMatch ? descMatch[1] : titleMatch[1],
          tags,
          content: rawContent,
        };
      }
    }

    console.error("[ERROR] Failed to parse Claude response as JSON:");
    console.error(text.slice(0, 500));
    process.exit(1);
  }
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
  const filename = `${date}-${slug}.md`;

  // Coupang links YAML
  let coupangYaml = "";
  if (coupangLinks.length > 0) {
    coupangYaml = `coupangLinks:\n`;
    for (const link of coupangLinks) {
      coupangYaml += `  - title: "${link.title}"\n    url: "${link.url}"\n`;
    }
  }

  // Hero image
  const imageLine = heroImage
    ? `image:\n  url: "${heroImage.url}"\n  alt: "${heroImage.alt}"`
    : "";

  const frontmatter = `---
title: "${post.title}"
description: "${post.description}"
pubDate: "${date}"
author: "${AUTHOR}"
category: "${category}"
tags: [${post.tags.map((t) => `"${t}"`).join(", ")}]
${imageLine}
${coupangYaml}---`;

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

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Daily Blog Post Generator ===\n");

  const today = getToday();
  console.log(`[Info] Date: ${today}`);

  // 0. 중복 확인 - 같은 날짜 파일이 이미 있으면 스킵
  const blogDir = join(PROJECT_ROOT, "src", "blog");
  if (existsSync(blogDir)) {
    const existing = readdirSync(blogDir).filter(f => f.startsWith(today));
    if (existing.length > 0) {
      console.log(`[Skip] Today's post already exists: ${existing[0]}`);
      console.log("=== Done (skipped) ===");
      process.exit(0);
    }
  }

  // 1. Load data files
  const seeds = loadJSON("category-seeds.json");
  const coupangData = loadJSON("coupang-links.json");

  // 2. Select category by day-of-month rotation
  const categoryName = selectCategory();
  const categoryData = seeds.categories.find((c) => c.name === categoryName);
  if (!categoryData) {
    console.error(`[ERROR] Category "${categoryName}" not found in seeds`);
    process.exit(1);
  }

  console.log(`[Info] Category: ${categoryName}`);

  // 3. Pick random keyword and search term
  const keywordIndex = Math.floor(
    Math.random() * categoryData.keywords.length
  );
  const keyword = categoryData.keywords[keywordIndex];
  const searchTerm =
    categoryData.searchTerms[keywordIndex % categoryData.searchTerms.length];

  console.log(`[Info] Keyword: ${keyword}`);
  console.log(`[Info] Search term: ${searchTerm}`);

  // 4. Generate content via Claude API
  const post = await generatePostContent(categoryName, keyword, searchTerm);
  console.log(`[Claude] Generated: "${post.title}"`);

  // 5. Fetch hero image via Pexels
  const heroImage = await fetchHeroImage(searchTerm);

  // 6. Select coupang links
  const categoryKey = categoryName.toLowerCase();
  const coupangLinks = selectCoupangLinks(coupangData, categoryKey);
  console.log(`[Coupang] Selected ${coupangLinks.length} product links`);

  // 7. Assemble markdown file
  const { filename, slug, content } = buildMarkdownFile(
    post,
    categoryName,
    heroImage,
    coupangLinks,
    today
  );

  // 8. Write file
  const outputPath = join(PROJECT_ROOT, "src", "blog", filename);
  writeFileSync(outputPath, content, "utf-8");
  console.log(`[File] Written: src/blog/${filename}`);

  // 9. Register to Supabase
  await registerToSupabase(post, categoryName, slug, today, heroImage);

  console.log("\n=== Done! ===");
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
