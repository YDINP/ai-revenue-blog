-- ============================================================
-- 관리자 댓글 삭제/답변 수정 마이그레이션
-- 적용: Supabase 대시보드 → SQL Editor → 아래 전체 붙여넣고 Run
-- ------------------------------------------------------------
-- 문제: admin_delete_comment / admin_reply 가 SECURITY DEFINER 가 아니라서
--       anon 역할로 실행됨. comments 테이블 RLS 의 comments_delete 정책이
--       USING(false) 이므로 삭제가 차단되는데도 함수는 success 를 반환 → "삭제 안 됨".
-- 해결: 두 함수를 SECURITY DEFINER 로 재정의(RLS 우회). 삭제는 자식 답글까지
--       함께 지우고 실제 삭제행수(deleted)를 반환.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_delete_comment(p_id uuid, p_admin_key text)
RETURNS json AS $$
DECLARE n int;
BEGIN
  IF p_admin_key != 'blog-admin-2026!' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;
  DELETE FROM comments WHERE id = p_id OR parent_id = p_id;  -- 대상 + 자식 답글
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN json_build_object('success', true, 'deleted', n);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_reply(
  p_parent_id uuid, p_slug text, p_source text, p_content text, p_admin_key text
)
RETURNS json AS $$
DECLARE new_id uuid;
BEGIN
  IF p_admin_key != 'blog-admin-2026!' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;
  INSERT INTO comments (post_slug, source, nickname, password_hash, content, parent_id, is_admin)
  VALUES (p_slug, p_source, '관리자', '', p_content, p_parent_id, true)
  RETURNING id INTO new_id;
  RETURN json_build_object('id', new_id, 'success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (선택) 진단 중 삽입된 테스트 댓글 정리
DELETE FROM comments WHERE post_slug = '__diagtest__'
  OR content IN ('diag-delete-me','diag','테스트 답변 diag','diag reply raw','diag-ui-reply','live diag reply');
