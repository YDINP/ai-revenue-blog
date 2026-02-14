-- =============================================
-- 익명 댓글 시스템 마이그레이션
-- Supabase SQL Editor에서 실행
-- =============================================

-- 1. 확장 모듈 활성화 (비밀번호 해싱용)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. comments 테이블 생성
CREATE TABLE IF NOT EXISTS public.comments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_slug text NOT NULL,
  blog_source text NOT NULL DEFAULT 'techflow',  -- 'techflow' 또는 'lifeflow'
  author_name text NOT NULL DEFAULT '익명',
  content text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_comments_post_slug ON public.comments (post_slug, blog_source);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments (created_at DESC);

-- 4. RLS 활성화
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- 5. RLS 정책: 누구나 읽기 가능 (password_hash 제외는 뷰로 처리)
CREATE POLICY "comments_select_policy" ON public.comments
  FOR SELECT USING (true);

-- 6. RLS 정책: 누구나 삽입 가능
CREATE POLICY "comments_insert_policy" ON public.comments
  FOR INSERT WITH CHECK (true);

-- 7. RLS 정책: 삭제는 RPC를 통해서만 (직접 삭제 차단)
CREATE POLICY "comments_delete_policy" ON public.comments
  FOR DELETE USING (false);

-- 8. 댓글 조회 RPC (password_hash 제외)
CREATE OR REPLACE FUNCTION public.get_comments(p_post_slug text, p_blog_source text DEFAULT 'techflow')
RETURNS TABLE (
  id bigint,
  post_slug text,
  blog_source text,
  author_name text,
  content text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.post_slug, c.blog_source, c.author_name, c.content, c.created_at
  FROM public.comments c
  WHERE c.post_slug = p_post_slug
    AND c.blog_source = p_blog_source
  ORDER BY c.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. 댓글 삭제 RPC (비밀번호 검증)
CREATE OR REPLACE FUNCTION public.delete_comment(p_comment_id bigint, p_password text)
RETURNS json AS $$
DECLARE
  v_hash text;
  v_stored_hash text;
BEGIN
  -- 입력 비밀번호 해싱
  v_hash := encode(digest(p_password, 'sha256'), 'hex');

  -- 저장된 해시 조회
  SELECT c.password_hash INTO v_stored_hash
  FROM public.comments c
  WHERE c.id = p_comment_id;

  IF v_stored_hash IS NULL THEN
    RETURN json_build_object('success', false, 'message', '댓글을 찾을 수 없습니다.');
  END IF;

  IF v_hash != v_stored_hash THEN
    RETURN json_build_object('success', false, 'message', '비밀번호가 일치하지 않습니다.');
  END IF;

  -- 삭제 (SECURITY DEFINER로 RLS 우회)
  DELETE FROM public.comments WHERE id = p_comment_id;
  RETURN json_build_object('success', true, 'message', '댓글이 삭제되었습니다.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. 댓글 작성 RPC (비밀번호 자동 해싱)
CREATE OR REPLACE FUNCTION public.add_comment(
  p_post_slug text,
  p_blog_source text,
  p_author_name text,
  p_content text,
  p_password text
)
RETURNS json AS $$
DECLARE
  v_hash text;
  v_id bigint;
BEGIN
  -- 입력 검증
  IF length(trim(p_content)) < 1 THEN
    RETURN json_build_object('success', false, 'message', '댓글 내용을 입력해주세요.');
  END IF;
  IF length(trim(p_password)) < 2 THEN
    RETURN json_build_object('success', false, 'message', '비밀번호는 2자 이상이어야 합니다.');
  END IF;

  -- 비밀번호 해싱
  v_hash := encode(digest(p_password, 'sha256'), 'hex');

  -- 삽입
  INSERT INTO public.comments (post_slug, blog_source, author_name, content, password_hash)
  VALUES (p_post_slug, p_blog_source, COALESCE(NULLIF(trim(p_author_name), ''), '익명'), trim(p_content), v_hash)
  RETURNING id INTO v_id;

  RETURN json_build_object('success', true, 'message', '댓글이 등록되었습니다.', 'id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
