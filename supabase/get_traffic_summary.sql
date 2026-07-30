-- ============================================================
-- get_traffic_summary — KST(Asia/Seoul) 기준으로 '오늘/어제' 집계
-- 적용: Supabase 대시보드 → SQL Editor → 전체 실행 (CREATE OR REPLACE)
--
-- 버그(2026-07 초): 기존 함수는 `created_at >= CURRENT_DATE` 를 사용 → CURRENT_DATE 는
-- 세션 타임존(Supabase 기본 UTC)의 자정 기준이라, KST 00:00~09:00(=UTC 전날
-- 15:00~24:00)에 들어온 조회가 전부 '어제'로 새고 today_views 가 0으로 표시됨.
-- 수정: KST 달력 날짜의 자정을 timestamptz 로 환산해 경계로 사용.
--
-- 2026-07-16: tf_total_clicks / lf_total_clicks 추가.
-- 2026-07-17: vip_today_views / vip_total_views 추가.
--
-- 2026-07-30 재편성 — TF(source='blog') · LF(source='lifeflow') 를 뭉게(mungge.com)로 301
-- 통합하면서 두 소스를 집계에서 제거했다.
--
--   · tf_* / lf_* 필드 삭제 → mg_* / vip_* 로 대체
--   · *_views 는 여전히 event_type='pageview' 기준이다. **뭉게 조회수는 여기 없다** —
--     뭉게는 GA4(ga4_daily)가 SSOT 이고 자체 트래커는 'pageview_mg' 라는 다른 이름을 쓴다.
--     같은 이름으로 세면 대시보드가 GA4 + 이 값을 더해 이중 집계된다(scripts/wp-track.js 주석).
--     → 여기서 pageview 는 실질적으로 VIP(playcast) 몫이고, 죽은 blog/lifeflow 는 제외한다.
--   · 클릭·좋아요는 analytics 이벤트가 유일한 소스라 소스별로 나눠 돌려준다.
--     뭉게 클릭은 2026-07-30 주입한 scripts/wp-affiliate.js 부터 들어온다.
--
-- LIVE_SOURCES = ('mg', 'vip', 'playcast') — 'vip'/'playcast' 는 같은 사이트의 두 표기다.
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
    -- ── 조회수 (event_type='pageview' · 살아 있는 소스만 = 실질 VIP) ──
    -- NOT IN 대신 IN 을 쓴다: source 가 NULL 인 옛 행은 `NULL NOT IN (...)` 이 NULL 로 평가돼
    -- 조용히 빠지므로 "왜 합이 안 맞나"를 추적할 수 없다. 세는 대상을 명시한다.
    'today_views',      COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source IN ('vip','playcast') AND created_at >= today_start), 0),
    'yesterday_views',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source IN ('vip','playcast') AND created_at >= yest_start AND created_at < today_start), 0),
    'total_views',      COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source IN ('vip','playcast')), 0),

    -- ── 쿠팡 클릭 (뭉게 + VIP) ──
    'today_clicks',     COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source IN ('mg','vip','playcast') AND created_at >= today_start), 0),
    'total_clicks',     COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source IN ('mg','vip','playcast')), 0),

    -- ── 좋아요 ──
    'today_likes',      COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'like' AND source IN ('mg','vip','playcast') AND created_at >= today_start), 0),
    'total_likes',      COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'like' AND source IN ('mg','vip','playcast')), 0),

    -- ── 구독 ──
    'today_subscribers', COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'newsletter_subscribe' AND created_at >= today_start), 0),
    'total_subscribers', COALESCE((SELECT count(*) FROM newsletter_subscribers WHERE is_active = true), 0),

    -- ── 뭉게 (source='mg') — 조회수는 GA4 가 SSOT 이므로 여기서는 내지 않는다 ──
    'mg_today_clicks',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source = 'mg' AND created_at >= today_start), 0),
    'mg_total_clicks',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source = 'mg'), 0),
    'mg_today_likes',   COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'like' AND source = 'mg' AND created_at >= today_start), 0),
    'mg_total_likes',   COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'like' AND source = 'mg'), 0),
    -- 자체 트래커 조회(pageview_mg) — GA4 배치 전 당일치 폴백 및 "트래커가 살아 있나" 확인용.
    -- ⚠️ GA4 수치와 더하지 말 것.
    'mg_live_today_views', COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview_mg' AND created_at >= today_start), 0),

    -- ── VIP (playcast) — analytics 표기가 'vip'/'playcast' 두 가지라 둘 다 센다 ──
    'vip_today_views',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source IN ('vip','playcast') AND created_at >= today_start), 0),
    'vip_total_views',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'pageview' AND source IN ('vip','playcast')), 0),
    'vip_today_clicks', COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source IN ('vip','playcast') AND created_at >= today_start), 0),
    'vip_total_clicks', COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source IN ('vip','playcast')), 0)
  ) INTO result;
  RETURN result;
END;
$function$;
