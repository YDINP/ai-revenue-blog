-- 핫타임 마커: 알림 발송 시각. 사용자가 발행/예약하면 null로 클리어(=상호작용함).
-- resolve 시 이 값이 아직 set이면 = 10분간 미상호작용 → 랜덤 자동발행.
alter table threads_accounts add column if not exists hottime_started_at timestamptz;
