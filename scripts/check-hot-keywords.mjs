// 실데이터로 /generate 핫 키워드 후보를 확인 (GITHUB_TOKEN 필요)
// 실행: GITHUB_TOKEN=$(gh auth token) node scripts/check-hot-keywords.mjs [tf|lf]

import { resolveBlog } from '../api/_blogs.js';
import { communityHot } from '../api/_community.js';
import { hotKeywords } from '../api/_trends.js';

const blog = resolveBlog(process.argv[2] || 'tf');

const { getFileJson } = await import('../api/_github.js');
const seeds = await getFileJson(blog, 'scripts/category-seeds.json').catch(() => null);
const ch = await communityHot(blog, seeds).catch(() => ({ keywords: [], posts: [] }));
console.log(`\n[${blog.label}] 커뮤니티 실시간 핫키워드 (= 뉴스 검색어)`);
console.log('  ' + (ch.keywords.map((k) => `${k.keyword}(${k.count})`).join(' · ') || '(없음)'));

const cands = await hotKeywords(blog);
console.log(`\n후보 ${cands.length}개\n`);
for (const c of cands) console.log(`${c.src.padEnd(9)} ${c.label}`);
