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

## 소비 계약 (대시보드 사용처 기준 — 실 DDL로 검증 권장)

아래 반환 필드는 **대시보드 코드가 읽는 필드**에서 역산한 것이다(권위 정의 아님).
백필 시 최소한 이 필드를 만족해야 화면이 깨지지 않는다. 날짜/시간은 **KST(UTC+9)** 기준.

- **`get_hourly_views()`** → `[{ hour:int(0-23, KST), tf_views:int, lf_views:int }]`
  (조회수 = tf_views + lf_views. 오늘 KST 당일)
- **`get_top_pages(p_limit)`** → `[{ slug|path:text, source:'blog'|'lifeflow'|'gameflow', title:text, views:int }]`
- **`get_recent_events(p_limit)`** → `[{ event_type:text, source:text, created_at:timestamptz,
  path|slug:text, metadata:jsonb{path,slug,title,product}, product?:text }]`
  (최신순. event_type: pageview/like/coupang_click/paperdoc_click/newsletter_subscribe)
- **`get_top_liked_posts(p_limit)`** → `[{ title:text, slug|path:text, source:text, like_count:int }]`
- **`get_daily_detail(p_days)`** → `[{ day:date(KST 'YYYY-MM-DD'), views:int, visitors:int,
  tf_views:int, lf_views:int }]` (방문 추이 일/주/월 집계의 원천)
- **`get_daily_hourly_heatmap(p_days)`** → `[{ day:date(KST), hour:int(0-23), views:int }]`
- **`get_daily_device_trend(p_days)`** (레포백업 있음) → `[{ day:date(KST),
  web_views, mobile_views, web_visitors, mobile_visitors:int }]`

## 백필 절차

1. `DUMP-rpc-functions.sql`의 [B]를 Supabase SQL Editor에서 실행
2. `full_dump` 셀 전체를 `supabase/functions-dump.sql`로 저장
3. 커밋 → 이후 스키마 변경도 같은 방식으로 갱신
4. `[C]` 쿼리로 6개 레포밖 함수가 모두 `installed=true`인지 주기 점검
