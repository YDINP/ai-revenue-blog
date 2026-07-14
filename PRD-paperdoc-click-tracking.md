# PRD — 페이퍼닥 배너/팝업 클릭 추적 (블로그별)

## 배경
페이퍼닥(paperdoc-web.vercel.app) 프로모는 3개 블로그에 노출되지만 클릭이 전혀 집계되지 않는다.
- ai-revenue(source `blog`) — `PaperdocPopup` (홈 팝업)
- life-revenue(source `lifeflow`) — `PaperdocPopup` (홈 팝업)
- gameflow(source `gameflow`) — `PaperdocBanner` (가로 배너 `.pd-promo-link` + 사이드 `.pd-side`, 여러 페이지)

3개 블로그는 하나의 Supabase `analytics` 테이블(`analytics-ingest` 엣지 함수)에 이벤트를 적재하고, ai-revenue `/dashboard`가 이를 읽어 표시한다.

## 목표
1. 3개 블로그 모두 페이퍼닥 링크 클릭 시 `paperdoc_click` 이벤트를 `source`(블로그 구분) + 위치(placement) 메타와 함께 전송.
2. ai-revenue 대시보드에 "페이퍼닥" 탭을 추가해 총/오늘 클릭, 블로그별(TF·LF·GF) 분해, 위치별(팝업/배너/사이드) 분해, 최근 클릭 피드를 표시.
3. 전역 실시간 이벤트 피드에도 페이퍼닥 클릭이 나타나도록 아이콘/라벨 등록.

## 설계
- 셀렉터: `a[href*="paperdoc-web.vercel.app"]` (팝업·배너·사이드 링크가 모두 이 href 공유).
- placement: 앵커 클래스로 판정 — `pd-pop*`→popup, `pd-side*`→side, `pd-promo*`→banner.
- 전송: coupang_click과 동일 경로(sendBeacon 우선, fetch keepalive 폴백).
- 신규 event_type이므로 Supabase RPC 변경 불필요 — 대시보드는 REST(`event_type=eq.paperdoc_click`) 직접 조회 + JS 집계.

## 영향 파일
- `ai-revenue-blog/src/layouts/BaseLayout.astro` (source `blog`)
- `life-revenue-blog/src/layouts/BaseLayout.astro` (source `lifeflow`)
- `gameflow-blog/src/layouts/BaseLayout.astro` (source `gameflow`)
- `ai-revenue-blog/src/pages/dashboard.astro` (탭·집계·피드·sourceBadge GF·이벤트 아이콘)

## 검증
- 각 블로그 `astro build` 성공.
- 대시보드 탭 렌더 + 데이터 로드 경로 무오류(빌드 통과로 확인, 실데이터는 배포 후 누적).
