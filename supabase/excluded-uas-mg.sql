-- 뭉게(pageview_mg) 도 UA 제외 대상에 포함시킨다.
--
-- 왜: excluded_uas 의 플립은 event_type='pageview' 만 대상이라, 뭉게 방문(pageview_mg)은
-- "이 기기 제외 추가" 를 눌러도 계속 집계됐다. 뭉게는 GA4(Site Kit)가 SSOT 라 소급 제외가
-- 불가능하지만, 자체 트래커 기준 수치만큼은 내 방문을 뺄 수 있어야 한다.
--
-- 플립 규칙: pageview_mg -> pageview_mg_bot  (대시보드의 뭉게 집계는 pageview_mg 만 읽는다)
-- 되돌리기: UPDATE analytics SET event_type='pageview_mg' WHERE event_type='pageview_mg_bot';

CREATE OR REPLACE FUNCTION public.flag_excluded_pageviews() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE n int;
BEGIN
  UPDATE analytics a SET event_type =
      CASE a.event_type WHEN 'pageview' THEN 'pageview_bot' ELSE 'pageview_mg_bot' END
  WHERE a.event_type IN ('pageview', 'pageview_mg')
    AND a.metadata->>'user_agent' IN (SELECT ua FROM public.excluded_uas);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.flag_excluded_pageviews() TO anon;

CREATE OR REPLACE FUNCTION public.admin_add_excluded_ua(
  p_ua text, p_note text, p_admin_key text
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE n int;
BEGIN
  IF p_admin_key != '123123' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF p_ua IS NULL OR length(trim(p_ua)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'empty_ua');
  END IF;
  INSERT INTO public.excluded_uas (ua, note) VALUES (trim(p_ua), p_note)
  ON CONFLICT (ua) DO UPDATE SET note = COALESCE(EXCLUDED.note, public.excluded_uas.note);
  UPDATE analytics SET event_type =
      CASE event_type WHEN 'pageview' THEN 'pageview_bot' ELSE 'pageview_mg_bot' END
  WHERE event_type IN ('pageview', 'pageview_mg') AND metadata->>'user_agent' = trim(p_ua);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object('success', true, 'flagged', n);
END; $fn$;
GRANT EXECUTE ON FUNCTION public.admin_add_excluded_ua(text, text, text) TO anon;

CREATE OR REPLACE FUNCTION public.admin_remove_excluded_ua(
  p_ua text, p_admin_key text
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE n int;
BEGIN
  IF p_admin_key != '123123' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;
  DELETE FROM public.excluded_uas WHERE ua = trim(p_ua);
  UPDATE analytics SET event_type =
      CASE event_type WHEN 'pageview_bot' THEN 'pageview' ELSE 'pageview_mg' END
  WHERE event_type IN ('pageview_bot', 'pageview_mg_bot') AND metadata->>'user_agent' = trim(p_ua);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object('success', true, 'restored', n);
END; $fn$;
GRANT EXECUTE ON FUNCTION public.admin_remove_excluded_ua(text, text) TO anon;

-- 목록 조회: 뭉게 플립 건수를 따로 보여준다(어느 쪽이 걸렸는지 구분 필요)
CREATE OR REPLACE FUNCTION public.admin_list_excluded_uas(
  p_admin_key text
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
  IF p_admin_key != '123123' THEN
    RETURN '[]'::json;
  END IF;
  RETURN COALESCE(
    (SELECT json_agg(row_to_json(t) ORDER BY t.created_at DESC)
     FROM (
       SELECT e.ua, e.note, e.created_at,
              (SELECT count(*) FROM analytics a
                WHERE a.event_type='pageview_bot'
                  AND a.metadata->>'user_agent' = e.ua) AS flagged,
              (SELECT count(*) FROM analytics a
                WHERE a.event_type='pageview_mg_bot'
                  AND a.metadata->>'user_agent' = e.ua) AS flagged_mg
       FROM public.excluded_uas e
     ) t),
    '[]'::json
  );
END; $fn$;
GRANT EXECUTE ON FUNCTION public.admin_list_excluded_uas(text) TO anon;
