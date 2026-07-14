# PRD — Threads 댓글 반자동 대댓글 (reply-assist)

## 목표
내 Threads 글에 달린 새 댓글을 수집 → (AI 추천 초안) → 텔레그램 승인카드로 알림 →
원탭 발행 / 직접 작성 / 무시. **완전 자동 아님(스팸·섀도우밴 회피), 사람이 승인/작성.**

## 기존 인프라 재사용
- `_threads.js`: `publishReply({text,replyToId})`(대댓글 발행) · `sb()` · `getAccounts()` · OAuth/토큰
- `_threads-bot.js`: 카드+인라인버튼 패턴(`threadsCard`, `handleThreadsCallback`) · `maybeHandleThreadsFlow`(텍스트 다단계)
- `_state.js`: `setState/getState/clearState` · `threads-cron.js`(크론, GH Actions 잦은 핑 가능) · `telegram-webhook.js`(콜백/플로우 라우팅)

## 추가 항목
1. **DB**: `threads_replies`(comment_id UNIQUE로 중복 방지, status pending|sent|ignored|failed, draft)
2. **`_threads.js`**: `getReplies(account, mediaId)`(Graph `/{media}/replies`), `insertReply/updateReply/getReply`, `draftReply(text)`(ANTHROPIC_API_KEY 있으면 반말+스친체 1~2줄 생성, 없으면 '' → 사람이 작성)
3. **`threads-cron.js`**: 섹션 5 — 최근48h 내 글의 새 댓글 수집→초안→카드 발송(런당 캡 10)
4. **`_threads-bot.js`**: `threadsReplyCard(row)` + `handleReplyCallback`(rpl:send|reply|ign) + `sendReply()` + `maybeHandleThreadsFlow`에 `threads_reply` 플로우
5. **`telegram-webhook.js`**: `rpl:` 콜백 라우팅 + 플로우 카드 옵셔널 가드

## 톤/규칙 (hook-writer 스킬 준수)
- 대댓글도 반말+스친체, 진심 1~2줄, 링크·영업 금지, 이모지 0~1
- 자동 복붙 금지(AI가 댓글마다 다르게), 사람 최종 승인

## 사용자 셋업 (배포 전 필요)
- Threads 토큰 권한: `threads_manage_replies`(+ 기존 basic/publish) 스코프 재동의
- (선택) Vercel env `ANTHROPIC_API_KEY` — 있으면 AI 초안, 없으면 카드에 댓글만
- Supabase에 `threads-replies-schema.sql` 실행

## 한계
- 라이브 댓글 없이 E2E 테스트 불가 → 코드/문법 검증 + 계정 연결·댓글 발생 후 사용자 확인
