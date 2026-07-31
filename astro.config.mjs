import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { visit, SKIP } from 'unist-util-visit';
import { readdirSync, readFileSync } from 'node:fs';

// noindex 글의 슬러그 집합. 사이트맵에서 빼기 위해 빌드 시점에 frontmatter 를 직접 읽는다.
// (@astrojs/sitemap 의 filter 는 URL 문자열만 받아서 frontmatter 를 볼 수 없다)
function noindexSlugs() {
  try {
    return new Set(
      readdirSync('src/blog')
        .filter((f) => f.endsWith('.md'))
        .filter((f) => {
          // ⚠️ 앞 N자만 훑으면 안 된다 — 이 글들은 faq·image 객체 때문에 frontmatter 가
          //    2,000자를 넘는 경우가 흔해서 82개 중 16개만 잡혔다. 블록을 정확히 잘라 쓴다.
          const fm = readFileSync(`src/blog/${f}`, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
          return !!fm && /^noindex:\s*true\s*$/m.test(fm[1]);
        })
        .map((f) => f.replace(/\.md$/, ''))
    );
  } catch {
    return new Set();   // 읽기 실패 시 사이트맵을 통째로 비우지 않는다
  }
}
const NOINDEX = noindexSlugs();

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
      //
      // 같은 이유로 noindex 글(82개)도 뺀다. 실측(07-31) 결과 이 사이트맵 197개 URL 중
      // 308로 이전되는 건 99개뿐이고 98개는 200 + `noindex, follow` 였다. 지금 이 사이트맵의
      // 유일한 임무는 구글이 구 URL을 다시 크롤해 308을 보게 하는 것인데, 절반이 "색인하지
      // 말라"고 표시된 페이지면 크롤 예산이 그쪽으로 새고 사이트맵 품질 신호도 깎인다.
      // (구글 가이드도 사이트맵에는 색인 가능한 정규 URL만 넣으라고 한다)
      // ⚠️ 이 사이트맵은 07-28 재제출 후에도 isPending·마지막 다운로드 2026-02-26 상태다.
      filter: (page) => {
        if (page.includes('/dashboard') || page.includes('/blog/tags/')) return false;
        const m = page.match(/\/blog\/([^/]+)\/?$/);
        return !(m && NOINDEX.has(m[1]));
      },
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
