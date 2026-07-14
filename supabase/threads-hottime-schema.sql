-- 핫타임 마커: 알림 발송 시각. 사용자가 발행/예약하면 null로 클리어(=상호작용함).
-- resolve 시 이 값이 아직 set이면 = 10분간 미상호작용 → 랜덤 자동발행.
alter table threads_accounts add column if not exists hottime_started_at timestamptz;
-- 핫타임 알림 메시지 id — resolve 때 그 메시지를 "완료"로 편집하고 버튼 제거하려고 저장
alter table threads_accounts add column if not exists hottime_msg_id text;
