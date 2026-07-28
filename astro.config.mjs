import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { visit, SKIP } from 'unist-util-visit';

// 표를 .table-scroll 로 감싸 (1) 좁은 표는 컨테이너 폭을 꽉 채우고
// (2) 넓은 표만 가로 스크롤되게 한다. table 자체에 display:block+overflow-x
// 를 주면 좁은 표가 내용폭으로 줄어 왼쪽에 몰리는 문제가 생기므로 wrapper 로 분리.
function rehypeWrapTables() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'table' || !parent || typeof index !== 'number') return;
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-scroll'] },
        children: [node],
      };
      return [SKIP, index + 1];
    });
  };
}

export default defineConfig({
  site: 'https://ai-revenue-blog.vercel.app',  // Vercel 배포 URL 확정
  integrations: [
    sitemap({
      // mungge.com 이전 중: 태그 아카이브는 mungge에 대응 페이지가 없어 301로만 흘려보낸다.
      // 사이트맵에 남겨두면 이전 중인 구도메인이 계속 색인을 요청해 이전 신호가 희석된다.
      filter: (page) => !page.includes('/dashboard') && !page.includes('/blog/tags/'),
    }),
  ],
  output: 'static',
  build: {
    format: 'directory',
  },
  markdown: {
    rehypePlugins: [rehypeWrapTables],
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
