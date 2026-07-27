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
// communities: /generate 핫키워드의 1차 소스 — 커뮤니티 실시간 인기글에서 키워드 추출
//              ('geeknews' | 'hn' | 'ppomppu:<board>')
// newsQueries: 뉴스 검색어 폴백. 평소엔 커뮤니티 핫키워드(없으면 시드)에서 뽑는다

export const BLOGS = {
  tf: {
    key: 'tf',
    label: 'TechFlow (ai-revenue)',
    repo: 'YDINP/ai-revenue-blog',
    branch: 'master',
    contentDir: 'src/blog',
    site: 'https://ai-revenue-blog.vercel.app',
    gscSite: 'https://ai-revenue-blog.vercel.app/',   // Search Console URL 프리픽스 속성
    indexNowKey: 'f4a8e2c1b7d9306584ef1a2b3c4d5e6f',  // public/<key>.txt 로 호스팅됨
    vercel: 'ai-revenue-blog',
    source: 'blog',
    generator: 'daily-post.yml',
    // 개발자 커뮤니티(긱뉴스·HN)만 쓰면 화제가 개발 쪽으로 치우친다.
    // TechFlow 는 AI 활용·기기 리뷰·게임도 다루므로 소비자/게이머 커뮤니티를 함께 본다.
    communities: ['geeknews', 'hn', 'ppomppu:computer', 'ppomppu:phone', 'ruliweb:news'],
    newsQueries: ['AI 도구', '개발자 생산성', '인디게임'],
    useHackerNews: true,   // 기술 블로그만 (라이프스타일엔 코딩 글이 무의미)
  },
  lf: {
    key: 'lf',
    label: 'LifeFlow (life-revenue)',
    repo: 'YDINP/life-revenue-blog',
    branch: 'main',
    contentDir: 'src/blog',
    site: 'https://life-revenue-blog.vercel.app',
    gscSite: 'https://life-revenue-blog.vercel.app/',
    indexNowKey: 'c9d3f7a2e8b104569abc7d8e9f0a1b2c',
    vercel: 'life-revenue-blog',
    source: 'lifeflow',
    generator: 'daily-post.yml',
    // 재테크·건강·핫딜(소비) 게시판. 자유게시판은 정치·잡담이라 제외
    communities: ['ppomppu:money', 'ppomppu:health', 'ppomppu:ppomppu'],
    newsQueries: ['재테크 절세', '건강관리', '국내여행'],
  },
  pc: {
    key: 'pc',
    label: 'Playcast (virtual-in-playing)',
    repo: 'YDINP/playcast-blog',
    branch: 'master',
    contentDir: 'src/videos',
    site: 'https://virtual-in-playing.vercel.app',
    gscSite: 'https://virtual-in-playing.vercel.app/',  // GSC 동기화용(서비스계정을 이 속성 사용자로 추가해야 데이터 수집)
    indexNowKey: 'c35215b7a57806accdc3775204221bf6',    // public/<key>.txt 로 호스팅됨(playcast-blog)
    vercel: 'virtual-in-playing',
    source: 'playcast',
    generator: null,
  },
  mg: {
    key: 'mg',
    label: 'Mungge (mungge.com)',
    site: 'https://mungge.com',
    gscSite: 'https://mungge.com/',   // 도메인 속성이면 _gsc.js가 sc-domain:으로 자동 폴백
    // WordPress로 직접 운영하는 사이트 — repo/generator/source가 없다.
    // blogList() 소비처가 모두 이 필드들로 필터링하므로 일일리포트·뉴스레터·자동포스팅에서
    // 자동 제외되고, gscSite로 거르는 GSC 동기화·조회에만 잡힌다.
    repo: null,
    branch: null,
    vercel: null,
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
        // repo/vercel이 없는 항목(WordPress 직접 운영)도 있으므로 옵셔널로 접근한다
        b.repo?.toLowerCase().endsWith('/' + s) ||
        b.label.toLowerCase().includes(s) ||
        (b.vercel && b.vercel === s)
    ) || null
  );
}

export function blogList() {
  return Object.values(BLOGS);
}
