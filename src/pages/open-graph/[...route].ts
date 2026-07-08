import { getCollection } from 'astro:content';
import { OGImageRoute } from 'astro-og-canvas';

export const prerender = true;

// 글별 브랜드 OG 카드 이미지를 빌드 시 생성 (/open-graph/<slug>.png)
const entries = await getCollection('blog', ({ data }) => !data.draft);
const pages = Object.fromEntries(entries.map((e) => [e.id, e.data]));

const catAccent: Record<string, [number, number, number]> = {
  ai: [124, 92, 246],
  dev: [34, 211, 238],
  review: [236, 72, 153],
  game: [168, 85, 247],
};

const _route = await OGImageRoute({
  param: 'route',
  pages,
  getImageOptions: (_id, page: any) => {
    const cat = (page.category || '').toLowerCase();
    const accent = catAccent[cat] || [124, 92, 246];
    return {
      title: page.title,
      description: page.description,
      logo: undefined,
      bgGradient: [
        [15, 14, 35],
        [26, 20, 58],
      ],
      border: { color: accent, width: 14, side: 'inline-start' },
      padding: 70,
      font: {
        title: {
          color: [255, 255, 255],
          size: 62,
          weight: 'Bold',
          lineHeight: 1.25,
          families: ['Pretendard'],
        },
        description: {
          color: [190, 195, 220],
          size: 30,
          lineHeight: 1.4,
          families: ['Pretendard'],
        },
      },
      fonts: [
        './src/assets/og-fonts/Pretendard-Bold.otf',
        './src/assets/og-fonts/Pretendard-Regular.otf',
      ],
    };
  },
});

export const getStaticPaths = _route.getStaticPaths;
export const GET = _route.GET;
