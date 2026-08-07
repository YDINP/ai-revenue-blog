#!/usr/bin/env bash
# 스레드 예약 큐 온디맨드 재충전 — 로컬 Claude Code CLI 로 초안 생성 → threads_queue 저장 → 텔레그램 승인카드.
# GH generate-threads.yml 은 ANTHROPIC_API_KEY 401 로 죽어 disable 상태이므로, 큐가 마르면 이걸 수동 실행한다.
#
#   사용: bash scripts/refill-threads.sh [topic] [count] [linkmode]
#   예)  bash scripts/refill-threads.sh              # life 3건, 블로그 링크
#        bash scripts/refill-threads.sh ai 2         # ai 2건
#        bash scripts/refill-threads.sh life 3 coupang
#
# env: SUPABASE_SERVICE_ROLE_KEY 는 .env.local, CRON_SECRET 은 ../automation/.env 에서 자동 로드.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
[ -f .env.local ] && . ./.env.local
set +a
# CRON_SECRET 만 automation/.env 에서 안전하게 추출(전체 소스 시 공백/특수문자 값이 깨질 수 있어 grep 사용)
export CRON_SECRET="${CRON_SECRET:-$(grep -E '^CRON_SECRET=' ../automation/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"'\r")}"

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "✗ SUPABASE_SERVICE_ROLE_KEY 미설정 — .env.local 에 넣어라(Supabase 대시보드 service_role 키)." >&2
  exit 1
fi
[ -n "${CRON_SECRET:-}" ] || echo "⚠ CRON_SECRET 없음 — 초안은 저장되나 텔레그램 승인카드는 안 나간다." >&2

echo "== 스레드큐 재충전: topic=${1:-life} count=${2:-3} linkmode=${3:-blog} =="
INPUT_TOPIC="${1:-life}" INPUT_COUNT="${2:-3}" INPUT_LINKMODE="${3:-blog}" \
  node scripts/generate-threads.mjs
