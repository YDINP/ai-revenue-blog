-- 뉴스레터 source 통합: blog(TF) / lifeflow(LF) → mg(뭉게)
--
-- 왜: TF·LF 는 mungge.com 으로 301 통합됐다. 그런데 뭉게 인라인 구독 폼(scripts/wp-widget.js)이
-- 카테고리를 추측해 source='blog'|'lifeflow' 로 보내고 있었고, 발송 파이프라인
-- (api/_newsletter.js)은 레지스트리(api/_blogs.js)의 source 로 대상을 고른다.
-- 레지스트리에서 tf/lf 를 지우면 그 구독자들이 발송 대상에서 통째로 빠진다.
--
-- ⚠️ (source, email) 유니크 제약이 있으므로 한 사람이 TF·LF 둘 다 구독한 경우 그냥 UPDATE 하면
-- 충돌한다 → 이메일 기준으로 1건만 남기고(가장 먼저 구독한 행) 나머지는 지운 뒤 UPDATE 한다.
--
-- Supabase SQL Editor 에서 1회 실행. VIP(playcast)는 여전히 별개 사이트라 건드리지 않는다.

BEGIN;

-- ── 0. 실행 전 현황 (결과 확인용) ──
SELECT 'before' AS phase, source, count(*) AS subscribers
FROM newsletter_subscribers
GROUP BY source
ORDER BY source;

-- ── 1. 이미 mg 로 있는 이메일과 겹치는 레거시 행 제거 ──
-- (뭉게 폼이 'mg' 로 바뀐 뒤 재구독한 사람 — 레거시 쪽이 잉여)
DELETE FROM newsletter_subscribers a
WHERE a.source IN ('blog', 'lifeflow')
  AND EXISTS (
    SELECT 1 FROM newsletter_subscribers b
    WHERE b.source = 'mg' AND lower(b.email) = lower(a.email)
  );

-- ── 2. blog·lifeflow 양쪽에 같은 이메일이 있으면 먼저 구독한 1건만 남긴다 ──
DELETE FROM newsletter_subscribers a
WHERE a.source IN ('blog', 'lifeflow')
  AND EXISTS (
    SELECT 1 FROM newsletter_subscribers b
    WHERE b.source IN ('blog', 'lifeflow')
      AND lower(b.email) = lower(a.email)
      AND (b.created_at < a.created_at OR (b.created_at = a.created_at AND b.id < a.id))
  );

-- ── 3. 남은 레거시 구독자를 뭉게로 이관 ──
UPDATE newsletter_subscribers
SET source = 'mg'
WHERE source IN ('blog', 'lifeflow');

-- ── 4. 발송 이력도 함께 이관 ──
-- 이관하지 않으면 sentUrls('mg') 가 비어 있어서 이미 보낸 글이 다시 발송된다.
-- (source, post_url) 유니크 충돌 대비 — mg 에 같은 URL 이 이미 있으면 레거시 행을 버린다.
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
      AND (b.created_at < a.created_at OR (b.created_at = a.created_at AND b.id < a.id))
  );

UPDATE newsletter_sends
SET source = 'mg'
WHERE source IN ('blog', 'lifeflow');

-- ── 5. 실행 후 현황 ──
SELECT 'after' AS phase, source, count(*) AS subscribers
FROM newsletter_subscribers
GROUP BY source
ORDER BY source;

COMMIT;
