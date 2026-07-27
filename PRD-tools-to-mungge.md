# PRD — LifeFlow 도구모음 → mungge 이식

## 배경

LF(life-revenue-blog)에 계산기 26종 + 인덱스가 `/tools/` 아래 Astro 페이지로 구현돼 있다.
LF 루트는 이미 mungge.com으로 301 되지만 `/tools/*` 는 리다이렉트에서 제외돼 구 도메인에 남아 있다.
GSC 28일 기준 tools 유입은 **클릭 0 · 노출 0**(LF 전체도 클릭 0 · 노출 143)이라 이식 리스크는 사실상 없다.

## 목표

`/tools/` 전체를 mungge.com(WordPress)의 **페이지 계층**으로 옮겨 경로를 그대로 유지한다.

- LF: `life-revenue-blog.vercel.app/tools/<slug>/`
- MG: `mungge.com/tools/<slug>/`  ← 경로 동일 → 나중에 1:1 301이 깔끔하다

## 사전 검증 (완료)

| 항목 | 결과 |
|---|---|
| WP가 인라인 `<script>`/`<style>` 보존하는지 | ✅ 보존 (`ben` = administrator → `unfiltered_html`) |
| 계산기 본문에 Astro 템플릿 표현식이 있는지 | 26개 중 25개가 순수 정적 HTML. `timezone-calculator` 만 `.map()` 사용 |
| 계산기 CSS가 테마 변수에 의존하는지 | ❌ 의존 없음. 26개 전부 `<style is:global>` 안에서 변수를 자체 정의 → 테마 무관하게 동일 렌더 |
| mungge `/tools/` 충돌 | 없음 (현재 404) |

## 설계

### 추출 경로 (하이브리드)

템플릿 표현식 문제를 피하려고 본문은 **빌드 산출물**에서, 나머지는 **소스**에서 가져온다.

| 조각 | 출처 | 이유 |
|---|---|---|
| 본문 HTML | `dist/tools/<slug>/index.html` 의 `<main class>` 내부 | 이미 렌더링돼 `.map()` 표현식이 해소돼 있음 |
| CSS | `src/pages/tools/<slug>.astro` 의 `<style is:global>` | 빌드에선 `_astro/*.css` 로 번들돼 전 페이지가 섞임 |
| JS | 같은 파일의 `<script is:inline>` | 소스가 그대로 인라인됨 |
| JSON-LD | `dist` 의 `application/ld+json` | frontmatter JS 객체가 이미 직렬화됨 |
| title/description | `.astro` frontmatter `const title` / `const description` | |

### WP 구조

- 부모 페이지 `tools` — index.astro 기반, 제목 "무료 생활 도구 모음"
- 자식 페이지 26개, slug = 계산기 slug → `/tools/<slug>/`
- 본문 = `<style>` + 본문 HTML + `<script>` + JSON-LD

### 테마 처리

Kadence가 `<section class="entry-hero">` 안에 `<h1 class="entry-title">` 를 렌더한다.
계산기 본문에도 자체 `<h1>` 이 있어 **H1 중복**이 생기므로, 주입 CSS에 `.entry-hero{display:none}` 을
넣어 테마 제목만 숨긴다. 스타일이 해당 페이지 본문에만 들어가므로 다른 페이지엔 영향이 없다.

### 멱등성

slug로 기존 페이지를 먼저 조회해 있으면 PUT(갱신), 없으면 POST(생성). 재실행해도 중복이 안 생긴다.

## 범위 밖 (별도 확인 후 진행)

- LF `/tools/*` → mungge 301 추가. 이식·검증이 끝난 뒤에 건다.
- mungge 메뉴에 "도구" 항목 추가.
- LF 원본 삭제. (301 유지 기간 동안 원본은 살려둔다)

## 완료 기준

1. `mungge.com/tools/` 및 26개 하위 페이지가 200 응답
2. 표본 페이지에서 계산 버튼이 실제로 동작(스크립트 보존 확인)
3. 테마 제목 중복 없음
4. 재실행 시 중복 페이지가 생기지 않음
