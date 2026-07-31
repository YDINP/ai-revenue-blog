// 봇이 제어하는 블로그 레지스트리 (새 블로그 추가 시 여기에 한 항목만 추가)
//
// key        : 봇 명령에서 쓰는 짧은 별칭
// repo       : GitHub owner/name
// branch     : 배포 브랜치
// contentDir : 글 마크다운 디렉터리
// site       : 공개 URL
// vercel     : Vercel 프로젝트명 (배포/상태 조회)
// source     : analytics·comments 의 source 값 (없으면 통계 미연동)
// ga4Property: GA4 속성 ID(숫자). 설정하면 유입경로가 ga4_daily 로 동기화된다.
//              속성 ID 확인: /api/gsc-sync?ga4=properties&secret=<CRON_SECRET>
// generator  : GitHub Actions 자동 포스팅 워크플로 파일 (없으면 /generate 불가)
// communities: /generate 핫키워드의 1차 소스 — 커뮤니티 실시간 인기글에서 키워드 추출
//              ('geeknews' | 'hn' | 'ppomppu:<board>')
// newsQueries: 뉴스 검색어 폴백. 평소엔 커뮤니티 핫키워드(없으면 시드)에서 뽑는다

// 2026-07-30 — TF(ai-revenue) · LF(life-revenue) 엔트리 삭제.
// 두 사이트는 mungge.com 으로 301 통합돼 리다이렉트 셸만 남았다(자체 조회 한 자릿수).
// 소스로 남겨 두면 대시보드·리포트가 죽은 사이트를 1급 지표로 세우고, 뭉게가 곁가지로 보인다.
// ※ automation/daily-run.mjs 의 tf/lf 는 여기와 무관한 **발행 레인(silo)** 이다
//   (tf=테크·개발, lf=생활·재테크 → 발행처는 mungge WP 하나). 그건 그대로 쓴다.
export const BLOGS = {
  mg: {
    key: 'mg',
    label: 'Mungge (mungge.com)',
    site: 'https://mungge.com',
    // WordPress RSS 는 /rss.xml 이 아니라 /feed/ 다 (/rss.xml 은 404)
    rssPath: '/feed/',
    gscSite: 'https://mungge.com/',   // 도메인 속성이면 _gsc.js가 sc-domain:으로 자동 폴백
    // Site Kit 이 심은 GA4 태그(GT-K525DMFX)의 속성. WP 관리화면으로는 유입경로 상세를 볼 수
    // 없어서 GA4 Data API 로 끌어와 대시보드에서 본다.
    ga4Property: process.env.GA4_PROPERTY_MG || '547003762',
    // analytics·comments·newsletter 의 source 값. 뭉게 트래커(scripts/wp-*.js)가 'mg' 로 쏜다.
    source: 'mg',
    // 커뮤니티 화제(추천 주제)는 TF·LF 두 레인 것을 합쳐 여기로 옮겼다 — 뭉게가 두 실로를
    // 모두 품고 있으므로 개발/소비자/재테크 게시판을 함께 본다.
    communities: [
      'geeknews', 'hn', 'ppomppu:computer', 'ppomppu:phone', 'ruliweb:news',
      'ppomppu:money', 'ppomppu:health', 'ppomppu:ppomppu',
    ],
    newsQueries: ['AI 도구', '개발자 생산성', '인디게임', '재테크 절세', '건강관리', '국내여행'],
    useHackerNews: true,
    // 콘텐츠는 WordPress 가 SSOT 다 → GitHub repo 기반 글 명령(/posts /newpost /edit /delpost /deploy)은
    // 쓸 수 없다. repo·vercel 을 null 로 두면 그 소비처들이 자동으로 거부한다.
    repo: null,
    branch: null,
    vercel: null,
    // 자동 포스팅 워크플로는 **repo 와 분리**해 둔다. 워크플로는 이 레포(ai-revenue-blog)에 있고
    // 발행처는 mungge WP 다(scripts/generate-post.mjs → autoPublishToWP). repo 에 같이 넣으면
    // /posts·/edit 이 이관 전 Astro 마크다운(정지된 자료)을 만지게 된다.
    // ⚠️ 이 워크플로는 2026-07-20부터 실패 중이다(게이트웨이 이슈). 실제 발행 경로는 로컬
    //    automation/daily-run.mjs 이고, 여기 배선은 워크플로가 복구되면 봇에서 바로 쓰기 위한 것.
    generator: 'daily-post.yml',
    generatorRepo: 'YDINP/ai-revenue-blog',
    generatorRef: 'master',
  },
  // TF(구 도메인) — **이전 추적 전용**. 대시보드·리포트·동기화에는 절대 올라오지 않는다.
  // 07-30에 엔트리를 통째로 지웠더니 scripts/migration-status.mjs 가 'unknown blog tf' 로
  // 죽었다. 301 이전이 아직 진행 중(07-27 배포)이라 "구글이 구 도메인 canonical 을
  // mungge 로 바꿨는가"를 재는 수단이 사라지면 이전이 되고 있는지 알 수가 없다.
  // migrationOnly 플래그로 집계에서만 빼고 GSC 조회 통로는 살려 둔다.
  tf: {
    key: 'tf',
    label: 'TechFlow (이전 전 구 도메인 · 추적 전용)',
    site: 'https://ai-revenue-blog.vercel.app',
    gscSite: 'https://ai-revenue-blog.vercel.app/',
    migrationOnly: true,   // ← gsc_daily 저장·리포트·뉴스레터 제외
    source: null,
    repo: null,
    branch: null,
    vercel: null,
    generator: null,
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
};

// 'mg' / 'mungge' / 'playcast' 등 느슨한 입력 허용
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

// 기본은 **운영 중인 블로그만**. migrationOnly(구 도메인 TF)는 대시보드·리포트·뉴스레터·
// 텔레그램 목록 어디에도 나오면 안 된다(07-30에 엔트리를 지운 이유가 그것이다).
// 이전 추적처럼 죽은 사이트까지 봐야 하는 소수 경로만 blogList(true) 로 명시해서 가져간다.
// 기본값을 "제외"로 둔 이유: 새 소비처가 생겼을 때 아무것도 안 해도 안전한 쪽으로 틀리게 하려고.
export function blogList(includeMigrationOnly = false) {
  const all = Object.values(BLOGS);
  return includeMigrationOnly ? all : all.filter((b) => !b.migrationOnly);
}
