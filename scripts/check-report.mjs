// 실데이터로 일일 리포트 본문을 렌더링해 확인 (텔레그램 전송 없음)
// 실행: GITHUB_TOKEN=$(gh auth token) node scripts/check-report.mjs [YYYY-MM-DD]

import { reportMessage } from '../api/_report.js';

const text = await reportMessage(process.argv[2]);
console.log(text.replace(/<\/?b>/g, '').replace(/<\/?i>/g, '').replace(/<\/?code>/g, '`'));
