# Threads 자동화 시스템 — 정리 (2026-07-15)

미나(life) 계정 운영을 위한 Threads 발행·댓글·성장 자동화. ai-revenue-blog `api/`에 구현.

## 계정 컨셉
- **미나 (topic=life)** — 또래 직장인 생활정보(돈·건강·여행·살림·교육). 치와와 프사.
- 말투: **반말 + 스친 커뮤니티체** (`~하던데/~거든/~잖아`, "스친들 ~어때?"). 존댓말·건조체(~있음) X.
- 규격/후킹/검수/성장 규칙: 스킬 `threads-hook-writer` (`.claude/skills/`, Ben_Claude 레포)

## 발행 경로 (4가지)
| 방법 | 사용법 |
|------|--------|
| 큐에서 선택/예약 | 텔레그램 `/threads queue life` → 목록(1메시지) → 글 탭 → ✅발행/⏰예약/✍️수정/🗑버림 / 🔀랜덤 / ✖닫기 |
| 즉석 발행 | 텔레그램 `/post <내용>` (여러 줄, 링크 없이 바로) |
| 스크립트/AI가 발행 | `POST /api/threads-admin?action=post` {text,topic,linkUrl} (CRON_SECRET) |
| 완전 자동 | `update threads_accounts set publish_mode='auto'` → 크론이 오래된 초안부터 하루 3개 |

## 핫타임 자동발행 (하루 2회)
- **08:00 / 23:00 KST** GH Actions(`threads-hottime.yml`) → `threads-hottime`(알림+마커+메시지id) → sleep 600 → `threads-hottime-resolve`
- 알림 메시지 버튼: **[📋 큐 보기][⏭ 패스]**
- 10분 내 발행/예약/패스 안 하면 → 큐에서 **랜덤 1개 자동 발행**, 그리고 **알림 메시지를 ✅완료로 편집(버튼 제거)**

## 댓글 대댓글 (반자동 + 자동) — 2026-07-29 갱신
- **수집 주기 15분** — GH Actions `threads-replies.yml` → `threads-cron?only=replies`
  (기존 `threads-cron.yml`은 하루 2번 발행·인사이트 담당. Hobby 함수 12/12 만석이라 신규
  엔드포인트 대신 `?only=replies|posts` 쿼리로 분기)
- `reply_mode='review'`(기본) → 텔레그램 카드 **[✅ 이대로][✍️ 답글][🗑 무시]** → `publishReply`
- `reply_mode='auto'` → **초안이 있으면 승인 없이 즉시 발행** + 텔레그램 사후 보고(🤖 자동답글)
  전환: `threads-admin?action=set-reply-mode` body`{mode:'auto'|'review',cap:20}`
- 안전장치 4개: 계정 일일캡(`reply_daily_cap` 20) · 원글당 미답변 20 · **자기답글 차단** ·
  **초안 없으면 발행 안 함**(빈 답글 방지)
- 테이블 `threads_replies`(+sent_at, auto). 삭제: `threads-admin?action=reply-delete[&rid=N]`
- 문서: `PRD-threads-auto-reply.md` / 스키마 `supabase/threads-reply-auto.sql`

### ⚠️ 초안은 로컬에서 만든다 (서버 LLM 없음)
Vercel에 `ANTHROPIC_API_KEY` 없음 + 게이트웨이 `api.mdbox.ai` 잔액 마이너스(403) → **서버는 초안을
못 만든다**. 그래서 `auto`로 켜도 크론은 승인카드로 폴백된다(의도된 동작).
초안은 `claude` CLI를 쓰는 로컬 러너가 채운다:
```bash
node automation/threads-reply-run.mjs            # 초안만 (Ben_Claude 레포)
node automation/threads-reply-run.mjs --send     # 초안 + 즉시 발행
node automation/threads-reply-run.mjs --dry      # 생성만, 저장 X
```
→ Vercel에 `ANTHROPIC_API_KEY`(또는 `ANTHROPIC_BASE_URL`+`ANTHROPIC_AUTH_TOKEN`)를 넣는 순간
크론이 직접 초안을 만들어 완전 자동이 된다. 코드 수정 불필요.

### 신규 admin 액션
`reply-list[&nodraft=1&limit=N]`(pending 조회, 자기댓글 제외) · `reply-draft`{id,draft} ·
`reply-send`{id,text?,auto?} · `set-reply-mode`{mode,topic?,cap?}

## 아웃바운드 인게이지먼트 `/find`
- `/find <키워드>` → keyword_search → 후보 카드([✅이대로][✍️답글][🗑패스]) → 남 글에 답글
- ⚠️ **Threads 검색 API recall이 한국어에 매우 낮음** → 보조용. 메인 성장은 앱에서 손수 정성 답글.
- 테이블 `threads_engage`. 트리거: `threads-admin?action=find&q=`

## 엔드포인트 (Hobby 12함수 한도 → 11개)
webhook: `telegram-webhook`, `comment-webhook` / cron: `daily-report`, `threads-cron`, `threads-hottime(-resolve)` / OAuth·콜백: `threads-oauth`, `threads-deauth`, `threads-delete`, `threads-notify` / 통합 트리거: **`threads-admin`**(post/find/reply-delete)

## Supabase 테이블
`threads_accounts`(+hottime_started_at, hottime_msg_id) · `threads_queue` · `threads_posts` · `threads_replies` · `threads_engage`
→ 스키마: `supabase/threads-*.sql`

## OAuth 스코프 (재연결로 토큰 반영)
`threads_basic, threads_content_publish, threads_manage_insights, threads_read_replies, threads_manage_replies, threads_delete, threads_keyword_search`
→ 새 스코프 추가 시: Meta 앱 Permissions에 Add + `?connect=1&topic=life` 재연결

## 디버깅 교훈 (중요)
1. **본인 글 조회/발행은 `me` 별칭** — 숫자 threads_user_id는 노드 조회/발행 불가
2. **권한 분리** — 읽기 read_replies / 관리 manage_replies / 검색 keyword_search / 삭제 delete 각각 필요
3. **게시 "Media Not Found"(code 24/4279009)** — 컨테이너 준비 전 게시 → finalizePublish 1·2·3초 재시도
4. **Hobby 서버리스 함수 ≤12** — 초과 시 deploy_failed → 엔드포인트 통합
5. **git 자동배포 멈춤** — 44c7747 이후 Vercel이 push를 안 잡음(한도/연동). **당분간 `npx vercel --prod --yes`로 수동 배포** (repo 링크·로그인 완료). 근본: Vercel Settings→Git 재연결

## ⚠️ 미완/설정
- **ANTHROPIC_API_KEY (Vercel env)** 미설정 → AI 초안(댓글/find) 비활성. 넣으면 자동 초안.
- **git 자동배포** 재연결 필요 (지금은 CLI 배포)
- **/find recall** = Threads API 한계 (보조용)

## 운영 루틴 (권장)
- 하루 2~3개 발행(핫타임이 커버) + 남 글에 정성 답글 10~20개 + 내 댓글 전부 답장
- 골든타임 08~09 / 23~01시. 좋아요보다 댓글이 핵심 신호.
