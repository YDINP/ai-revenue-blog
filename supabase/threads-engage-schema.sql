-- 아웃바운드 인게이지먼트: 키워드로 찾은 남의 공개글 + 답글 초안(수동 승인).
-- 자동 대량 X — 사람이 카드에서 골라 답글. service_role 전용.
create table if not exists threads_engage (
  id             bigint generated always as identity primary key,
  account_id     bigint not null references threads_accounts(id) on delete cascade,
  post_id        text not null unique,              -- 상대 공개글 media id
  post_text      text,
  post_user      text,
  permalink      text,
  draft          text,                              -- AI 추천 답글(없으면 null)
  status         text not null default 'pending',   -- pending|replied|passed|failed
  reply_media_id text,
  error          text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_te_status on threads_engage(status, created_at desc);
alter table threads_engage enable row level security;
