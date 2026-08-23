-- ============================================================
-- comments 직접조회 누수 차단 — 2026-08-24 anon 키 재감사(현행 트리 기준)
-- 프로젝트: xyprbsmagtlzebxyxsvj
-- 실행: Supabase Dashboard → SQL Editor → 전체 붙여넣고 Run
--
-- [재감사 결론]
--   • 확정 누수: comments 직접 SELECT(`comments_select USING(true)`)로 password_hash·ip_hash 노출.
--     앱은 comments 를 RPC(get_comments/get_all_comments)로만 읽고, 그 RPC 는 curated 컬럼만
--     반환하므로 이 직접조회 경로만 막으면 됨.
--   • 이미 안전(조치 불필요): threads_accounts/queue/posts/engage/replies (RLS on + 정책 전무=기본거부,
--     access_token 노출 없음), newsletter_subscribers·bot_state·excluded_uas·comment_reports(RLS 보호).
--   • 본 마이그레이션 범위 밖(설계상 anon 직접조회): analytics·gsc_daily 는 대시보드가 직접 읽어
--     잠그면 대시보드가 깨짐 → 별도 결정(대시보드 RPC 전환/인증) 필요. 여기서 건드리지 않음.
--
-- [왜 RPC 를 SECURITY DEFINER 로 바꾸나]
--   현재 comments RPC 는 전부 INVOKER 라 `comments_select USING(true)` 에 의존한다.
--   정책만 지우면:
--     - get_*      : 내부 SELECT 가 RLS 에 막혀 빈 결과
--     - submit/report: INSERT ... RETURNING 이 RLS SELECT 에 막혀 id 회수 실패
--     - delete_comment: 내부에서 password_hash 를 SELECT 해 검증하므로 조회 불가로 삭제 실패
--   → 이들을 DEFINER(고정 search_path)로 돌려 RLS 를 우회하게 한다. 반환/삽입 컬럼은 그대로라
--     보안 노출면은 늘지 않는다(오히려 직접 select=* 경로가 닫힘).
-- ============================================================

begin;

-- 1) 직접조회 누수 정책 제거 (password_hash·ip_hash 노출 차단)
drop policy if exists "comments_select" on comments;
drop policy if exists "reports_select"  on comment_reports;
-- 제거 후 anon 이 GET /rest/v1/comments?select=* 하면 RLS 기본거부로 [] 만 반환.

-- 2) comments 관련 RPC 를 SECURITY DEFINER + 고정 search_path 로 전환
--    (pgcrypto crypt/gen_salt 는 Supabase extensions 스키마)
--    레포와 라이브 시그니처가 다를 수 있어 이름 기반으로 실제 오버로드를 찾아 ALTER.
do $$
declare
  fn text;
  r  record;
  comment_rpcs text[] := array[
    'get_comments','get_all_comments','get_comment_stats','get_comment_trend',
    'submit_comment','report_comment','delete_comment'
  ];
begin
  foreach fn in array comment_rpcs loop
    for r in
      select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
    loop
      execute format('alter function %s security definer set search_path = public, extensions, pg_temp', r.sig);
    end loop;
  end loop;
end $$;

commit;

-- ============================================================
-- 검증 (실행 후)
-- ============================================================
-- (a) RPC 가 DEFINER 로 바뀌었는지:
--   select proname, prosecdef from pg_proc
--   where proname in ('get_comments','get_all_comments','submit_comment','delete_comment')
--   order by proname;   -- prosecdef 전부 true
--
-- (b) anon 키로 직접조회가 막혔는지(로컬):
--   GET /rest/v1/comments?select=*                → [] (password_hash 더는 안 나옴)
--   POST /rest/v1/rpc/get_comments {"p_slug":"...","p_source":"blog"}  → 정상(댓글 표시)
--   POST /rest/v1/rpc/submit_comment {...}        → 정상(댓글 작성)
--   대시보드 댓글 탭(get_all_comments/get_comment_stats/get_comment_trend) → 정상 로드
--
-- ============================================================
-- ⚠️ 범위 밖 — 별도 조치 권장(이번엔 안 건드림)
-- ============================================================
-- 1) 관리자 키 하드코딩('123123')이 admin_* RPC 다수에 공유. Vercel 함수 12/12 상한이라
--    새 함수 불가 → api/comment-webhook.js 에 삭제/답변 모드를 얹어 COMMENT_ADMIN_KEY+service_role 로
--    이전하는 게 정석. (Tier B)
-- 2) analytics·gsc_daily 가 대시보드에서 anon 직접조회 → 트래픽/SEO 통계가 공개.
--    자격증명은 아니나 비즈니스 데이터. 대시보드 직접fetch 를 DEFINER RPC 로 전환하거나
--    대시보드를 인증 뒤로 옮기면 차단. (Tier C)
