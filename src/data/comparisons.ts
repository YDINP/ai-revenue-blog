// 프로그래매틱 SEO — 인디 게임개발 "X vs Y" 비교 허브 데이터.
// 새 비교를 추가하려면 이 배열에 항목 하나만 넣으면 /compare/<slug>/ 가 자동 생성된다.
// 수치는 반드시 공개 출처 기준의 실제 값만 기입(허위 스펙 금지). 변동 항목은 updated 갱신.

export interface CompareOption {
  name: string;
  tagline: string;
  pros: string[];
  cons: string[];
  best: string; // 이런 사람에게
}

export interface CompareRow {
  label: string;
  values: string[]; // options 순서와 1:1
  highlight?: 'min' | 'max'; // 숫자형일 때 강조(선택)
}

export interface RelatedLink {
  title: string;
  url: string;
}

export interface Comparison {
  slug: string;
  title: string;
  description: string;
  updated: string; // YYYY-MM-DD
  intro: string;
  options: CompareOption[];
  rows: CompareRow[];
  verdict: string;
  faq: { q: string; a: string }[];
  related: RelatedLink[];
}

export const comparisons: Comparison[] = [
  {
    slug: 'game-engine-unity-vs-unreal-vs-godot-2026',
    title: '게임 엔진 비교 2026: 유니티 vs 언리얼 vs 고닷, 인디는 뭘 쓸까',
    description:
      '유니티·언리얼·고닷(Godot)을 비용·로열티·언어·2D/3D 강점·학습 난이도로 2026년 기준 비교하고, 인디 개발자에게 맞는 엔진을 정리했습니다.',
    updated: '2026-07-20',
    intro:
      '엔진 선택은 프로젝트 수명 내내 따라오는 결정입니다. 그래픽 목표, 팀 언어, 출시 플랫폼, 그리고 "수익이 났을 때 얼마를 떼이나"까지 함께 봐야 합니다. 세 엔진을 핵심 기준으로 갈라 드립니다.',
    options: [
      {
        name: 'Unity',
        tagline: 'C# · 모바일/2D 인디 표준',
        pros: ['방대한 에셋 스토어·튜토리얼', '모바일 빌드·광고 SDK 생태계 최강', 'C# — 진입장벽 낮음'],
        cons: ['고품질 3D는 언리얼 대비 손이 더 감', '요금제·정책 변동 이력(런타임피 논란)'],
        best: '모바일·2D·라이트 3D 인디, 광고 수익화 중심',
      },
      {
        name: 'Unreal Engine',
        tagline: 'C++/블루프린트 · 고품질 3D',
        pros: ['최상급 렌더링(나나이트·루멘)', '블루프린트로 코딩 없이 프로토타입', '콘솔·AAA 파이프라인 성숙'],
        cons: ['매출 $1M 초과분 5% 로열티', '프로젝트·빌드 무겁고 학습 곡선 가파름'],
        best: '고퀄 3D·콘솔 지향, 비주얼이 핵심인 프로젝트',
      },
      {
        name: 'Godot',
        tagline: 'MIT 오픈소스 · 경량 2D 강자',
        pros: ['완전 무료·로열티 0(오픈소스)', '가볍고 2D 워크플로 뛰어남', 'GDScript로 빠른 반복'],
        cons: ['3D·콘솔 지원은 아직 성장 중', '에셋·상용 플러그인 생태계가 상대적으로 작음'],
        best: '2D·초경량 프로젝트, 비용 0·오픈소스 선호',
      },
    ],
    rows: [
      { label: '라이선스/비용', values: ['Personal 무료(매출 한도)·Pro 구독', '무료(엔진)', '완전 무료(MIT)'] },
      { label: '매출 로열티', values: ['없음', '$1M 초과분 5%', '없음'], highlight: 'min' },
      { label: '주 언어', values: ['C#', 'C++ / 블루프린트', 'GDScript / C#'] },
      { label: '강점', values: ['모바일·2D·에셋 생태계', '고품질 3D·콘솔', '경량 2D'] },
      { label: '학습 난이도', values: ['낮음~중', '높음', '낮음'] },
      { label: '에셋/플러그인', values: ['매우 방대', '방대', '성장 중'] },
    ],
    verdict:
      '광고 수익화 모바일·2D면 Unity, 비주얼로 승부하는 3D·콘솔이면 Unreal, 비용 0·경량 2D·오픈소스 지향이면 Godot. "무엇을 만들 것인가"가 정해지면 답은 대체로 하나로 좁혀집니다.',
    faq: [
      {
        q: '인디 첫 게임, 뭘로 시작하는 게 좋나요?',
        a: '2D·모바일이면 Unity나 Godot이 진입이 쉽습니다. C#이 익숙하면 Unity, 비용 0과 가벼움을 원하면 Godot. 고품질 3D가 목표가 아니라면 처음부터 언리얼은 무거울 수 있습니다.',
      },
      {
        q: '언리얼 5% 로열티는 언제 발생하나요?',
        a: '제품 평생 총매출이 $1M을 넘는 시점부터 초과분에 대해 5%가 부과됩니다. 대부분의 초기 인디는 해당되지 않습니다.',
      },
      {
        q: 'Godot로 상업적 성공 사례가 있나요?',
        a: '있습니다. 특히 2D 인디에서 채택이 늘고 있고, 로열티·라이선스 비용이 전혀 없다는 점이 소규모 팀에 큰 장점입니다. 다만 대규모 3D·콘솔 출시엔 아직 손이 더 갈 수 있습니다.',
      },
    ],
    related: [
      { title: '게임 플랫폼 수수료 비교: 스팀·에픽·itch.io', url: '/compare/game-platform-fees-steam-vs-epic-vs-itch-2026/' },
      { title: '인디게임 수익화의 현실 5가지', url: '/blog/2026-02-26-game-2026-indie-game-monetization-reality-5-truths/' },
    ],
  },
  {
    slug: 'game-platform-fees-steam-vs-epic-vs-itch-2026',
    title: '게임 플랫폼 수수료 비교 2026: 스팀 30% vs 에픽 12% vs itch.io 10%',
    description:
      '같은 게임을 팔아도 플랫폼마다 손에 쥐는 돈이 다릅니다. 스팀·에픽·앱스토어·구글플레이·itch.io의 수수료율과 정산 조건을 2026년 기준으로 비교했습니다.',
    updated: '2026-07-20',
    intro:
      '수수료는 곧 마진입니다. 명목 요율이 낮아도 트래픽이 없으면 실매출이 안 나오고, 요율이 높아도 노출이 강하면 총이익이 더 클 수 있습니다. 숫자와 현실을 함께 봅니다.',
    options: [
      {
        name: 'Steam',
        tagline: 'PC 사실상 표준',
        pros: ['압도적 트래픽·위시리스트 알고리즘', '세일·커뮤니티 도구 강력'],
        cons: ['기본 30%로 요율은 높은 편'],
        best: 'PC 인디의 1순위 출시처',
      },
      {
        name: 'Epic Games Store',
        tagline: '가장 낮은 요율',
        pros: ['12% 저요율·언리얼 로열티 면제', '독점 지원 프로그램'],
        cons: ['스팀 대비 트래픽·발견성 약함'],
        best: '마진 극대화·언리얼 사용 프로젝트',
      },
      {
        name: 'itch.io',
        tagline: '개발자 친화 오픈마켓',
        pros: ['기본 10%(개발자가 조정 가능)', '자유로운 페이지·번들·데모'],
        cons: ['상업적 트래픽은 가장 적음'],
        best: '데모 배포·실험작·직접 홍보 기반',
      },
    ],
    rows: [
      { label: '기본 수수료', values: ['30%', '12%', '10%(조정 가능)'], highlight: 'min' },
      { label: '요율 완화', values: ['$10M·$50M 초과 시 25%·20%', '언리얼 로열티 면제', '개발자가 자율 설정'] },
      { label: '트래픽/발견성', values: ['최상', '중', '낮음'] },
      { label: '강점', values: ['노출·세일 생태계', '저요율', '자유도·데모'] },
    ],
    verdict:
      '대부분의 PC 인디는 트래픽 때문에 스팀을 기본으로 두되, 마진을 위해 에픽을 병행하고, 데모·실험은 itch.io로 돌리는 조합이 현실적입니다. "요율"만 보지 말고 "노출×요율"의 총이익으로 판단하세요.',
    faq: [
      {
        q: '수수료가 가장 낮은 곳은 어디인가요?',
        a: '명목 요율은 itch.io(기본 10%, 조정 가능)와 에픽(12%)이 가장 낮습니다. 다만 트래픽이 적어 실매출은 스팀이 더 큰 경우가 많습니다.',
      },
      {
        q: '스팀 30%는 협상 가능한가요?',
        a: '기본 요율은 고정이며, 누적 매출이 $10M·$50M을 넘으면 각각 25%·20%로 낮아집니다. 대부분의 인디에게는 30% 구간이 적용됩니다.',
      },
    ],
    related: [
      { title: '게임 엔진 비교: 유니티 vs 언리얼 vs 고닷', url: '/compare/game-engine-unity-vs-unreal-vs-godot-2026/' },
      { title: '게임 플랫폼 수수료 완벽 비교(상세 글)', url: '/blog/2026-07-02-game-game-platform-fees-comparison-2026-steam-epic-mobile-itch/' },
    ],
  },
];
