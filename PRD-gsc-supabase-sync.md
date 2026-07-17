# PRD — GSC 통계 Supabase 저장 + 대시보드 노출/클릭 표시

## 배경
- 대시보드 트래픽 수치 = 클라이언트 비콘(`analytics` 테이블) 기준 → **애드블록에 막혀 과소집계**. (handheld 글: GSC 클릭 7/12부터인데 비콘엔 7/16부터만 잡힘)
- GSC API는 이미 연동됨(`api/_gsc.js`, 서비스계정). 단 **실시간 조회만**(텔레그램 `/gsc`·일일리포트), Supabase 저장 X, 웹 대시보드에 없음.

## 목표
1. GSC 일별·페이지별 **클릭·노출·CTR·평균순위**를 Supabase `gsc_daily`에 저장(upsert).
2. 웹 대시보드에서 GSC **클릭 + 노출수** + 상위 페이지를 정확 수치로 표시.

## 설계
- **테이블** `gsc_daily(date, source, page, clicks, impressions, ctr, position, updated_at)` PK(date,source,page). `page='_TOTAL_'`=사이트 일별 합계. SQL=`db/gsc_daily.sql`(사용자 콘솔 1회 실행).
- **동기화** `api/_gsc-sync.js` `syncGsc({days})` — gscSite 있는 블로그별 GSC를 [date×page]+[date] 로 뽑아 upsert. GSC 2일 랙 반영(end=2일전).
  - 엔드포인트 `api/gsc-sync.js` — `?days=N&secret=` 백필용(초기 30일). CRON_SECRET 게이트.
  - `daily-report.js`에 `syncGsc({days:5})` best-effort 호출(GH Actions 매일) → 신규 크론슬롯 불필요(Vercel Hobby 2개 제한 회피).
- **읽기** `api/gsc-stats.js` — `gsc_daily` 집계 → 블로그별 {clicks, impressions, ctr, pages[], daily{}}.
- **대시보드** `dashboard.astro` — "검색 실적(GSC)" 카드: 클릭/노출/CTR/순위 + 상위 페이지(노출·클릭). 5분 캐시 fetch.

## 주의
- GSC 클릭 ≠ 비콘 페이지뷰(다른 지표) → **별도 병기**(대체 아님).
- 2~3일 랙(최근 이틀 후행 채움).
- anon 키 write = 기존 `analytics` 패턴과 동일(비민감 집계 데이터). RLS: anon select/insert/update 허용.
- env `GOOGLE_SA_EMAIL`/`GOOGLE_SA_PRIVATE_KEY` 필요(이미 세팅됨=현 GSC 조회 동작).

## 검증
- 로컬 SA키 없음 → 라이브 동기화는 배포 후 `/api/gsc-sync?days=30&secret=` 수동 백필로 확인.
- `astro build` 통과 + API `node --check`.
