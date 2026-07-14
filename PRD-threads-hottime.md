# PRD — Threads 핫타임 알림 + 10분 미상호작용 시 랜덤 자동발행

## 목표
매일 골든타임(08:00 / 23:00 KST) 텔레그램으로 "핫타임" 알림 → 사용자가 10분 내
큐에서 골라 발행하면 그걸로 끝, **10분간 발행 상호작용이 없으면 큐 초안 중 랜덤 1개 자동 발행.**

## 흐름 (GH Actions가 sleep으로 10분 창 보장)
1. 골든타임 → `threads-hottime` 호출: 큐 초안 수 안내 + `hottime_started_at=now` 마킹 + 텔레그램 알림
2. 사용자가 카드에서 ✅발행/⏰예약 → `handleThreadsCallback`이 `hottime_started_at=null`로 클리어(=상호작용함)
3. 10분 후 → `threads-hottime-resolve` 호출: `hottime_started_at`가 아직 set이면(=미상호작용) 큐에서 랜덤 초안 발행, 마커 클리어

## 구성
- DB: `threads_accounts.hottime_started_at timestamptz` (마커)
- `threads-hottime.js` / `threads-hottime-resolve.js` (CRON_SECRET 보호)
- `_threads-bot.js`: pub/sched 성공 시 마커 클리어
- `.github/workflows/threads-hottime.yml`: cron 08:00·23:00 KST → curl 알림 → sleep 600 → curl 해결

## 한계/주의
- GH Actions cron은 정시보다 지연될 수 있음(수십 분~). 10분 창 자체는 sleep으로 정확히 보장되나 시작 시각은 드리프트. 정확도 더 필요하면 Vercel cron(≤1h)로 알림만 트리거.
- 큐가 비면 자동발행 없음(알림에 "초안 없음" 안내).
- 자동발행은 스팸 방지 위해 창당 1개.
