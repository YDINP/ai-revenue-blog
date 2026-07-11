# 텔레그램 댓글봇 설정 가이드

새 댓글 → 텔레그램 알림, 텔레그램 답장 → 관리자 대댓글.
코드는 배포되어 있고, 아래 **1회성 설정**만 하면 동작합니다. (약 10분)

## 1. 텔레그램 봇 생성

1. 텔레그램에서 `@BotFather` 검색 → `/newbot`
2. 이름/username 입력 (예: `TechFlow 댓글봇` / `techflow_comment_bot`)
3. 발급된 **토큰** 복사 (`123456:ABC-...` 형태)

## 2. Vercel 환경변수 설정

Vercel 대시보드 → `ai-revenue-blog` 프로젝트 → Settings → Environment Variables:

| 이름 | 값 |
|------|-----|
| `TELEGRAM_BOT_TOKEN` | 1번에서 발급받은 토큰 |
| `WEBHOOK_SECRET` | 임의의 긴 랜덤 문자열 (예: `openssl rand -hex 24` 결과) |
| `COMMENT_ADMIN_KEY` | 대시보드 댓글탭에서 쓰는 관리자 키와 동일 값 |
| `TELEGRAM_ADMIN_CHAT_ID` | 일단 비워두고 5번에서 확인 후 입력 |

설정 후 **Redeploy** (env 변경은 재배포해야 반영됨).

## 3. 코드 배포

```bash
cd ai-revenue-blog
git push origin master   # Vercel 자동 배포 (api/ 함수 포함)
```

## 4. 텔레그램 웹훅 연결

토큰과 시크릿을 넣어 실행:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://ai-revenue-blog.vercel.app/api/telegram-webhook" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

`{"ok":true,"result":true}` 이면 성공.

## 5. 관리자 채팅 ID 등록

1. 텔레그램에서 내 봇을 찾아 `/start` 전송
2. 봇이 알려주는 채팅 ID를 Vercel `TELEGRAM_ADMIN_CHAT_ID`에 입력 → Redeploy

## 6. Supabase 트리거 등록

1. `supabase/telegram-comment-webhook.sql` 파일에서 `<WEBHOOK_SECRET>`을 2번과 동일한 값으로 치환
2. Supabase 대시보드 → SQL Editor → 실행
   - `supabase_functions` 스키마 에러 시: Database → Webhooks 에서 webhooks 활성화 후 재실행

## 7. 동작 테스트

1. 블로그 아무 글에서 댓글 작성 → 텔레그램 알림 수신 확인
2. 알림 메시지에 **답장(swipe reply)** 으로 아무 내용 전송 → "✅ 대댓글 등록 완료" 확인
3. 글 댓글란(또는 `/dashboard` 댓글탭)에서 관리자 대댓글 노출 확인

## 봇 명령어

**대시보드 실시간 조회**

| 명령 | 동작 |
|------|------|
| `/stats` | 전체 요약 (오늘/누적 조회수·쿠팡클릭·좋아요·구독자·댓글, TF/LF 분리) |
| `/tf` / `/lf` | TechFlow / LifeFlow 소스별 요약 + 인기 페이지 Top 5 |
| `/coupang` | 쿠팡 클릭 상세 — 상품별 Top + 최근 클릭(어떤 글→어떤 링크) |
| `/top [n]` | 인기 페이지 Top n (기본 10) |
| `/trend` | 최근 7일 조회수 추이 (스파크라인) |
| `/likes` | 추천(좋아요) Top |
| `/recent [n]` | 최근 이벤트 피드 |
| `/cstats` | 댓글 통계 + 7일 트렌드 |

**댓글 관리**

| 명령 | 동작 |
|------|------|
| 알림에 답장 | 해당 댓글에 관리자 대댓글 등록 |
| `/comments [n]` | 최근 댓글 n개(기본 5) — **댓글마다 개별 메시지**라 각각에 답장하면 그 댓글에 대댓글 |
| `/reply <댓글ID> <내용>` | ID 직접 지정 대댓글 (ID = 알림의 `#c_...` 값) |
| `/delete <댓글ID>` | 댓글 삭제 (자식 대댓글 포함) |
| `/id` | 현재 채팅 ID 확인 |
| `/help` | 사용법 |

**(선택) 명령어 자동완성 등록** — 텔레그램 입력창에서 `/` 입력 시 목록이 뜨게:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{"commands":[{"command":"stats","description":"전체 요약"},{"command":"tf","description":"TechFlow 요약"},{"command":"lf","description":"LifeFlow 요약"},{"command":"coupang","description":"쿠팡 클릭 상세"},{"command":"comments","description":"최근 댓글 (답장=대댓글)"},{"command":"cstats","description":"댓글 통계"},{"command":"top","description":"인기 페이지"},{"command":"trend","description":"7일 조회수 추이"},{"command":"likes","description":"추천 Top"},{"command":"recent","description":"최근 이벤트"},{"command":"help","description":"사용법"}]}'
```

## 트러블슈팅

- **알림이 안 옴**: Supabase → Database → Webhooks/Logs 에서 트리거 발화 확인 → Vercel 함수 로그(`comment-webhook`)에서 401(시크릿 불일치) 여부 확인
- **답장해도 반응 없음**: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"` 로 `last_error_message` 확인. `secret_token` 누락이면 4번 다시 실행
- **"등록 실패: unauthorized"**: `COMMENT_ADMIN_KEY`가 DB의 `admin_reply` 함수 내 키와 다름
- 관리자 대댓글(`is_admin=true`)은 알림을 보내지 않음 (루프 방지) — 정상 동작

## 범위

트리거는 공용 `comments` 테이블에 걸리므로 **TechFlow(ai-revenue) + LifeFlow(life-revenue) 두 블로그 댓글 모두** 알림/답장이 됩니다. gameflow 추가 시 `api/_shared.js`의 `SOURCE_META`에 항목만 추가하면 됩니다.
