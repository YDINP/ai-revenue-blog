# PRD — 텔레그램 봇 "타래 올리기" (Threads 멀티포스트 큐)

> 2026-07-15. 요청: 쓰레드 타래(멀티포스트)를 텔레그램 큐로 올려 발행하는 메뉴. "타래올리기" 느낌.

## 배경 / 현재 상태
- 봇에 Threads 기능 이미 있음: `/threads` 메뉴, `/post`(즉석 단일), `/threads gen`(AI 초안 단일), 큐/예약/랜덤/인게이지먼트.
- **없는 것**: 타래(root + 체인 답글로 이어지는 스레드) 발행. 지금은 전부 단일 글.
- 발행 프리미티브: `publish()`(root), `publishReply({replyToId})`(답글). 조합하면 타래 가능.

## 요구
- 텔레그램에서 여러 편 본문을 한 번에 붙여넣어 **타래로 큐잉 → 발행**.
- 링크는 본문 아닌 **root 첫 댓글**(hook-writer 규칙 유지).
- 기존 큐/예약/랜덤 UI 재사용(발행 버튼이 타래면 타래로 발행).

## 설계 (스키마 무변경 — 기존 threads_queue 재사용)
- 타래 편들을 `text`에 `\n---\n` 구분자로 join 저장. `link_kind='thread'`, `link_url`=첫댓글 링크.
- `publishThread(account, segments, {linkUrl, imageUrl})`: 1편 root → 2편~ 앞글에 체인 답글 → 링크 root 첫댓글. rootId 반환.
- `publishDraft()`가 thread면(`link_kind==='thread'` 또는 `\n---\n` 포함) publishThread로 위임 → 기존 thr:pub/sched/rand 경로 그대로 동작.

## UX 플로우
1. `/threads` 메뉴에 **[🧵 타래 올리기]** 버튼 추가 → `thr:newthread`
2. 활성 계정 2+개면 토픽 선택(`thr:nt:<topic>`), 1개면 스킵 → flow=`threads_newthread` 세팅
3. 안내: "편은 `---` 한 줄로 구분, 마지막에 `링크: <url>` 선택" → 붙여넣기
4. 파싱 → threads_queue insert(link_kind='thread') → 미리보기 카드(N편 + ✅발행/⏰예약/🗑버림)
5. 발행: publishThread 실행(10s 제한 대비 편수 경고 ≥5), 예약은 cron이 발행

## 작업
- [ ] T1. _threads.js: publishThread() + publishDraft 분기
- [ ] T2. _threads-bot.js: 메뉴 버튼, thr:newthread/thr:nt 콜백, threadsCard 편수표시, 플로우 파서
- [ ] T3. telegram-webhook.js: maybeHandleThreadsFlow에 threads_newthread 케이스(이미 라우팅됨→핸들러만)
- [ ] T4. 배포 후 실발행 검증(내 계정 짧은 2편 타래)

## 리스크
- Vercel 함수 10s 제한: 편수 많으면 finalizePublish 누적으로 타임아웃 → 즉시발행은 ≤4편 권장, 그 이상은 예약(cron).
