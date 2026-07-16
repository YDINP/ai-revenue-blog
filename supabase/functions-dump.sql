-- Supabase public 스키마 함수 전체 DDL 덤프 (자동 생성)
-- 생성: pg_get_functiondef via pg. 재생성: supabase/DUMP-rpc-functions.sql 참고
-- ⚠ 관리자 키 리터럴은 보안상 __ADMIN_KEY_REDACTED__ 로 치환됨(원문 아님). 실행 전 실제 키로 교체 필요.
-- 함수 수: 29

CREATE OR REPLACE FUNCTION public.admin_delete_comment(p_id uuid, p_admin_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE n int;
  BEGIN
    IF p_admin_key != '__ADMIN_KEY_REDACTED__' THEN
      RETURN json_build_object('success', false, 'error', 'unauthorized');
    END IF;
    DELETE FROM comments WHERE id = p_id OR parent_id = p_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN json_build_object('success', true, 'deleted', n);
  END;
  $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_reply(p_parent_id uuid, p_slug text, p_source text, p_content text, p_admin_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE new_id uuid;
  BEGIN
    IF p_admin_key != '__ADMIN_KEY_REDACTED__' THEN
      RETURN json_build_object('success', false, 'error', 'unauthorized');
    END IF;
    INSERT INTO comments (post_slug, source, nickname, password_hash, content, parent_id, is_admin)
    VALUES (p_slug, p_source, '관리자', '', p_content, p_parent_id, true)
    RETURNING id INTO new_id;
    RETURN json_build_object('id', new_id, 'success', true);
  END;
  $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bot_state_clear(p_chat text, p_admin_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  BEGIN
    IF p_admin_key != '__ADMIN_KEY_REDACTED__' THEN
      RETURN json_build_object('success', false, 'error', 'unauthorized');
    END IF;
    DELETE FROM bot_state WHERE chat_id = p_chat;
    RETURN json_build_object('success', true);
  END;
  $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bot_state_get(p_chat text, p_admin_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE v jsonb;
  BEGIN
    IF p_admin_key != '__ADMIN_KEY_REDACTED__' THEN RETURN '{}'::json; END IF;
    DELETE FROM bot_state WHERE updated_at < now() - interval '30 minutes';
    SELECT value INTO v FROM bot_state WHERE chat_id = p_chat;
    RETURN coalesce(v::json, '{}'::json);
  END;
  $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bot_state_set(p_chat text, p_value jsonb, p_admin_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  BEGIN
    IF p_admin_key != '__ADMIN_KEY_REDACTED__' THEN
      RETURN json_build_object('success', false, 'error', 'unauthorized');
    END IF;
    INSERT INTO bot_state (chat_id, value, updated_at)
    VALUES (p_chat, p_value, now())
    ON CONFLICT (chat_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    RETURN json_build_object('success', true);
  END;
  $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_vip_level(total_spent integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$ BEGIN RETURN CASE WHEN total_spent >= 200000 THEN 10 WHEN total_spent >= 100000 THEN 9 WHEN total_spent >= 50000 THEN 8 WHEN total_spent >= 20000 THEN 7 WHEN total_spent >= 10000 THEN 6 WHEN total_spent >= 5000 THEN 5 WHEN total_spent >= 3000 THEN 4 WHEN total_spent >= 1000 THEN 3 WHEN total_spent >= 500 THEN 2 WHEN total_spent >= 100 THEN 1 ELSE 0 END; END; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_comment(p_comment_id bigint, p_password text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE
    v_hash text;
    v_stored_hash text;
  BEGIN
    v_hash := encode(digest(p_password, 'sha256'), 'hex');
    SELECT c.password_hash INTO v_stored_hash
    FROM public.comments c
    WHERE c.id = p_comment_id;

    IF v_stored_hash IS NULL THEN
      RETURN json_build_object('success', false, 'message', '댓글을 찾을 수 없습니다.');
    END IF;

    IF v_hash != v_stored_hash THEN
      RETURN json_build_object('success', false, 'message', '비밀번호가 일치하지 않습니다.');
    END IF;

    DELETE FROM public.comments WHERE id = p_comment_id;
    RETURN json_build_object('success', true, 'message', '댓글이 삭제되었습니다.');
  END;
  $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_comment(p_id uuid, p_password text)
 RETURNS json
 LANGUAGE plpgsql
AS $function$ DECLARE stored_hash text; BEGIN SELECT password_hash INTO stored_hash FROM comments WHERE id = p_id; IF stored_hash IS NULL THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF; IF stored_hash = crypt(p_password, stored_hash) THEN DELETE FROM comments WHERE id = p_id; RETURN json_build_object('success', true); ELSE RETURN json_build_object('success', false, 'error', 'wrong_password'); END IF; END; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_all_comments(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$ SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT c.id, c.post_slug, c.source, c.nickname, c.content, c.parent_id, c.is_admin, c.created_at, (SELECT count(*) FROM comment_reports cr WHERE cr.comment_id = c.id) as report_count FROM comments c ORDER BY c.created_at DESC LIMIT p_limit OFFSET p_offset) t; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_comment_stats()
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$ SELECT json_build_object('total', (SELECT count(*) FROM comments), 'today', (SELECT count(*) FROM comments WHERE created_at >= CURRENT_DATE), 'reports', (SELECT count(DISTINCT comment_id) FROM comment_reports), 'blog_count', (SELECT count(*) FROM comments WHERE source = 'blog'), 'lifeflow_count', (SELECT count(*) FROM comments WHERE source = 'lifeflow')); $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_comment_trend()
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$ SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.day ASC), '[]'::json) FROM (SELECT date_trunc('day', created_at)::date as day, count(*) as count, count(*) FILTER (WHERE source = 'blog') as blog_count, count(*) FILTER (WHERE source = 'lifeflow') as lf_count FROM comments WHERE created_at >= CURRENT_DATE - INTERVAL '6 days' GROUP BY date_trunc('day', created_at)::date) t; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_comments(p_slug text, p_source text DEFAULT 'blog'::text)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$ SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.created_at ASC), '[]'::json) FROM (SELECT id, post_slug, nickname, content, parent_id, is_admin, created_at FROM comments WHERE post_slug = p_slug AND source = p_source) t; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_daily_detail(p_days integer DEFAULT 30)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE result json;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result FROM (
    SELECT
      (created_at AT TIME ZONE 'Asia/Seoul')::date::text AS day,
      count(*) AS views,
      count(DISTINCT (metadata->>'user_agent')) AS visitors,
      count(*) FILTER (WHERE source = 'blog') AS tf_views,
      count(*) FILTER (WHERE source = 'lifeflow') AS lf_views
    FROM analytics
    WHERE event_type = 'pageview'
      AND (created_at AT TIME ZONE 'Asia/Seoul')::date > ((now() AT TIME ZONE 'Asia/Seoul')::date - p_days)
    GROUP BY 1
    ORDER BY 1 DESC
  ) t;
  RETURN COALESCE(result, '[]'::json);
END; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_daily_device_trend(p_days integer DEFAULT 180)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
    SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.day ASC), '[]'::json)
    FROM (
      SELECT
        ((created_at + interval '9 hours')::date)::text AS day,
        count(*) FILTER (WHERE metadata->>'user_agent' ~* 'Mobi|Android|iPhone|iPad')          AS mobile_views,
        count(*) FILTER (WHERE coalesce(metadata->>'user_agent','') !~* 'Mobi|Android|iPhone|iPad') AS web_views,
        count(DISTINCT metadata->>'user_agent') FILTER (WHERE metadata->>'user_agent' ~* 'Mobi|Android|iPhone|iPad')          AS
  mobile_visitors,
        count(DISTINCT metadata->>'user_agent') FILTER (WHERE coalesce(metadata->>'user_agent','') !~* 'Mobi|Android|iPhone|iPad') AS
  web_visitors
      FROM analytics
      WHERE event_type = 'pageview'
        AND created_at >= (now() + interval '9 hours')::date - (p_days::text || ' days')::interval - interval '9 hours'
      GROUP BY 1
    ) t;
  $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_daily_hourly_heatmap(p_days integer DEFAULT 14)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE result json;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result FROM (
    SELECT
      (created_at AT TIME ZONE 'Asia/Seoul')::date::text AS day,
      EXTRACT(hour FROM created_at AT TIME ZONE 'Asia/Seoul')::int AS hour,
      count(*) AS views
    FROM analytics
    WHERE event_type = 'pageview'
      AND (created_at AT TIME ZONE 'Asia/Seoul')::date > ((now() AT TIME ZONE 'Asia/Seoul')::date - p_days)
    GROUP BY 1, 2
    ORDER BY 1, 2
  ) t;
  RETURN COALESCE(result, '[]'::json);
END; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_daily_trend()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result FROM (
    SELECT 
      (created_at AT TIME ZONE 'Asia/Seoul')::date AS day,
      count(*) AS views,
      count(*) FILTER (WHERE source = 'blog') AS tf_views,
      count(*) FILTER (WHERE source = 'lifeflow') AS lf_views
    FROM analytics
    WHERE event_type = 'pageview' 
      AND created_at >= (CURRENT_DATE - INTERVAL '6 days')
    GROUP BY day
    ORDER BY day
  ) t;
  RETURN COALESCE(result, '[]'::json);
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_dashboard_summary()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total_posts', (SELECT count(*) FROM public.blog_posts),
    'total_views', (SELECT coalesce(sum(views), 0) FROM public.blog_posts),
    'categories', (
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT category, count(*) as post_count, coalesce(sum(views), 0) as total_views
        FROM public.blog_posts
        GROUP BY category
        ORDER BY post_count DESC
      ) t
    ),
    'recent_posts', (
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT slug, title, category, pub_date, views
        FROM public.blog_posts
        ORDER BY pub_date DESC
        LIMIT 10
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_hourly_views()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result FROM (
    SELECT 
      EXTRACT(hour FROM created_at AT TIME ZONE 'Asia/Seoul') AS hour,
      count(*) AS views,
      count(*) FILTER (WHERE source = 'blog') AS tf_views,
      count(*) FILTER (WHERE source = 'lifeflow') AS lf_views
    FROM analytics
    WHERE event_type = 'pageview' AND created_at >= CURRENT_DATE
    GROUP BY hour
    ORDER BY hour
  ) t;
  RETURN COALESCE(result, '[]'::json);
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_onul_puzzle_stats(p_puzzle_id text, p_hints_used integer DEFAULT NULL::integer)
 RETURNS TABLE(total_plays bigint, solved_count bigint, solve_rate numeric, avg_hints numeric, top_percent numeric, distribution jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with p as (
    select * from public.onul_plays where puzzle_id = p_puzzle_id
  ),
  s as (
    select * from p where solved = true
  )
  select
    (select count(*) from p)                                            as total_plays,
    (select count(*) from s)                                            as solved_count,
    case when (select count(*) from p) = 0 then 0
         else round(100.0 * (select count(*) from s) / (select count(*) from p), 0)
    end                                                                 as solve_rate,
    case when (select count(*) from s) = 0 then null
         else round(avg(s.hints_used), 1)
    end                                                                 as avg_hints,
    case
      when p_hints_used is null then null
      when (select count(*) from s) = 0 then null
      else greatest(1, round(
        100.0 * (
          (select count(*) from s where s.hints_used < p_hints_used)
          + 0.5 * (select count(*) from s where s.hints_used = p_hints_used)
        ) / (select count(*) from s), 0))
    end                                                                 as top_percent,
    jsonb_build_array(
      (select count(*) from s where s.hints_used = 1),
      (select count(*) from s where s.hints_used = 2),
      (select count(*) from s where s.hints_used = 3),
      (select count(*) from s where s.hints_used = 4),
      (select count(*) from s where s.hints_used = 5),
      (select count(*) from p where p.solved = false)
    )                                                                   as distribution
  from s;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_recent_events(p_limit integer DEFAULT 20)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result FROM (
    SELECT 
      event_type,
      source,
      metadata->>'slug' AS slug,
      metadata->>'title' AS title,
      metadata->>'path' AS path,
      metadata->>'product' AS product,
      metadata->>'referrer' AS referrer,
      created_at
    FROM analytics
    ORDER BY created_at DESC
    LIMIT p_limit
  ) t;
  RETURN COALESCE(result, '[]'::json);
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_top_liked_posts(p_limit integer DEFAULT 10)
 RETURNS TABLE(slug text, path text, title text, source text, like_count bigint, last_liked_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    COALESCE(metadata->>'slug', '') AS slug,
    COALESCE(metadata->>'path', '') AS path,
    COALESCE(metadata->>'title', '') AS title,
    COALESCE(analytics.source, 'blog') AS source,
    COUNT(*) AS like_count,
    MAX(created_at) AS last_liked_at
  FROM analytics
  WHERE event_type = 'like'
    AND metadata->>'slug' IS NOT NULL
    AND metadata->>'slug' != ''
  GROUP BY metadata->>'slug', metadata->>'path', metadata->>'title', analytics.source
  ORDER BY like_count DESC
  LIMIT p_limit;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_top_pages(p_limit integer DEFAULT 10)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result FROM (
    SELECT 
      metadata->>'slug' AS slug,
      metadata->>'path' AS path,
      metadata->>'title' AS title,
      source,
      count(*) AS views
    FROM analytics
    WHERE event_type = 'pageview' AND metadata->>'slug' IS NOT NULL AND metadata->>'slug' != ''
    GROUP BY metadata->>'slug', metadata->>'path', metadata->>'title', source
    ORDER BY views DESC
    LIMIT p_limit
  ) t;
  RETURN COALESCE(result, '[]'::json);
END;
$function$


-- ------------------------------------------------------------

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
    'lf_total_clicks',  COALESCE((SELECT count(*) FROM analytics WHERE event_type = 'coupang_click' AND source = 'lifeflow'), 0)
  ) INTO result;
  RETURN result;
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_page_views(post_slug text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.blog_posts
  SET views = views + 1, updated_at = now()
  WHERE slug = post_slug;
END;
$function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.report_comment(p_comment_id uuid, p_reason text DEFAULT ''::text)
 RETURNS json
 LANGUAGE plpgsql
AS $function$ DECLARE new_id uuid; BEGIN INSERT INTO comment_reports (comment_id, reason) VALUES (p_comment_id, p_reason) RETURNING id INTO new_id; RETURN json_build_object('id', new_id, 'success', true); END; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reset_daily_sweep_count()
 RETURNS void
 LANGUAGE plpgsql
AS $function$ BEGIN UPDATE player_data SET sweep_count_today = 0, sweep_reset_date = CURRENT_DATE WHERE sweep_reset_date < CURRENT_DATE; END; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_comment(p_slug text, p_source text, p_nickname text, p_password text, p_content text, p_parent_id uuid DEFAULT NULL::uuid, p_ip_hash text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
AS $function$ DECLARE new_id uuid; BEGIN INSERT INTO comments (post_slug, source, nickname, password_hash, content, parent_id, ip_hash) VALUES (p_slug, p_source, p_nickname, crypt(p_password, gen_salt('bf')), p_content, p_parent_id, p_ip_hash) RETURNING id INTO new_id; RETURN json_build_object('id', new_id, 'success', true); END; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$


-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_vip_level()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.vip_level = calculate_vip_level(NEW.total_gems_spent); RETURN NEW; END; $function$

