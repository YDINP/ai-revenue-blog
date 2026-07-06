import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ai-revenue-blog.vercel.app',  // Vercel 배포 URL 확정
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/dashboard'),
    }),
  ],
  output: 'static',
  build: {
    format: 'directory',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
