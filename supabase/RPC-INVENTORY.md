# 대시보드 RPC 인벤토리

> `src/pages/dashboard.astro`가 호출하는 Supabase RPC의 목록·계약(contract)·레포 백업 상태.
> 문제 배경: 일부 RPC는 Supabase SQL Editor에서만 생성돼 **이 레포에 정의가 없다**.
> 실 DDL 백업은 `supabase/DUMP-rpc-functions.sql`을 Supabase에서 실행해 받는다.

## 상태 요약

| RPC | 인자 | 레포 정의 | 비고 |
|---|---|---|---|
| `get_traffic_summary` | () | ✅ `get_traffic_summary.sql` | KPI 총계/오늘·어제 |
| `get_daily_device_trend` | (p_days) | ✅ `device-trend-rpc.sql` | 웹/모바일 분해(미설치 허용) |
| `get_comment_stats` | () | ✅ `comments.sql` | 댓글 통계 |
| `get_all_comments` | (p_limit, p_offset) | ✅ `comments.sql` | 댓글 목록 |
| `get_comment_trend` | () | ✅ `comments.sql` | 댓글 추이 |
| `admin_reply` | (p_*, p_admin_key) | ✅ `admin-key-change.sql` | 관리자 답글(키검증) |
| `admin_delete_comment` | (p_id, p_admin_key) | ✅ `admin-key-change.sql` | 관리자 삭제(키검증) |
| `get_hourly_views` | () | ❌ **레포밖** | 오늘 시간대별 |
| `get_top_pages` | (p_limit) | ❌ **레포밖** | 인기 페이지 |
| `get_recent_events` | (p_limit) | ❌ **레포밖** | 실시간 이벤트 |
| `get_top_liked_posts` | (p_limit) | ❌ **레포밖** | 추천 TOP |
| `get_daily_detail` | (p_days) | ❌ **레포밖** | 방문 추이 핵심 |
| `get_daily_hourly_heatmap` | (p_days) | ❌ **레포밖** | 날짜×시간 히트맵 |

> `get_daily_trend`은 2026-07-16 커밋에서 **호출 제거**됨(결과 미사용 데드 페치).
> 레포밖 함수를 실 정의로 백업하려면 → `DUMP-rpc-functions.sql`.

## 소비 계약 (2026-07-16 service_role 라이브 호출로 검증)

반환 필드는 실제 RPC 응답에서 확인함(get_top_liked_posts만 라이브 0행이라 사용처 역산).
날짜/시간은 **KST(UTC+9)** 기준.

- **`get_hourly_views()`** → `[{ hour:int(0-23, KST), views:int, tf_views:int, lf_views:int }]`
  (views = tf_views + lf_views. 오늘 KST 당일) ✔검증
- **`get_top_pages(p_limit)`** → `[{ slug:text, path:text, title:text,
  source:'blog'|'lifeflow'|'gameflow', views:int }]` ✔검증(slug·path 둘 다 반환)
- **`get_recent_events(p_limit)`** → `[{ event_type:text, source:text, slug:text, title:text,
  path:text, product:text, referrer:text, created_at:timestamptz }]` ✔검증
  ⚠ **평면 컬럼**(metadata 중첩 아님). 최신순. event_type: pageview/like/coupang_click/
  paperdoc_click/newsletter_subscribe
- **`get_top_liked_posts(p_limit)`** → `[{ title, slug, path, source, like_count }]`
  (라이브 0행 — 사용처 역산, 실 필드명은 추후 데이터 생기면 재검증)
- **`get_daily_detail(p_days)`** → `[{ day:date(KST 'YYYY-MM-DD'), views:int, visitors:int,
  tf_views:int, lf_views:int }]` ✔검증 (방문 추이 일/주/월 집계 원천)
- **`get_daily_hourly_heatmap(p_days)`** → `[{ day:date(KST), hour:int(0-23), views:int }]` ✔검증
- **`get_daily_device_trend(p_days)`** (레포백업 있음) → `[{ day:date(KST),
  web_views, mobile_views, web_visitors, mobile_visitors:int }]` ✔검증
- **`get_traffic_summary()`** (레포백업 있음) → object. ✔검증. 반환 키:
  today_views, yesterday_views, total_views, today_clicks, total_clicks, today_likes,
  total_likes, today_subscribers, total_subscribers, tf_today_views, tf_total_views,
  tf_today_clicks, lf_today_views, lf_total_views, lf_today_clicks
  ⚠ **버그**: 대시보드가 `tf_total_clicks`/`lf_total_clicks`를 읽는데 함수가 반환하지
  않아 TF/LF 총클릭·CVR·쿠팡 소스별 상세가 전부 0/0.00%였음. `get_traffic_summary.sql`에
  두 필드 추가(2026-07-16) → **SQL Editor에서 CREATE OR REPLACE 재실행 필요**.

## 백필 절차

1. `DUMP-rpc-functions.sql`의 [B]를 Supabase SQL Editor에서 실행
2. `full_dump` 셀 전체를 `supabase/functions-dump.sql`로 저장
3. 커밋 → 이후 스키마 변경도 같은 방식으로 갱신
4. `[C]` 쿼리로 6개 레포밖 함수가 모두 `installed=true`인지 주기 점검
