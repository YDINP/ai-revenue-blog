# PRD — Threads 자동 대댓글 (A안 자동발행 + B안 15분 주기)

작성 2026-07-29. 참고: [autoTHREADS](https://github.com/eisenjimmy/autoTHREADS) (MIT, Electron 데스크톱).
선행 문서: `PRD-threads-reply-assist.md`(반자동 승인카드 = 현재 운영 중), `THREADS-SYSTEM.md`.

## 배경 / 문제

현재 댓글 대응은 **반자동**이다. `threads-cron`이 내 최근 글의 새 댓글을 모아 텔레그램 승인카드를 보내고,
사람이 [✅이대로]/[✍️답장]을 눌러야 발행된다. 두 가지가 아프다.

1. **주기가 하루 2번**(GH Actions 23:00 / 01:00 KST)뿐 → 댓글 알림이 최대 **24시간 지연**된다.
   Threads는 댓글이 노출 신호의 핵심인데, 하루 늦은 대댓글은 대화가 이미 식었다.
2. **초안이 항상 비어 있다.** `draftReply()` 코드는 있지만 Vercel에 LLM 크레덴셜이 없다(아래 제약).
   그래서 카드가 와도 매번 손으로 타이핑해야 한다.

## 제약 (실측 2026-07-29)

- **서버측 LLM 없음.** Vercel production env에 `ANTHROPIC_API_KEY` 미설정.
  게이트웨이(`api.mdbox.ai`)는 살아 있으나 잔액 마이너스 → `403 insufficient user quota`.
  유일하게 동작하는 LLM 경로는 **로컬 `claude` CLI**(`automation/llm-cli.mjs`, 구독 세션).
  → 서버는 초안을 만들 수 없다. **초안 생성은 로컬 러너가 담당**하고, 서버 코드는 키가 생기는
  날 그대로 동작하도록 크레덴셜 2종(직접키 / 게이트웨이)을 모두 받게 짠다.
- **Vercel Hobby 서버리스 함수 12/12 만석** → 신규 엔드포인트 추가 불가.
  `threads-cron?only=replies` 쿼리 파라미터로 기존 함수를 재사용한다.
- GH Actions: 레포가 **PUBLIC**이라 Actions 분이 무료·무제한 → 15분 주기 크론 가능.
- 스코프는 이미 전부 발급됨(`threads_read_replies`, `threads_manage_replies`) → 재연결 불필요.
- Threads Mentions API / 중첩 답글은 이번 범위 밖(멘션은 Meta Advanced Access 심사 필요).

## 목표

- **B안** 댓글 수집·알림 주기를 24시간 → **15분**으로 단축. (LLM 불필요, 항상 서버에서 동작)
- **A안** 계정별 `reply_mode='auto'`면 초안이 있는 댓글에 **승인 없이 즉시 대댓글 발행**.
  캡·중복·자기답글 방지 장치를 함께 넣는다.
- 초안이 없으면(=서버 LLM 없음) **절대 자동 발행하지 않고** 기존 승인카드로 폴백 →
  품질 미검증 답글이 나갈 경로를 원천 차단한다(graceful degradation).

## 비목표

- 멘션 응답, 중첩 답글(대댓글의 대댓글), 아웃바운드 자동 답글(`/find`는 수동 유지).
- autoTHREADS의 뉴스 수집·이미지 검색(우리는 블로그 재가공 파이프라인이 이미 있음).

## 설계

### 1) 스키마 (`supabase/threads-reply-auto.sql`)

| 테이블 | 컬럼 | 의미 |
|---|---|---|
| threads_accounts | `reply_mode text default 'review'` | `review`=승인카드 / `auto`=즉시발행 |
| threads_accounts | `reply_daily_cap int default 20` | 계정당 24h 자동발행 상한 |
| threads_replies | `sent_at timestamptz` | 발행 시각(캡 계산 기준. `created_at`은 수집 시각이라 못 씀) |
| threads_replies | `auto boolean default false` | 자동발행분 표시(사후 감사·캡 계산) |

### 2) 안전장치 4개

- **계정 일일 캡** — `reply_daily_cap`(기본 20) 초과분은 자동발행 대신 승인카드.
- **글당 미답변 상한 20** — 한 원글에 pending이 20개 쌓이면 그 글은 더 수집하지 않는다.
  (autoTHREADS의 "20 unanswered per post" 규칙 차용. 바이럴 글에서 폭주 방지)
- **자기답글 차단** — 댓글 작성자가 내 `handle`이면 skip. 기존 `replyExists(reply_media_id)`
  루프 방지와 이중으로 막는다.
- **초안 없으면 발행 안 함** — 위 목표 참조.

### 3) 실행 경로

```
[15분마다 · GH Actions threads-replies.yml]
  → threads-cron?only=replies      (서버, LLM 불필요)
      수집 → (초안 시도) → auto+초안? 즉시발행 : 텔레그램 승인카드

[로컬 · automation/threads-reply-run.mjs]
  → threads-admin?action=reply-list&nodraft=1
  → claude CLI로 초안 생성 (llm-cli.mjs)
  → threads-admin?action=reply-draft   (초안 저장)
  → reply_mode=auto면 threads-admin?action=reply-send (발행)
```

`only=` 파라미터: `replies`=댓글 섹션만, `posts`=발행/토큰/인사이트만, 없으면 전체(기존 동작 유지).

### 4) 신규 admin 액션

| 액션 | 용도 |
|---|---|
| `reply-list[&nodraft=1&limit=N]` | pending 댓글 조회(로컬 러너 입력) |
| `reply-draft` body{id,draft} | 초안 저장 |
| `reply-send` body{id,text?,auto?} | 대댓글 발행(text 없으면 저장된 draft) |
| `set-reply-mode` body{mode,topic?,cap?} | `review`↔`auto` 전환 + 캡 조정 |

## 완료 기준

1. `threads-cron?only=replies` 200 + 발행/인사이트 섹션이 돌지 않음(응답 JSON으로 확인).
2. GH Actions `threads-replies.yml`이 15분 주기로 등록되고 수동 dispatch 성공.
3. `set-reply-mode auto` 후 초안 있는 pending을 자동 발행, 텔레그램에 사후 보고.
4. 초안 없는 계정에서 `auto`여도 발행 0건 + 승인카드 정상 발송(폴백 검증).
5. 로컬 러너가 pending에 초안을 채우고, `--send`로 발행까지 성공.

## 롤백

`update threads_accounts set reply_mode='review'` 한 줄 → 즉시 전량 승인제 복귀.
워크플로는 `threads-replies.yml` 삭제 또는 disable.
