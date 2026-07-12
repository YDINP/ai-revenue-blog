# PRD: 텔레그램 댓글 알림 + 대댓글 봇

> 작성: 2026-07-11

## 배경

- ai-revenue(TechFlow)·life-revenue(LifeFlow) 블로그 댓글은 공용 Supabase(`xyprbsmagtlzebxyxsvj`) `comments` 테이블에 저장됨
- 대시보드(`/dashboard`)에서만 새 댓글 확인 가능 → 실시간 인지 불가
- `admin_reply(p_parent_id, p_slug, p_source, p_content, p_admin_key)` RPC(SECURITY DEFINER)가 이미 존재 → 외부에서 대댓글 작성 가능

## 목표

1. 새 댓글 INSERT 시 텔레그램 봇으로 즉시 알림 (작성자/내용/글 링크 포함)
2. 텔레그램에서 알림 메시지에 **답장(reply)** 하거나 `/reply` 명령으로 대댓글 작성
3. `/delete` 명령으로 댓글 삭제 (모더레이션)

## 아키텍처

블로그는 Vercel **정적** 배포라 서버 코드가 없음 → Vercel 루트 `api/` 디렉터리 서버리스 함수 사용 (Astro 빌드와 무관하게 함께 배포됨).

```
[블로그 댓글 작성]
  → Supabase comments INSERT
  → DB Trigger (supabase_functions.http_request)
  → POST https://ai-revenue-blog.vercel.app/api/comment-webhook  (x-webhook-secret 검증)
  → Telegram sendMessage (관리자 채팅, #c_<uuid> 마커 포함)

[관리자가 텔레그램에서 답장 / /reply <id> <내용>]
  → Telegram Bot Webhook
  → POST https://ai-revenue-blog.vercel.app/api/telegram-webhook  (secret_token 검증)
  → 댓글 조회(REST, anon) → admin_reply RPC 호출
  → 블로그 글 하단에 관리자 대댓글 노출
```

## 파일

| 파일 | 역할 |
|------|------|
| `api/_shared.js` | 텔레그램/Supabase 공용 헬퍼 (`_` 프리픽스 → 엔드포인트 제외) |
| `api/comment-webhook.js` | Supabase DB 웹훅 수신 → 텔레그램 알림 |
| `api/telegram-webhook.js` | 텔레그램 업데이트 수신 → 대댓글/삭제 RPC |
| `supabase/telegram-comment-webhook.sql` | comments INSERT 트리거 (SQL Editor 실행) |
| `SETUP-telegram-comment-bot.md` | BotFather·Vercel env·setWebhook 설정 가이드 |

## 환경변수 (Vercel)

| 이름 | 설명 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | BotFather 발급 토큰 |
| `TELEGRAM_ADMIN_CHAT_ID` | 관리자 채팅 ID (봇에게 `/id` 로 확인) |
| `WEBHOOK_SECRET` | Supabase 트리거 헤더 + 텔레그램 secret_token 공용 시크릿 |
| `COMMENT_ADMIN_KEY` | `admin_reply`/`admin_delete_comment` RPC 관리자 키 (대시보드와 동일 값) |

## 보안

- comment-webhook: `x-webhook-secret` 헤더 불일치 시 401
- telegram-webhook: `x-telegram-bot-api-secret-token` 검증 + `TELEGRAM_ADMIN_CHAT_ID` 외 채팅의 명령 거부
- 관리자 키/토큰은 코드에 하드코딩하지 않고 전부 env
- `is_admin=true` 댓글(관리자 답변)은 알림 제외 → 알림 루프 방지

## 비고

- source→URL 매핑: `blog`→ai-revenue-blog.vercel.app, `lifeflow`→life-revenue-blog.vercel.app (글 경로 `/blog/<slug>/`)
- gameflow-blog은 현재 `source="blog"`로 잘못 지정돼 있음(별도 이슈) — 추후 `gameflow` source 추가 시 `_shared.js`의 SOURCE_META에 한 줄 추가하면 됨
- 트리거는 공용 테이블에 걸리므로 두 블로그(+향후 gameflow) 댓글 모두 알림됨

---

## 2차: 대시보드 실시간 조회 + 쿠팡 트래커 상세화 (2026-07-12)

### 봇 대시보드 조회 명령 (`api/_dashboard.js`)

대시보드(/dashboard)와 동일한 Supabase RPC를 조회해 항목별 실시간 확인:
`/stats`(전체 요약+댓글 통계) · `/tf` `/lf`(소스별+Top5) · `/coupang`(상품별 Top+최근 클릭 상세) · `/top [n]` · `/trend`(스파크라인) · `/likes` · `/recent [n]` · `/cstats` · `/comments [n]`(댓글별 개별 메시지 → 각각 답장=대댓글)

### 쿠팡 클릭 트래커 상세화 + 통일

문제:
1. 본문 인라인 링크는 `affiliate_click`, 배너는 `coupang_click`으로 **이벤트 타입이 갈라져** 대시보드 쿠팡 트래커(coupang_click만 조회)에 인라인 클릭이 안 보임
2. 배너 클릭은 배너 자체 스크립트 + BaseLayout 전역 리스너 **양쪽에서 이중 기록**
3. 메타데이터에 글 제목(title)이 없어 "어떤 포스팅에서" 클릭했는지 부실
4. LF 배너 스크립트가 `source:'blog'`로 오기록 (LF 클릭이 TF로 집계)

해결 (TF+LF 동일 적용):
- BaseLayout 전역 핸들러 하나로 통일: `coupang_click` + `{product, url, slug, path, title}` — CoupangBanner 자체 스크립트 제거 (`data-product`는 전역 핸들러가 읽음)
- 대시보드/봇 조회는 레거시 `affiliate_click`(target=coupang)도 포함 + `label/href → product/url` 정규화 → 과거 데이터 유지
- 쿠팡 피드 렌더링: 상품명(링크) + 📄 글 제목 상세 표시. loadTraffic의 구식 중복 렌더링(#coupang-events 덮어쓰기) 제거

### System Status 오표시 수정

- LifeFlow (Vercel): "미배포" → "Online" (실제 배포됨)
- Coupang Partners: "연동 필요" → "연동됨" (트래킹 가동 중)

---

## 3차: 방문 추이 웹/모바일 분리 (2026-07-12)

- 방문 추이 메트릭 토글에 **웹/모바일** 추가 (조회수/방문자/웹·모바일)
- 데이터: 신규 RPC `get_daily_device_trend(p_days)` — pageview `metadata->>'user_agent'` 를 `Mobi|Android|iPhone|iPad` 정규식으로 분류, **KST 일자 버킷** (기존 `get_daily_detail`이 KST 버킷임을 라이브 카운트 대조로 검증)
- 적용 필요: `supabase/device-trend-rpc.sql` 을 SQL Editor에서 실행 (미설치 시 차트에 설치 안내 문구 표시, 다른 기능 영향 없음)
- 일간/주간/월간/커스텀 기간 모두 지원, 우측 리스트에 웹·모바일·모바일% 표시, CSV에 웹/모바일 컬럼 추가

---

## 4차: 블로그 제어 + 일일 리포트 + 대화형 /generate (2026-07-12)

### 블로그 제어 (`api/_blogs.js` 레지스트리 + `_github.js` + `_control.js`)

대상 3종: `tf`(ai-revenue) · `lf`(life-revenue) · `pc`(playcast/virtual-in-playing).
GitHub Contents API 커밋 → Vercel 자동배포가 기본 경로(별도 배포 호출 불필요).

| 명령 | 동작 |
|------|------|
| `/blogs` `/posts <b> [n]` | 블로그 목록 / 최근 글(발행·숨김 표시) |
| `/publish` `/draft` | frontmatter `draft` 토글 |
| `/newpost` `/edit` `/delpost` | 작성(제목→본문) / 본문 교체 / 삭제(확인 필요) |
| `/generate` | AI 자동 포스팅 (아래) |
| `/deploy` `/status` | 재배포 / 배포·워크플로 상태 |

- 서버리스는 요청 간 상태가 없어 다단계 흐름은 Supabase `bot_state`(SECURITY DEFINER RPC, 30분 만료)에 저장 → `supabase/bot-control.sql`
- `VERCEL_TOKEN` 있으면 배포 상태 조회·재배포, 없으면 빈 커밋 폴백
- ⚠️ LifeFlow는 `draft` 필터가 없어 숨김이 무효였음 → 목록·상세·카테고리·태그 페이지에 필터 추가(life-revenue 21dfbda)

### 대화형 `/generate` (`api/_trends.js`)

`/generate` → 인라인 버튼: 블로그 선택 → **🔥 핫 키워드 / ✍️ 직접 입력 / 🎲 자동**.
핫 키워드 = 3개 소스 병합:
1. 🌱 각 레포 `scripts/category-seeds.json` 중 **아직 안 쓴** 키워드 (기존 slug 대조)
2. 🔥 Google 실시간 급상승(KR RSS, 인물명 필터링)
3. 📈 내 블로그 최근 인기글 → "후속편" 후보 (get_top_pages, source별)

선택 시 기존 GitHub Actions `daily-post.yml` 을 `workflow_dispatch`(category/topic/count)로 실행 → Claude 생성 → 커밋 → 자동배포.
콜백 데이터 64B 제한 때문에 후보는 `bot_state`에 저장하고 인덱스(`g:kw:0`)로 참조.

### 일일 리포트 (`api/daily-report.js` + `_report.js`, Vercel cron)

매일 09:00 KST(`vercel.json` cron `0 0 * * *` UTC) → 전날 조회수(TF/LF)·방문자·신규 댓글·신규 좋아요·쿠팡 클릭 + 인기글 TOP·새 댓글·클릭 상품, 전일 대비 증감 포함. `/report [YYYY-MM-DD]` 로 수동 조회.
좋아요는 `card_likes` 테이블, 쿠팡은 `coupang_click`+레거시 `affiliate_click` 병합.

### 추가 환경변수

`GITHUB_TOKEN`(repo+workflow) · `CRON_SECRET` · (선택) `VERCEL_TOKEN`
