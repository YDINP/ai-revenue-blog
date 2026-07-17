-- GSC 일별·페이지별 검색 실적 (Supabase SQL Editor 에서 1회 실행)
-- page = '/blog/.../' 경로, page='_TOTAL_' = 사이트 일별 합계
create table if not exists public.gsc_daily (
  date        date    not null,
  source      text    not null,           -- 'blog'(TF) | 'lifeflow'(LF)
  page        text    not null,           -- URL 경로 or '_TOTAL_'
  clicks      integer not null default 0,
  impressions integer not null default 0,
  ctr         real    not null default 0,
  position    real    not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (date, source, page)
);

create index if not exists gsc_daily_source_date_idx on public.gsc_daily (source, date desc);

-- RLS: anon 키로 동기화(upsert)·조회 (기존 analytics 테이블과 동일 패턴, 비민감 집계 데이터)
alter table public.gsc_daily enable row level security;

drop policy if exists gsc_daily_sel on public.gsc_daily;
drop policy if exists gsc_daily_ins on public.gsc_daily;
drop policy if exists gsc_daily_upd on public.gsc_daily;

create policy gsc_daily_sel on public.gsc_daily for select to anon using (true);
create policy gsc_daily_ins on public.gsc_daily for insert to anon with check (true);
create policy gsc_daily_upd on public.gsc_daily for update to anon using (true) with check (true);
