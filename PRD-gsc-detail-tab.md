# PRD — GSC 검색 실적 상세 탭

## 배경
대시보드 `전체 요약` 탭 상단의 GSC 패널(`#gsc-panel`)은 최근 7일 소스별 합계 + Top5 페이지만 보여줘 세부 분석이 불가. 별도 탭으로 분리하고 기능을 세분화한다.

## 요구사항 (확정)
- TF/LF/VIP처럼 **메인 탭에 `검색(GSC)` 탭 추가** (별도 화면 분리)
- 세부 기능 4종:
  1. **일별 추이 차트** — 클릭·노출·CTR·평균순위, 기간 7/28/90일
  2. **전날/당일 비교** — 최신일 vs 전일 델타 칩(▲▼), 소스 필터(전체/TF/LF)
  3. **페이지별 상세 테이블** — 정렬/검색, 전반→후반 클릭 델타(상승·하락)
  4. **소스별 분리(TF/LF)** — 각 소스 KPI + Top5 상시 병렬 표시

## 데이터
- Supabase `gsc_daily` (date, source[blog|lifeflow], page, clicks, impressions, ctr, position)
- `page='_TOTAL_'` = 소스별 일별 합계 → 추이/비교(경량, 90일)
- `page!='_TOTAL_'` = 페이지별 → 선택 기간만 fetch(캐시), 테이블/소스섹션
- CTR/평균순위 집계는 **노출 가중**. 평균순위는 낮을수록 좋음.

## 범위
- 단일 파일 `src/pages/dashboard.astro` 수정 (탭 버튼 + tab-content + CSS + JS)
- 기존 `#gsc-panel` 요약은 전체요약 탭에 그대로 유지
- 인증 게이트/헤더/SUPABASE 설정 재사용

## 완료 기준
- 빌드 성공, GSC 탭 클릭 시 lazy-load, 데이터 없을 때 안내 문구, 반응형(모바일 2열/1열)
