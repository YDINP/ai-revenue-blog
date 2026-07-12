// 연재 시리즈 정의 (중앙 관리) — 기존 글 frontmatter 무수정, 순서/멤버십을 여기서만 관리.
// slug 는 확장자·경로 없는 파일명. BlogPostLayout/허브에서 이 파일을 참조.

export interface SeriesStep {
  order: number;
  label: string; // 단계 이름 (예: "기획·프로토타입")
  slug: string; // 대상 글 slug
  blurb: string; // 한 줄 요약(네비게이션 표시용)
}

export interface Series {
  id: string; // URL 슬러그 (/series/<id>/)
  title: string;
  description: string;
  steps: SeriesStep[];
}

export const seriesList: Series[] = [
  {
    id: 'indie-roadmap',
    title: '인디게임 개발 로드맵: 시작부터 출시까지',
    description:
      '아이디어 한 줄에서 스팀 출시·수익화까지, 인디게임 개발 여정 전체를 순서대로 안내하는 연재 시리즈입니다. 각 단계마다 실전 가이드로 이어집니다.',
    steps: [
      {
        order: 1,
        label: '기획·프로토타입',
        slug: '2026-07-11-game-indie-game-concept-prototype-2026-from-idea-to-vertical-slice',
        blurb: '아이디어 검증부터 수직 슬라이스까지 — 만들기 전에 증명하기',
      },
      {
        order: 2,
        label: '엔진·도구 선택',
        slug: '2026-02-07-game-engine-comparison-2026',
        blurb: 'Unity·Unreal·Godot·Phaser·Cocos, 내 프로젝트에 맞는 엔진 고르기',
      },
      {
        order: 3,
        label: '개발·에셋',
        slug: '2026-07-07-game-ai-coding-tools-indie-game-development-2026-cursor-claude-code',
        blurb: 'AI 코딩 도구와 에셋으로 개발 속도 끌어올리기',
      },
      {
        order: 4,
        label: '마케팅·위시리스트',
        slug: '2026-07-01-game-indie-game-marketing-zero-budget-2026-wishlist-growth',
        blurb: '0원으로 시작해 위시리스트를 쌓는 실전 마케팅',
      },
      {
        order: 5,
        label: '넥스트페스트·데모',
        slug: '2026-07-06-game-steam-next-fest-guide-2026-wishlist-boost',
        blurb: '데모와 넥스트페스트로 위시리스트 폭증시키기',
      },
      {
        order: 6,
        label: '스팀 출시',
        slug: '2026-06-30-game-indie-game-steam-launch-guide-2026-wishlist-to-launch',
        blurb: '위시리스트를 판매로 — 출시일 준비 체크리스트',
      },
      {
        order: 7,
        label: '수익화·사후 운영',
        slug: '2026-02-26-game-2026-indie-game-monetization-reality-5-truths',
        blurb: '출시 후 수익화의 현실과 지속 가능한 운영',
      },
    ],
  },
];

// slug → { series, step, prev, next } (없으면 null)
export function seriesForSlug(slug: string): {
  series: Series;
  step: SeriesStep;
  prev: SeriesStep | null;
  next: SeriesStep | null;
} | null {
  for (const series of seriesList) {
    const idx = series.steps.findIndex((s) => s.slug === slug);
    if (idx !== -1) {
      return {
        series,
        step: series.steps[idx],
        prev: idx > 0 ? series.steps[idx - 1] : null,
        next: idx < series.steps.length - 1 ? series.steps[idx + 1] : null,
      };
    }
  }
  return null;
}

export function getSeries(id: string): Series | undefined {
  return seriesList.find((s) => s.id === id);
}
