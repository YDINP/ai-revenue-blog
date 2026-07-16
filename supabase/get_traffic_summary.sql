-- ============================================================
-- get_traffic_summary — KST(Asia/Seoul) 기준으로 '오늘/어제' 집계
-- 적용: Supabase 대시보드 → SQL Editor → 전체 실행 (CREATE OR REPLACE)
--
-- 버그: 기존 함수는 `created_at >= CURRENT_DATE` 를 사용 → CURRENT_DATE 는
-- 세션 타임존(Supabase 기본 UTC)의 자정 기준이라, KST 00:00~09:00(=UTC 전날
-- 15:00~24:00)에 들어온 조회가 전부 '어제'로 새고 today_views 가 0으로 표시됨.
-- 수정: KST 달력 날짜의 자정을 timestamptz 로 환산해 경계로 사용.
--
-- 2026-07-16: tf_total_clicks / lf_total_clicks 추가. 대시보드가 이 두 필드를
-- 읽어 TechFlow/LifeFlow 총 클릭·CVR·쿠팡 소스별 상세를 표시하는데 기존 함수가
-- 반환하지 않아 해당 UI가 전부 0 / 0.00% 로 나오던 버그(라이브 검증으로 확인).
--
-- 2026-07-17: vip_today_views / vip_total_views 추가. VIP(playcast) 블로그를
-- 대시보드에 TF/LF와 동일 패턴으로 분리 집계(조회수만 — VIP는 쿠팡 클릭 없음).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_traffic_summary()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
  kst_today   date        := (now() AT TIME ZONE 'Asia/Seoul')::date;
  today_start timestamptz := (kst_today::timestamp)         AT TIME ZONE 'Asia/Seoul';  -- KST 오늘 00:00
  yest_start  timestamptz := ((kst_today - 1)::timestamp)   AT TIME ZONE 'Asia/Seoul';  -- KST 어제 00:00
BEGIN
  SELECT json_build_object(
    'today_views',      COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND created_at >= today_start), 0),
    'yesterday_views',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND created_at >= yest_start AND created_at < today_start), 0),
    'total_views',      COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview'), 0),
    'today_clicks',     COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND created_at >= today_start), 0),
    'total_clicks',     COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click'), 0),
    'today_likes',      COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'like' AND created_at >= today_start), 0),
    'total_likes',      COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'like'), 0),
    'today_subscribers', COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'newsletter_subscribe' AND created_at >= today_start), 0),
    'total_subscribers', COALESCE((SELECT count(*) FROM newsletter_subscribers WHERE is_active = true), 0),
    -- TechFlow (source = 'blog') 분리
    'tf_today_views',   COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source = 'blog' AND created_at >= today_start), 0),
    'tf_total_views',   COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source = 'blog'), 0),
    'tf_today_clicks',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source = 'blog' AND created_at >= today_start), 0),
    'tf_total_clicks',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source = 'blog'), 0),
    -- LifeFlow (source = 'lifeflow') 분리
    'lf_today_views',   COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source = 'lifeflow' AND created_at >= today_start), 0),
    'lf_total_views',   COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source = 'lifeflow'), 0),
    'lf_today_clicks',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source = 'lifeflow' AND created_at >= today_start), 0),
    'lf_total_clicks',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source = 'lifeflow'), 0),
    -- VIP (playcast, source = 'vip') — 조회수만(쿠팡 클릭 없음)
    'vip_today_views',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source = 'vip' AND created_at >= today_start), 0),
    'vip_total_views',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source = 'vip'), 0)
  ) INTO result;
  RETURN result;
END;
$function$;
