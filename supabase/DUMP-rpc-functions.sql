-- ─────────────────────────────────────────────────────────────
-- Supabase public 스키마 함수(RPC) 실 정의 덤프
-- ─────────────────────────────────────────────────────────────
-- 목적: 대시보드가 호출하는 RPC 중 일부가 이 레포에 SQL 정의가 없다
--       (Supabase SQL Editor에서만 만들어짐). 아래 쿼리로 실 DDL을 뽑아
--       supabase/functions-dump.sql 로 저장·커밋하면 스키마가 코드로 백업된다.
--
-- 사용법:
--   1) Supabase 대시보드 → SQL Editor
--   2) [A] 실행 → 함수별 행(function/args/ddl) 확인
--   3) [B] 실행 → full_dump 한 셀을 통째로 복사 → supabase/functions-dump.sql 로 저장
--   4) git add supabase/functions-dump.sql && commit  (실 정의가 레포에 백업됨)
-- ─────────────────────────────────────────────────────────────

-- [A] 함수 목록 + 개별 DDL
select
  p.proname                                        as function,
  pg_get_function_identity_arguments(p.oid)        as args,
  pg_get_functiondef(p.oid)                        as ddl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
order by p.proname;

-- [B] 전체를 하나의 스크립트로 (이 결과 1셀을 functions-dump.sql 로 저장)
select string_agg(pg_get_functiondef(p.oid), E'\n\n-- ---------------------------------------------------------------\n\n')
         as full_dump
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f';

-- [C] (선택) 대시보드가 실제로 호출하는 RPC만 골라 존재 여부 확인
select fn as expected,
       exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = fn
       ) as installed
from unnest(array[
  'get_traffic_summary','get_hourly_views','get_top_pages','get_recent_events',
  'get_top_liked_posts','get_daily_detail','get_daily_hourly_heatmap','get_daily_device_trend',
  'get_comment_stats','get_all_comments','get_comment_trend','admin_reply','admin_delete_comment'
]) as fn
order by installed, expected;
