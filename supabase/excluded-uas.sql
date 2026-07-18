-- ============================================================
-- 내 방문(관리자 본인) 집계 제외 — User-Agent 기준
-- 적용: Supabase 대시보드 → SQL Editor → 전체 실행 (1회)
--
-- 배경/설계
--   analytics 행에는 IP가 저장되지 않아 IP로 과거 로그를 소급 제외할 수 없다.
--   저장돼 있는 식별자는 metadata->>'user_agent'. 그래서 flag_bot_pageviews 와
--   동일한 "event_type 플립" 패턴을 재사용한다:
--     pageview  ->  pageview_bot   (모든 집계 RPC는 pageview 만 세므로 자동 제외)
--   이 방식은 RPC 수정 0, 완전 가역(제외 해제 시 되돌림), 과거+미래 모두 커버.
--
-- 커버 범위
--   과거: 제외목록에 UA 추가 즉시 해당 UA의 기존 pageview 를 소급 플립.
--   미래: 대시보드 새로고침(force)마다 flag_excluded_pageviews() 재호출 → 계속 플립.
--   모든 기기: 각 기기/브라우저에서 대시보드 "이 기기 제외"를 1회 누르면
--             그 기기의 UA 가 목록에 등록된다(기기마다 UA 가 다름).
--
-- ⚠️ 주의: 완전히 동일한 UA 문자열을 쓰는 다른 방문자가 있으면 함께 제외된다.
--          (풀 UA 는 브라우저/OS 빌드까지 포함해 비교적 구체적이라 충돌은 드묾)
--
-- 되돌리기(전체 해제):
--   DELETE FROM excluded_uas;
--   UPDATE analytics SET event_type='pageview' WHERE event_type='pageview_bot';
--   -- (그 뒤 대시보드 새로고침하면 flag_bot_pageviews 가 진짜 봇만 다시 플립)
-- ============================================================

-- 1) 제외 대상 UA 목록
CREATE TABLE IF NOT EXISTS public.excluded_uas (
  ua         text PRIMARY KEY,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.excluded_uas ENABLE ROW LEVEL SECURITY;
-- 직접 REST 접근은 막고(정책 없음 = 접근 불가), 아래 SECURITY DEFINER 함수로만 조작한다.

-- 2) 제외목록에 있는 UA 의 pageview 를 pageview_bot 으로 플립 (과거 소급 + 미래 반복)
--    anon 이 호출 → 대시보드 force 로드에서 flag_bot_pageviews 옆에 같이 호출한다.
CREATE OR REPLACE FUNCTION public.flag_excluded_pageviews() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE n int;
BEGIN
  UPDATE analytics a SET event_type='pageview_bot'
  WHERE a.event_type='pageview'
    AND a.metadata->>'user_agent' IN (SELECT ua FROM public.excluded_uas);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.flag_excluded_pageviews() TO anon;

-- 3) 관리자: UA 추가 (추가 즉시 소급 플립까지 수행)
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
  UPDATE analytics SET event_type='pageview_bot'
  WHERE event_type='pageview' AND metadata->>'user_agent' = trim(p_ua);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object('success', true, 'flagged', n);
END; $fn$;
GRANT EXECUTE ON FUNCTION public.admin_add_excluded_ua(text, text, text) TO anon;

-- 4) 관리자: UA 제거 (목록에서 빼고, 그 UA 의 pageview_bot 을 pageview 로 복원)
--    복원 후 다음 force 로드의 flag_bot_pageviews 가 진짜 봇만 다시 플립한다.
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
  UPDATE analytics SET event_type='pageview'
  WHERE event_type='pageview_bot' AND metadata->>'user_agent' = trim(p_ua);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object('success', true, 'restored', n);
END; $fn$;
GRANT EXECUTE ON FUNCTION public.admin_remove_excluded_ua(text, text) TO anon;

-- 5) 관리자: 목록 조회 (UA 별 현재 제외 중인 pageview_bot 건수 병기)
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
                  AND a.metadata->>'user_agent' = e.ua) AS flagged
       FROM public.excluded_uas e
     ) t),
    '[]'::json
  );
END; $fn$;
GRANT EXECUTE ON FUNCTION public.admin_list_excluded_uas(text) TO anon;
