-- 봇 트래픽 플래그: 조회수 과대집계를 막는다.
-- 같은 UA가 하루 종일 같은 몇 페이지를 반복 재접속(순위추적/모니터링 봇) → event_type='pageview_bot' 로 표시.
-- 모든 집계 RPC가 event_type='pageview' 만 세므로, 표시만 바꾸면 대시보드 전체에서 자동 제외된다(RPC 수정 0, 완전 가역).
-- 되돌리기: UPDATE analytics SET event_type='pageview' WHERE event_type='pageview_bot';
-- 실행: SELECT public.flag_bot_pageviews();  (daily-report 크론 + 대시보드 force 로드에서 호출)
CREATE OR REPLACE FUNCTION public.flag_bot_pageviews() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE n1 int; n2 int;
BEGIN
  -- 1) 행동 휴리스틱: 같은 UA가 하루 10뷰↑ · 페이지 다양성 3↓ · 3시간↑ 걸쳐 = 재접속/순위추적 봇
  --    (실제 독자는 저뷰이거나 페이지 다양성이 높아 안 걸림; 3시간+ 확산 조건이 바이럴 버스트를 보호)
  WITH botua AS (
    SELECT metadata->>'user_agent' AS ua, (created_at AT TIME ZONE 'Asia/Seoul')::date AS d
    FROM analytics
    WHERE event_type='pageview' AND metadata->>'user_agent' IS NOT NULL
    GROUP BY 1,2
    HAVING count(*)>=10 AND count(DISTINCT metadata->>'path')<=3
       AND (max(created_at)-min(created_at))>=interval '3 hours'
  )
  UPDATE analytics a SET event_type='pageview_bot'
  FROM botua b
  WHERE a.event_type='pageview' AND a.metadata->>'user_agent'=b.ua
    AND (a.created_at AT TIME ZONE 'Asia/Seoul')::date=b.d;
  GET DIAGNOSTICS n1 = ROW_COUNT;

  -- 2) 선언형 봇 UA
  UPDATE analytics SET event_type='pageview_bot'
  WHERE event_type='pageview'
    AND metadata->>'user_agent' ~* '(bot|crawl|spider|slurp|bingbot|googlebot|yeti|daumoa|python-requests|curl/|wget|headlesschrome|semrush|ahrefs|mj12|dotbot|petalbot)';
  GET DIAGNOSTICS n2 = ROW_COUNT;

  RETURN n1 + n2;
END; $fn$;

GRANT EXECUTE ON FUNCTION public.flag_bot_pageviews() TO anon;
