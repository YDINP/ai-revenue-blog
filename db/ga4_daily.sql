-- GA4 일별 유입경로 (Supabase SQL Editor 또는 Management API 로 1회 실행)
--
-- gsc_daily 가 '구글 검색' 유입만 담는 것과 달리, 이 테이블은 전체 유입을 경로별로 쪼갠다.
-- dim/key 를 세로로 쌓는 EAV 형태인 이유: 채널·소스매체·랜딩페이지는 카디널리티가 제각각인데
-- 표를 따로 만들면 대시보드가 3번 질의해야 한다. 한 표에 넣고 dim 으로 거르면 1번이면 된다.
create table if not exists public.ga4_daily (
  date       date    not null,
  source     text    not null,          -- 블로그 레지스트리 key ('mg' = mungge.com)
  dim        text    not null,          -- 'total'|'channel'|'source_medium'|'page'(랜딩)|'page_all'(전체조회)
                                        -- |'device'|'browser'|'os'|'page_source'(랜딩\t소스매체)
  key        text    not null,          -- 차원값. dim='total' 이면 '_TOTAL_'
  sessions   integer not null default 0,
  users      integer not null default 0,
  views      integer not null default 0,   -- screenPageViews
  engaged    integer not null default 0,   -- engagedSessions
  updated_at timestamptz not null default now(),
  primary key (date, source, dim, key)
);

create index if not exists ga4_daily_lookup_idx on public.ga4_daily (source, dim, date desc);

-- RLS: anon 키로 동기화(upsert)·조회 (gsc_daily 와 동일 패턴, 비민감 집계 데이터)
alter table public.ga4_daily enable row level security;

drop policy if exists ga4_daily_sel on public.ga4_daily;
drop policy if exists ga4_daily_ins on public.ga4_daily;
drop policy if exists ga4_daily_upd on public.ga4_daily;

create policy ga4_daily_sel on public.ga4_daily for select to anon using (true);
create policy ga4_daily_ins on public.ga4_daily for insert to anon with check (true);
create policy ga4_daily_upd on public.ga4_daily for update to anon using (true) with check (true);
