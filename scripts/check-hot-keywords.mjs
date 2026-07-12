// 실데이터로 /generate 핫 키워드 후보를 확인 (GITHUB_TOKEN 필요)
// 실행: GITHUB_TOKEN=$(gh auth token) node scripts/check-hot-keywords.mjs [tf|lf]

import { resolveBlog } from '../api/_blogs.js';
import { hotKeywords } from '../api/_trends.js';

const blog = resolveBlog(process.argv[2] || 'tf');
const cands = await hotKeywords(blog);

console.log(`\n[${blog.label}] 후보 ${cands.length}개\n`);
for (const c of cands) console.log(`${c.src.padEnd(5)} ${c.label}`);
