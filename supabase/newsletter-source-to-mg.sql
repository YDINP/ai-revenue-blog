-- 뉴스레터 source 통합: blog(TF) / lifeflow(LF) → mg(뭉게)
--
-- 왜: TF·LF 는 mungge.com 으로 301 통합됐다. 그런데 뭉게 인라인 구독 폼(scripts/wp-widget.js)이
-- 카테고리를 추측해 source='blog'|'lifeflow' 로 보내고 있었고, 발송 파이프라인
-- (api/_newsletter.js)은 레지스트리(api/_blogs.js)의 source 로 대상을 고른다.
-- 레지스트리에서 tf/lf 를 지우면 그 구독자들이 발송 대상에서 통째로 빠진다.
--
-- 실측한 스키마 (2026-07-30, information_schema):
--   newsletter_subscribers(id, email, subscribed_at, source, is_active)
--     UNIQUE(email)  ← source 를 포함하지 않는다. 한 이메일은 애초에 한 행뿐이므로
--                       source 를 바꿔도 충돌이 없다 → 단순 UPDATE 로 충분(dedupe 불필요).
--   newsletter_sends(id, source, post_url, subject, recipient_count, sent_at)
--     UNIQUE(source, post_url)  ← 이쪽은 충돌 가능 → 겹치는 레거시 행을 먼저 지운다.
--
-- ⚠️ 타임스탬프 컬럼명은 created_at 이 아니라 subscribed_at / sent_at 이다.
--
-- Supabase SQL Editor 또는 Management API(/database/query)에서 1회 실행.
-- VIP(playcast)는 여전히 별개 사이트라 건드리지 않는다.

BEGIN;

-- ── 1. 구독자 이관 (UNIQUE(email) 이라 충돌 없음) ──
UPDATE newsletter_subscribers
SET source = 'mg'
WHERE source IN ('blog', 'lifeflow');

-- ── 2. 발송 이력 이관 ──
-- 이관하지 않으면 sentUrls('mg') 가 비어 있어서 이미 보낸 글이 다시 발송된다.
-- UNIQUE(source, post_url) 충돌 대비: mg 에 같은 URL 이 이미 있으면 레거시 행을 버리고,
-- blog·lifeflow 양쪽에 같은 URL 이 있으면 먼저 보낸 1건만 남긴다.
DELETE FROM newsletter_sends a
WHERE a.source IN ('blog', 'lifeflow')
  AND EXISTS (
    SELECT 1 FROM newsletter_sends b
    WHERE b.source = 'mg' AND b.post_url = a.post_url
  );

DELETE FROM newsletter_sends a
WHERE a.source IN ('blog', 'lifeflow')
  AND EXISTS (
    SELECT 1 FROM newsletter_sends b
    WHERE b.source IN ('blog', 'lifeflow')
      AND b.post_url = a.post_url
      AND (b.sent_at < a.sent_at OR (b.sent_at = a.sent_at AND b.id < a.id))
  );

UPDATE newsletter_sends
SET source = 'mg'
WHERE source IN ('blog', 'lifeflow');

COMMIT;

-- ── 검증 (별도 실행) ──
-- select 'subscribers' t, source, count(*) from newsletter_subscribers group by 1,2
-- union all
-- select 'sends' t, source, count(*) from newsletter_sends group by 1,2 order by 1,2;
