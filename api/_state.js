// 봇 대화 상태 저장 (서버리스는 상태가 없으므로 Supabase 테이블 사용)
// /newpost, /edit 처럼 "제목 입력 → 본문 입력" 다단계 흐름에 필요.
// supabase/bot-control.sql 의 SECURITY DEFINER RPC 경유 (관리자 키 검증).

import { supabaseRpc } from './_shared.js';

function adminKey() {
  const k = process.env.COMMENT_ADMIN_KEY;
  if (!k) throw new Error('COMMENT_ADMIN_KEY 미설정');
  return k;
}

export async function setState(chatId, value) {
  await supabaseRpc('bot_state_set', {
    p_chat: String(chatId),
    p_value: value,
    p_admin_key: adminKey(),
  });
}

export async function getState(chatId) {
  const { data } = await supabaseRpc('bot_state_get', {
    p_chat: String(chatId),
    p_admin_key: adminKey(),
  });
  return data && typeof data === 'object' && Object.keys(data).length ? data : null;
}

export async function clearState(chatId) {
  await supabaseRpc('bot_state_clear', {
    p_chat: String(chatId),
    p_admin_key: adminKey(),
  });
}
