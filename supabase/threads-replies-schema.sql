-- Threads 댓글 반자동 대댓글 큐 (reply-assist)
-- threads-schema.sql 실행 후 추가로 실행. service_role 전용(RLS 차단).
create table if not exists threads_replies (
  id             bigint generated always as identity primary key,
  account_id     bigint not null references threads_accounts(id) on delete cascade,
  root_media_id  text not null,                     -- 댓글이 달린 내 원글
  comment_id     text not null unique,              -- 들어온 댓글 media id (중복 수집 방지)
  comment_text   text,
  comment_user   text,
  draft          text,                              -- AI 추천 대댓글(없으면 null)
  status         text not null default 'pending',   -- pending|sent|ignored|failed
  reply_media_id text,                              -- 발행된 대댓글 id
  error          text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_tr_status on threads_replies(status, created_at desc);

-- RLS: anon/authenticated 전면 차단 (service_role만 통과)
alter table threads_replies enable row level security;
-- 정책 없음 = anon 접근 불가
