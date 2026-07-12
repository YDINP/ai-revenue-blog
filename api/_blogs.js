// 봇이 제어하는 블로그 레지스트리 (새 블로그 추가 시 여기에 한 항목만 추가)
//
// key        : 봇 명령에서 쓰는 짧은 별칭
// repo       : GitHub owner/name
// branch     : 배포 브랜치
// contentDir : 글 마크다운 디렉터리
// site       : 공개 URL
// vercel     : Vercel 프로젝트명 (배포/상태 조회)
// source     : analytics·comments 의 source 값 (없으면 통계 미연동)
// generator  : GitHub Actions 자동 포스팅 워크플로 파일 (없으면 /generate 불가)
// newsQueries: /generate 핫 키워드의 뉴스 검색어 (Google·Bing 두 엔진 공통)
// hnKeywords : Hacker News 상위글 중 이 블로그와 관련된 것만 남기는 필터 (없으면 HN 미사용)

export const BLOGS = {
  tf: {
    key: 'tf',
    label: 'TechFlow (ai-revenue)',
    repo: 'YDINP/ai-revenue-blog',
    branch: 'master',
    contentDir: 'src/blog',
    site: 'https://ai-revenue-blog.vercel.app',
    vercel: 'ai-revenue-blog',
    source: 'blog',
    generator: 'daily-post.yml',
    newsQueries: ['AI 도구', '개발자 생산성', '인디게임'],
    hnKeywords: ['\\bAI\\b', 'LLM', 'GPT', 'Claude', 'developer', 'programming', 'coding', 'game', 'startup', 'open.?source'],
  },
  lf: {
    key: 'lf',
    label: 'LifeFlow (life-revenue)',
    repo: 'YDINP/life-revenue-blog',
    branch: 'main',
    contentDir: 'src/blog',
    site: 'https://life-revenue-blog.vercel.app',
    vercel: 'life-revenue-blog',
    source: 'lifeflow',
    generator: 'daily-post.yml',
    newsQueries: ['재테크 절세', '건강관리', '국내여행'],
  },
  pc: {
    key: 'pc',
    label: 'Playcast (virtual-in-playing)',
    repo: 'YDINP/playcast-blog',
    branch: 'master',
    contentDir: 'src/videos',
    site: 'https://virtual-in-playing.vercel.app',
    vercel: 'virtual-in-playing',
    source: null,
    generator: null,
  },
};

// 'tf' / 'techflow' / 'ai-revenue' 등 느슨한 입력 허용
export function resolveBlog(input) {
  if (!input) return null;
  const s = String(input).toLowerCase().trim();
  if (BLOGS[s]) return BLOGS[s];
  return (
    Object.values(BLOGS).find(
      (b) =>
        b.repo.toLowerCase().endsWith('/' + s) ||
        b.label.toLowerCase().includes(s) ||
        b.vercel === s
    ) || null
  );
}

export function blogList() {
  return Object.values(BLOGS);
}
