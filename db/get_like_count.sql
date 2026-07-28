-- 글 1편의 추천 수 — 뭉게(WordPress) 추천 버튼이 서버 집계를 읽기 위한 RPC.
--
-- 기존 추천 버튼(Astro blog-post.js)은 카운트를 localStorage 에만 저장해서
-- 브라우저마다 숫자가 달랐다. 뭉게에 새로 다는 버튼은 이 함수로 실제 집계를 읽는다.
-- PostgREST 의 Prefer: count=exact 를 쓰지 않는 이유: Content-Range 헤더를 읽어야 하는데
-- 크로스오리진에서 노출 여부에 의존하게 된다. 숫자를 그대로 돌려주는 편이 확실하다.
create or replace function public.get_like_count(p_slug text)
returns integer
language sql
security definer
stable
as $$
  select count(*)::int
  from public.analytics
  where event_type = 'like'
    and metadata->>'slug' = p_slug;
$$;

grant execute on function public.get_like_count(text) to anon;
