-- 자동 대댓글(A안) — threads-replies-schema.sql 실행 후 추가 적용.
-- DDL은 service_role로 안 된다 → Supabase Management API(sbp_ 토큰)로 실행.

-- 계정별 대댓글 모드. publish_mode(글 발행)와 분리한다 —
-- 글은 승인제로 두면서 댓글만 자동으로 돌리는 조합이 실제 운영 형태다.
alter table threads_accounts add column if not exists reply_mode text not null default 'review';   -- review | auto
alter table threads_accounts add column if not exists reply_daily_cap int not null default 20;      -- 24h 자동발행 상한

-- created_at은 '수집' 시각이라 캡 계산에 쓸 수 없다(며칠 전 댓글을 오늘 발행하는 경우).
alter table threads_replies add column if not exists sent_at timestamptz;
alter table threads_replies add column if not exists auto boolean not null default false;

-- 글당 미답변 개수 조회(pending 폭주 차단)용
create index if not exists idx_tr_root_status on threads_replies(root_media_id, status);
-- 24h 자동발행 카운트용
create index if not exists idx_tr_auto_sent on threads_replies(account_id, auto, sent_at desc);
