-- ============================================================
-- 텔레그램 봇 다단계 대화 상태 저장 (새 글 작성: 제목 → 본문 등)
-- 적용: Supabase 대시보드 → SQL Editor → 전체 실행
--
-- 서버리스(Vercel) 함수는 요청 간 상태가 없어 진행 중 흐름을 DB에 둔다.
-- 관리자 키로 게이트한 SECURITY DEFINER RPC만 열어 anon 직접 접근은 차단.
-- ============================================================

CREATE TABLE IF NOT EXISTS bot_state (
  chat_id text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bot_state ENABLE ROW LEVEL SECURITY;
-- 직접 접근 전면 차단 (RPC 경유만 허용)
DROP POLICY IF EXISTS bot_state_no_direct ON bot_state;
CREATE POLICY bot_state_no_direct ON bot_state FOR ALL USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION bot_state_set(p_chat text, p_value jsonb, p_admin_key text)
RETURNS json AS $$
BEGIN
  IF p_admin_key != 'blog-admin-2026!' THEN
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
  IF p_admin_key != 'blog-admin-2026!' THEN
    RETURN '{}'::json;
  END IF;
  -- 30분 지난 상태는 만료 처리 (작성하다 만 흐름이 영원히 남지 않도록)
  DELETE FROM bot_state WHERE updated_at < now() - interval '30 minutes';
  SELECT value INTO v FROM bot_state WHERE chat_id = p_chat;
  RETURN coalesce(v::json, '{}'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION bot_state_clear(p_chat text, p_admin_key text)
RETURNS json AS $$
BEGIN
  IF p_admin_key != 'blog-admin-2026!' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;
  DELETE FROM bot_state WHERE chat_id = p_chat;
  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
