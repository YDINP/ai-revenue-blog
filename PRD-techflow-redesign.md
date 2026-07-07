# PRD — TechFlow 블로그 첨단기술 재디자인 (Aurora Glass + Signal Deck)

> 작성 2026-07-07 · 대상 `ai-revenue-blog` (Astro 5, 정적)

## 목표
1. **비주얼**: "글래스모피즘 + 오로라" 첨단기술 감성으로 전면 재디자인. 라이트/다크 모두 지원.
2. **구조**: 일반 블로그(히어로 → 카드 리스트)와 다른 **앱형 탐색 구조**로 홈 재구성.

## 디자인 시스템 (`src/styles/global.css`)
- 토큰 재정의: 오로라 팔레트(indigo #6366f1 → violet #a855f7 → cyan #22d3ee), 글래스 토큰(--glass-bg/-border/-blur/-shadow), 그라디언트 토큰.
- `body` 고정 오로라 블롭 배경(라이트/다크 각각) + 미세 float 애니메이션.
- 글래스 표면: header, hero, post-card, toc, chart, series-box, nav-link 등.
- 그라디언트 로고 텍스트 / 그라디언트 버튼 / 카드 hover 시 테두리 광원.
- `prefers-reduced-motion` 존중, 접근성 focus 유지.

## 홈 재구성 (`src/pages/index.astro`) — "Signal Deck"
- **Command Hero**: 오로라 글래스 히어로 + 라이브 통계칩(총 글수/카테고리수/최근 업데이트) + 인라인 검색(→ /blog?q=).
- **Filter Rail**: 카테고리 글래스 pill(All/AI/Dev/Game/Review + count) → 클라이언트 사이드 실시간 필터.
- **Spotlight**: 최신 글 1건을 대형 비대칭 글래스 카드로.
- **Bento Feed**: 카드 크기가 다른 비대칭 벤토 그리드(대/중/소 혼합)로 최신 글 노출. 필터·검색과 연동.
- 인기글 리더보드 + 뉴스레터 유지.

## 컴포넌트
- `BentoCard.astro` 신규(대/중/소 variant) 또는 PostCard 확장.

## 검증
- playwright 스크린샷: 홈(라이트/다크), 블로그, 포스트 상세. 레이아웃 깨짐/대비 확인.
- `astro build` 성공.

## 비고
- 블로그 상세/태그 페이지는 토큰 상속으로 자동 반영(구조 변경 없음).
- 커밋: 디자인 시스템 / 홈 구조 분리 커밋 권장.
