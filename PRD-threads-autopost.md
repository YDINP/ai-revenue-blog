# PRD — Threads 자동 포스팅 (수익 자동화)

> 작성: 2026-07-14 · 상태: 설계 확정, 토큰 대기

## 목표

카테고리별 Threads 계정을 **콘텐츠 자동 발행 → 블로그/쿠팡 유도**로 운영해 수익 자동화.
기존 인프라(ai-revenue-blog Vercel serverless + Supabase + @ben_dashboard_bot) 위에 얹는다.

## 확정 사항 (사용자 결정)

| 항목 | 결정 |
|---|---|
| 유도 목적지 | **혼합** — 평소 블로그 경유, 일부 글은 쿠팡 lptag 직접 |
| 발행 모드 | **3종 전부** — 검토후발행 / 완전자동 / 예약큐 (계정·글별 선택) |
| 콘텐츠 주제 | life·꿀팁 / AI·수익화 / 게임소개 / 쿠팡 큐레이션(신규) |
| 계정 전략 | **다계정 지원 설계**, 런칭은 1~2개부터(life 먼저) |

## 하드 제약 (반드시 준수)

1. **쿠팡 파트너스 API 호출 금지** (2026-07-13 지시, rate limit 여파).
   → lptag 검색 URL / 정적 배너만 사용. 딥링크·Open API 호출 코드 넣지 않는다.
2. **Meta 스팸/계정팜 탐지 회피**:
   - 신규 계정 동시 대량 생성 금지 (1~2개씩 순차)
   - 계정별 발행 시간대 분산, 사람같은 간격(고정 cron 아님, jitter)
   - 순수 링크 도배 금지 — 글마다 가치 콘텐츠 본문 필수, 링크는 프로필/맥락 유도
3. **Threads 외부링크 도달 억제** 고려 → 기본은 블로그 유도(프로필 링크 활용), 쿠팡 직링크는 소수 글만.

## 아키텍처

```
[Supabase]  threads_accounts / threads_queue / threads_posts (신규 테이블)
     │
[콘텐츠 생성]  블로그 RSS/최근글 재가공 + 신규 쿠팡 큐레이션 (Claude API, _control.js 패턴 재사용)
     │
[승인 플로우]  텔레그램 @ben_dashboard_bot 확장 — 초안 카드 + [발행][수정][예약][버림] 버튼
     │
[스케줄]  Vercel Cron (jitter 적용) → 예약큐/완전자동 계정 처리
     │
[발행]  Threads Graph API 2-step (container → publish)  api/_threads.js
     │
[인사이트]  /{media-id}/insights 수집 → 대시보드 /threads 명령
```

### Threads Graph API 요약 (근거)
- Base `https://graph.threads.net/v1.0`
- 발행 2단계: `POST /{uid}/threads`(media_type=TEXT/IMAGE, text, image_url) → creation_id → `POST /{uid}/threads_publish`(creation_id)
- 스코프: `threads_basic`, `threads_content_publish`, `threads_manage_insights`
- 토큰: short(1h) → **long-lived(60d)** 교환, `refresh_access_token`로 갱신
- rate limit: 250 posts / 24h · insights `metric=views,likes,replies,reposts,quotes,shares`

### DB 스키마 (초안)
```sql
threads_accounts(id, handle, topic, persona, threads_user_id, access_token, token_expires_at,
                 publish_mode /*review|auto|scheduled*/, tz_offset, active, created_at)
threads_queue(id, account_id, text, image_url, link_url, link_kind /*blog|coupang*/,
              status /*draft|approved|scheduled|published|rejected|failed*/,
              scheduled_at, source_slug, created_at)
threads_posts(id, queue_id, account_id, threads_media_id, published_at,
              views, likes, replies, reposts, shares, insights_synced_at)
```

## 파일 (ai-revenue-blog/)
- `api/_threads.js` — Graph API 래퍼(발행/토큰교환/갱신/insights) + Supabase 헬퍼
- `api/threads-oauth.js` — OAuth redirect 콜백(코드→long-lived 토큰→accounts 저장). 사용자 1회 클릭용
- `api/threads-cron.js` — Vercel Cron 진입점(예약/자동 발행 + jitter + 토큰 갱신 + insights 수집)
- `api/_control.js` 확장 — `/threads` 명령군 + 초안 승인 callback
- `supabase/threads-schema.sql` — 테이블 + RPC(SECURITY DEFINER)
- `vercel.json` — cron 등록

## 텔레그램 명령 (봇 확장)
- `/threads` — 계정 목록·큐 상태·오늘 발행수
- `/threads gen <계정> [주제]` — 초안 생성 → 승인 카드
- `/threads queue <계정>` — 대기 초안
- `/threads insights [일수]` — 성과(노출·좋아요·클릭 유도)
- 초안 카드 버튼: ✅발행 / ✍️수정 / ⏰예약 / 🗑버림

## 사용자 액션 (블로커 — 나 대신 못 함)
1. 카테고리별 Threads 계정 생성(먼저 life 1개)
2. developers.facebook.com → 앱 생성 → **Threads** use case 추가 → Threads 앱 ID/Secret 발급
3. redirect URI에 `https://ai-revenue-blog.vercel.app/api/threads-oauth` 등록
4. 스코프 `threads_basic,threads_content_publish,threads_manage_insights` 승인
→ 이후 내가 만든 oauth 링크 1회 클릭이면 토큰 자동 저장

## 단계 (Phase)
- **P0 (토큰 무관, 지금)**: 스키마 + `_threads.js` + oauth 엔드포인트 + 텔레그램 골격 + cron 골격
- **P1 (토큰 후)**: life 계정 연결 → 초안 생성 → 검토발행 실전 검증
- **P2**: 예약/완전자동 모드 + insights 대시보드
- **P3**: 계정 추가(game/ai/쿠팡큐레이션) + 성과 기반 튜닝
