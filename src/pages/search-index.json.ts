import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// 검색 팔레트용 경량 인덱스(SSOT). 전체 글을 페이지마다 DOM으로 인라인하던 것을
// 이 한 파일로 분리 → HTML 대폭 경량화, 팔레트를 열 때만 fetch/렌더한다.
// 필드명은 바이트 절약을 위해 축약: id, t(title) c(category) d(desc) g(tags) p(pubDate ms) i(img) a(alt)
export const GET: APIRoute = async () => {
  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime()
  );
  const data = posts.map((p) => ({
    id: p.id,
    t: p.data.title,
    c: p.data.category,
    d: p.data.description,
    g: (p.data.tags || []).join(' '),
    p: new Date(p.data.pubDate).getTime(),
    i: p.data.image?.url || '',
    a: p.data.image?.alt || '',
  }));
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
