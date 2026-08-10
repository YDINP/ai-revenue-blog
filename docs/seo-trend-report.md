# 일일 SEO 추이 리포트 (텔레그램 블록)

기존 수동 SEO 체크(projects.html 체크리스트에서 GSC·네이버·Bing·다음 콘솔을 눈으로 확인)를
**텔레그램 일일 리포트(@ben_dashboard_bot)에 자동 블록으로 통합**한 것.

## 구조

- **수집(분리 크론)** `api/gsc-coverage.js` — 매일 **07:40 KST**(`40 22 * * *`).
  워치리스트(`api/_seo-watchlist.js` = 뭉게 이전 통합 타겟 52편 + 포스트 사이트맵 최신 15편, 최대 70)를
  GSC URL 검사(Inspection API)로 훑어 `indexed / crawled_not_indexed / unknown` 카운트 + 미발견 URL 목록을
  Supabase `gsc_coverage(date, site, ...)` 에 upsert. 동시성 6, `maxDuration=60`.
  - **왜 분리했나**: URL 검사는 호출당 1~3초라 리포트 안에서 인라인으로 돌리면 함수 타임아웃(리포트 자체 실패).
    수집을 20분 먼저 돌려 스냅샷만 남기고, 리포트는 그걸 "읽기만" 한다.
- **표시** `api/_report.js` → `seoTrendLines()` — `reportMessage()` 의 GSC 블록 뒤에 주입.
  1. **구글 색인 커버리지 추이** — 오늘 vs 직전 스냅샷(`gsc_coverage` 최근 2행) 색인/크롤-미색인/미발견 전일 대비 증감
  2. **미발견 액션 목록** — 오늘 미발견 URL 상위 5(IndexNow 제출됨·구글 색인요청 대상)
  3. **GSC 주간 추세** — `gsc_daily` 최근7일 vs 직전7일 클릭·노출·CTR·평균순위 증감
  4. **Bing** — 미연동 표기(색인·노출은 Bing Webmaster API 키 필요, IndexNow 제출만 진행 중)

## 데이터

- `gsc_coverage` — 신규 테이블. RLS on + anon SELECT/INSERT/UPDATE(기존 `gsc_daily` 와 동일 패턴).
  Management API(`sbp_` 토큰)로 생성. PK=(date, site).
- `gsc_daily` — 기존. `daily-report` 가 `syncGsc()` 로 매일 upsert(date,source='mg',page,clicks,impressions,ctr,position).

## 트리거 / 미리보기

- 수집 수동: `GET /api/gsc-coverage?secret=CRON_SECRET`
- 리포트 미리보기(부작용 없음): 텔레그램 봇에 `/report` — 관리자에게만 전송, 뉴스레터 미발송.
  (`daily-report` 직접 호출은 월·수·금 뉴스레터 발송 게이트가 있어 테스트로 쓰지 말 것.)

## 남은 일 / 확장

- **Bing 연동**: Bing Webmaster Tools API 키 확보 후 색인·노출 수치 추가.
- 워치리스트 갱신: `naver-syndication/gsc-submit-urls.txt` 에서 `api/_seo-watchlist.js` 재생성.
- 커버리지 표본 확대(전체 포스트) 시 검사 쿼터/시간 재검토(현재 표본 최대 70편).
