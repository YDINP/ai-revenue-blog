-- ============================================================
-- 새 댓글 INSERT → Vercel /api/comment-webhook → 텔레그램 알림
-- 적용: Supabase 대시보드 → SQL Editor → 아래 실행
--
-- ⚠️ 실행 전 <WEBHOOK_SECRET> 을 Vercel 환경변수 WEBHOOK_SECRET 과
--    동일한 값으로 치환할 것.
--
-- supabase_functions.http_request 가 없다는 에러가 나면:
--   대시보드 → Database → Webhooks → "Enable webhooks" 먼저 활성화
--   (또는 Webhooks UI에서 직접 생성: table=comments, events=INSERT,
--    URL/헤더는 아래와 동일하게 입력)
-- ============================================================

DROP TRIGGER IF EXISTS comments_telegram_notify ON public.comments;

CREATE TRIGGER comments_telegram_notify
AFTER INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://ai-revenue-blog.vercel.app/api/comment-webhook',
  'POST',
  '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
  '{}',
  '5000'
);
