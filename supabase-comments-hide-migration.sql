-- =============================================
-- 댓글 감추기 기능 마이그레이션
-- Supabase SQL Editor에서 실행
-- (기본 comments 테이블이 이미 존재해야 함)
-- =============================================

-- 1. is_hidden 컬럼 추가
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- 2. 댓글 감추기/보이기 토글 RPC
CREATE OR REPLACE FUNCTION public.toggle_comment_visibility(p_comment_id bigint)
RETURNS json AS $$
DECLARE
  v_current boolean;
BEGIN
  SELECT c.is_hidden INTO v_current
  FROM public.comments c
  WHERE c.id = p_comment_id;

  IF v_current IS NULL THEN
    RETURN json_build_object('success', false, 'message', '댓글을 찾을 수 없습니다.');
  END IF;

  UPDATE public.comments SET is_hidden = NOT v_current WHERE id = p_comment_id;

  RETURN json_build_object(
    'success', true,
    'is_hidden', NOT v_current,
    'message', CASE WHEN NOT v_current THEN '댓글이 숨겨졌습니다.' ELSE '댓글이 다시 표시됩니다.' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. get_comments 함수 업데이트 (is_hidden 필터 + include_hidden 파라미터)
CREATE OR REPLACE FUNCTION public.get_comments(
  p_post_slug text,
  p_blog_source text DEFAULT 'techflow',
  p_include_hidden boolean DEFAULT false
)
RETURNS TABLE (
  id bigint,
  post_slug text,
  blog_source text,
  author_name text,
  content text,
  created_at timestamptz,
  is_hidden boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.post_slug, c.blog_source, c.author_name, c.content, c.created_at, c.is_hidden
  FROM public.comments c
  WHERE c.post_slug = p_post_slug
    AND c.blog_source = p_blog_source
    AND (p_include_hidden = true OR c.is_hidden = false)
  ORDER BY c.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
