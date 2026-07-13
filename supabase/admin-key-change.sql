-- ============================================================
-- 관리자 키 변경: 'blog-admin-2026!' → '123123'
-- 적용: Supabase 대시보드 → SQL Editor → 전체 실행
--
-- 이 키 하나가 (1) 대시보드 진입 비밀번호 (2) 댓글 관리자 답변/삭제 RPC
-- (3) 봇 대화 상태 RPC 에 모두 쓰인다. 대시보드는 이 값을 localStorage 에
-- 저장해 재접속 시 자동 입장한다.
--
-- ⚠️ anon 키는 클라이언트에 공개돼 있으므로, 이 키를 아는 사람은 댓글 삭제/
--    관리자 답변을 할 수 있다. 짧은 비밀번호는 그만큼 추측이 쉽다.
--    나중에 바꾸려면 이 파일의 값과 Vercel 환경변수 COMMENT_ADMIN_KEY 만
--    같은 값으로 교체하면 된다.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_delete_comment(p_id uuid, p_admin_key text)
RETURNS json AS $$
DECLARE n int;
BEGIN
  IF p_admin_key != '123123' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;
  DELETE FROM comments WHERE id = p_id OR parent_id = p_id;   -- 대상 + 자식 답글
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
  IF p_admin_key != '123123' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;
  INSERT INTO comments (post_slug, source, nickname, password_hash, content, parent_id, is_admin)
  VALUES (p_slug, p_source, '관리자', '', p_content, p_parent_id, true)
  RETURNING id INTO new_id;
  RETURN json_build_object('id', new_id, 'success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION bot_state_set(p_chat text, p_value jsonb, p_admin_key text)
RETURNS json AS $$
BEGIN
  IF p_admin_key != '123123' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;
  INSERT INTO bot_state (chat_id, value, updated_at)
  VALUES (p_chat, p_value, now())
  ON CONFLICT (chat_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION bot_state_get(p_chat text, p_admin_key text)
RETURNS json AS $$
DECLARE v jsonb;
BEGIN
  IF p_admin_key != '123123' THEN
    RETURN '{}'::json;
  END IF;
  DELETE FROM bot_state WHERE updated_at < now() - interval '30 minutes';
  SELECT value INTO v FROM bot_state WHERE chat_id = p_chat;
  RETURN coalesce(v::json, '{}'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION bot_state_clear(p_chat text, p_admin_key text)
RETURNS json AS $$
BEGIN
  IF p_admin_key != '123123' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;
  DELETE FROM bot_state WHERE chat_id = p_chat;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
