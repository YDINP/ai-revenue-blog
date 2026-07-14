-- Threads 자동 포스팅 스키마
-- 토큰 등 민감정보 저장 → RLS로 anon 전면 차단, serverless service_role로만 접근

-- 계정 레지스트리 (카테고리별 다계정 지원)
create table if not exists threads_accounts (
  id                bigint generated always as identity primary key,
  handle            text,                     -- @핸들 (표시용)
  topic             text not null,            -- life | ai | game | coupang
  persona           text,                     -- 톤/성격 (콘텐츠 생성 프롬프트에 주입)
  threads_user_id   text unique,              -- Threads 유저 ID
  access_token      text,                     -- long-lived (60d)
  token_expires_at  timestamptz,
  publish_mode      text not null default 'review',  -- review | auto | scheduled
  tz_offset         int  not null default 9,  -- 발행 시간대 (KST=9)
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- 발행 큐 (초안 → 승인/예약 → 발행)
create table if not exists threads_queue (
  id            bigint generated always as identity primary key,
  account_id    bigint not null references threads_accounts(id) on delete cascade,
  text          text not null,
  image_url     text,
  link_url      text,
  link_kind     text,                          -- blog | coupang | none
  status        text not null default 'draft', -- draft|approved|scheduled|published|rejected|failed
  scheduled_at  timestamptz,
  source_slug   text,                          -- 재가공 원본 블로그 글
  error         text,
  created_at    timestamptz not null default now()
);

-- 발행 결과 + 인사이트
create table if not exists threads_posts (
  id                bigint generated always as identity primary key,
  queue_id          bigint references threads_queue(id) on delete set null,
  account_id        bigint not null references threads_accounts(id) on delete cascade,
  threads_media_id  text,
  published_at      timestamptz not null default now(),
  views             int default 0,
  likes             int default 0,
  replies           int default 0,
  reposts           int default 0,
  shares            int default 0,
  insights_synced_at timestamptz
);

create index if not exists idx_tq_status_sched on threads_queue(status, scheduled_at);
create index if not exists idx_tp_account on threads_posts(account_id, published_at desc);

-- RLS: anon/authenticated 전면 차단 (service_role은 RLS 우회 → serverless 전용 접근)
alter table threads_accounts enable row level security;
alter table threads_queue    enable row level security;
alter table threads_posts    enable row level security;
-- 정책 없음 = anon 접근 불가 (service_role만 통과)
