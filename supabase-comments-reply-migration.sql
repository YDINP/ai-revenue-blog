-- =============================================
-- 대댓글(답글) 기능 마이그레이션
-- Supabase SQL Editor에서 실행
-- =============================================

-- 1. parent_id 컬럼 추가 (대댓글 트리 구조)
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES public.comments(id) ON DELETE CASCADE;

-- 2. parent_id 인덱스
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments (parent_id);

-- 3. get_comments 업데이트 (parent_id 포함)
DROP FUNCTION IF EXISTS public.get_comments(text, text, boolean);

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
  is_hidden boolean,
  parent_id bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.post_slug, c.blog_source, c.author_name, c.content, c.created_at, c.is_hidden, c.parent_id
  FROM public.comments c
  WHERE c.post_slug = p_post_slug
    AND c.blog_source = p_blog_source
    AND (p_include_hidden = true OR c.is_hidden = false)
  ORDER BY c.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. add_comment 업데이트 (p_parent_id 파라미터 추가)
CREATE OR REPLACE FUNCTION public.add_comment(
  p_post_slug text,
  p_blog_source text,
  p_author_name text,
  p_content text,
  p_password text,
  p_parent_id bigint DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_hash text;
  v_id bigint;
BEGIN
  IF length(trim(p_content)) < 1 THEN
    RETURN json_build_object('success', false, 'message', '댓글 내용을 입력해주세요.');
  END IF;
  IF length(trim(p_password)) < 2 THEN
    RETURN json_build_object('success', false, 'message', '비밀번호는 2자 이상이어야 합니다.');
  END IF;

  v_hash := encode(digest(p_password, 'sha256'), 'hex');

  INSERT INTO public.comments (post_slug, blog_source, author_name, content, password_hash, parent_id)
  VALUES (p_post_slug, p_blog_source, COALESCE(NULLIF(trim(p_author_name), ''), '익명'), trim(p_content), v_hash, p_parent_id)
  RETURNING id INTO v_id;

  RETURN json_build_object('success', true, 'message', '댓글이 등록되었습니다.', 'id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
