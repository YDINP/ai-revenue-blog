// IndexNow 색인 요청 (빙·네이버·야ndex 등이 참여하는 공용 프로토콜)
// 키 파일은 각 블로그 public/<key>.txt 로 이미 호스팅돼 있다 (기존 indexnow.yml 과 동일 키).
//
// 구글은 IndexNow 미참여 + sitemap ping 도 2023년 폐지 → 구글 색인은 Search Console 에
// 의존한다(자연 크롤). 여기서 처리하는 건 빙/네이버 계열이다.

import { resolveBlog } from './_blogs.js';
import { listPosts } from './_github.js';
import { escapeHtml } from './_shared.js';

const ENDPOINT = 'https://api.indexnow.org/indexnow';

export async function submitIndexNow(blog, urls) {
  if (!blog.indexNowKey) throw new Error(`${blog.label} 은 IndexNow 키가 없습니다`);
  const host = blog.site.replace(/^https?:\/\//, '');
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host,
      key: blog.indexNowKey,
      keyLocation: `${blog.site}/${blog.indexNowKey}.txt`,
      urlList: urls,
    }),
  });
  // 200/202 = 접수됨. 400=형식오류, 403=키 불일치, 422=URL/호스트 불일치, 429=과다요청
  return { status: r.status, ok: r.ok || r.status === 202 };
}

// /index <blog> [slug]  — slug 없으면 최근 글 10개 + 홈/목록
export async function indexMessage(blogArg, slug) {
  const blog = resolveBlog(blogArg);
  if (!blog) throw new Error('블로그를 지정하세요: <code>mg</code>(뭉게) / <code>pc</code>(VIP)');
  if (!blog.indexNowKey) throw new Error(`${escapeHtml(blog.label)} 은 IndexNow 미설정`);

  let urls;
  if (slug && slug !== 'all') {
    urls = [`${blog.site}/blog/${slug}/`];
  } else {
    // all = 전 글 (색인이 거의 안 된 상태에서 한 번에 밀어넣을 때)
    const posts = await listPosts(blog, slug === 'all' ? 500 : 10);
    urls = [blog.site + '/', `${blog.site}/blog/`, ...posts.map((p) => `${blog.site}/blog/${p.slug}/`)];
  }

  const res = await submitIndexNow(blog, urls);
  const head = res.ok
    ? `✅ <b>색인 요청 완료</b> — ${escapeHtml(blog.label.split(' (')[0])}`
    : `⚠️ <b>색인 요청 실패</b> (HTTP ${res.status})`;
  const note =
    res.status === 403
      ? '\n키 파일이 사이트에 없거나 값이 다릅니다.'
      : res.status === 429
        ? '\n요청이 너무 잦습니다. 잠시 후 다시 시도하세요.'
        : '';

  return [
    head,
    '',
    `제출 URL ${urls.length}개`,
    ...urls.slice(0, 5).map((u) => `· ${escapeHtml(u.replace(blog.site, ''))}`),
    urls.length > 5 ? `  …외 ${urls.length - 5}개` : '',
    '',
    '<i>빙·네이버 등 IndexNow 참여 엔진에 즉시 통보됩니다. 구글은 IndexNow 를 쓰지 않아 자연 크롤을 기다려야 합니다.</i>' +
      note,
  ]
    .filter(Boolean)
    .join('\n');
}
