-- ============================================================
-- 방문 추이 웹/모바일 분리: 일별 디바이스 집계 RPC
-- 적용: Supabase 대시보드 → SQL Editor → 아래 전체 실행
--
-- pageview metadata->>'user_agent' 로 모바일/웹 분류.
-- 일자 버킷은 get_daily_detail 과 동일하게 KST(+9h) 기준.
-- (검증: 2026-07-12 KST 자정 이후 pageview 54건 = get_daily_detail
--  당일 views 54 일치 → 기존 RPC가 KST 버킷임을 확인)
-- ============================================================

CREATE OR REPLACE FUNCTION get_daily_device_trend(p_days int DEFAULT 180)
RETURNS json AS $$
  SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.day ASC), '[]'::json)
  FROM (
    SELECT
      ((created_at + interval '9 hours')::date)::text AS day,
      count(*) FILTER (WHERE metadata->>'user_agent' ~* 'Mobi|Android|iPhone|iPad')          AS mobile_views,
      count(*) FILTER (WHERE coalesce(metadata->>'user_agent','') !~* 'Mobi|Android|iPhone|iPad') AS web_views,
      count(DISTINCT metadata->>'user_agent') FILTER (WHERE metadata->>'user_agent' ~* 'Mobi|Android|iPhone|iPad')          AS mobile_visitors,
      count(DISTINCT metadata->>'user_agent') FILTER (WHERE coalesce(metadata->>'user_agent','') !~* 'Mobi|Android|iPhone|iPad') AS web_visitors
    FROM analytics
    WHERE event_type = 'pageview'
      AND created_at >= (now() + interval '9 hours')::date - (p_days::text || ' days')::interval - interval '9 hours'
    GROUP BY 1
  ) t;
$$ LANGUAGE sql STABLE;

-- 동작 확인:
-- SELECT get_daily_device_trend(7);
