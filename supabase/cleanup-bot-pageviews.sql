-- ============================================================
-- 봇/헤드리스 오염 pageview 정리 (1회성)
-- 적용: Supabase 대시보드 → SQL Editor → 실행
--
-- 배경: Claude 세션이 포스팅/수정 후 playwright(HeadlessChrome)로
-- 배포 페이지를 검증할 때마다 pageview 가 기록됨 (2026-07-12 기준
-- 4,458건 중 247건 = 5.5%). 클라이언트 가드는 추가됐고(BaseLayout,
-- navigator.webdriver + UA 정규식), 이 SQL은 과거 데이터 정리용.
-- ============================================================

-- 2026-07-15 추가: 검색엔진 크롤러(네이버 Yeti·다음 Daumoa)는 UA에 bot/spider 토큰이
-- 없어 기존 정규식에 안 걸림 → yeti|daumoa 만 추가(크롤러 전용). 네이버 서치어드바이저
-- '웹페이지 수집' 후 Yeti 크롤링이 조회수로 집계되던 문제를 소급 정리.
-- ⚠️ 'naver'/'yandex'/'baidu' 같은 넓은 토큰은 인앱브라우저 실사용자 UA(네이버앱=NAVER(inapp))
--    까지 매칭하므로 사용 금지. YandexBot·Baiduspider 는 bot|spider 로 이미 커버됨.

-- 2026-07-15 추가: Google 범용 크롤러 GoogleOther·Google-InspectionTool 은 UA 에 'bot' 토큰이
-- 없어 기존 정규식에 안 걸림(7/12 47건 조회수 오염 확인) → googleother|google-inspection 추가.

-- 삭제 전 확인 (건수 미리보기)
SELECT count(*) AS bot_pageviews
FROM analytics
WHERE event_type = 'pageview'
  AND metadata->>'user_agent' ~* 'bot|crawl|spider|headless|lighthouse|playwright|puppeteer|slurp|petalbot|bytespider|yeti|daumoa|googleother|google-inspection';

-- 삭제 실행
DELETE FROM analytics
WHERE event_type = 'pageview'
  AND metadata->>'user_agent' ~* 'bot|crawl|spider|headless|lighthouse|playwright|puppeteer|slurp|petalbot|bytespider|yeti|daumoa|googleother|google-inspection';
