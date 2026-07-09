# PRD — 대시보드 리모델링 (dashboard.astro)

> 2026-07-09 | 요청: "쓸데없는 애니메이션 다 빼고, 최신 대시보드 트렌드 리서치해서 전체 리모델링"

## 배경

`/dashboard`는 TechFlow+LifeFlow 통합 운영 대시보드. 기능(Supabase RPC, RSS, 탭, 댓글관리)은
완성돼 있으나 스타일이 3차례 패치 누적(기본 + 가시성 패스 + 다듬기 패스)으로 비일관적이고,
장식성 애니메이션(펄스, 호버 리프트, 바 트랜지션, 글로우)이 많음.

## 리서치 근거 (2026 대시보드 트렌드)

- **미니멀·인지부하 최소화**: 화면의 모든 요소는 의사결정을 돕거나 제거 대상
  ([Think Design 2026 Do's & Don'ts](https://think.design/blog/dashboard-design-in-2026-dos-and-donts/))
- **KPI 상단 고정 계층**: 핵심 지표 → 트렌드 → 상세 순 수직 계층, "one insight per scroll"
  ([Fuselab 2026 trends](https://fuselabcreative.com/top-dashboard-design-trends-2025/))
- **절제된 색**: 무지개 금지, 색 의미 일관성, 색 단독 의미 전달 금지 (아이콘/라벨 병행)
- **다크모드 기본 + Tailwind 계열 컴포넌트 시스템** (shadcn/Tremor 스타일이 사실상 표준)
- **3D/과장 차트 금지, 파이 남용 금지, 스파크라인·스몰멀티플 선호**
- dataviz 스킬 규격: thin marks, 세그먼트 2px 서피스 갭, recessive grid, 검증 팔레트

## 설계 결정

| 항목 | 결정 |
|---|---|
| 애니메이션 | 전부 제거. 유일한 예외 = 로딩 스피너(기능적 피드백) |
| 색 시스템 | 뉴트럴 zinc 다크(#0a0a0b bg / #131316 surface), 헤어라인 보더, 섀도 제거 |
| 마크 색 | 그라데이션 → 단색. TF=#3b82f6, LF=#16a34a (2-시리즈), 카테고리 7색 validator 통과본 |
| 상단 액센트 스트립 | 제거 (장식). 카드 라벨은 균일한 muted 대문자 마이크로라벨 |
| 타이포 | Pretendard, 값=tabular-nums 1.75rem/700, 라벨=0.75rem muted uppercase, 섹션=0.875rem/600 |
| 이모지 | 데코성(탭·카드 아이콘) 제거, 기능성(이벤트 타입 아이콘, 메달)은 유지 |
| DOM/JS | 클래스·ID 전부 유지 (JS 의존). style 블록만 단일 시스템으로 재작성 |
| 반응형 | 기존 브레이크포인트 유지 + 769~1100px 2열, body flex min-width:0 픽스 유지 |

## 비범위 (Out of scope)

- 기능 변경, RPC/데이터 로직, 탭 구조 변경 없음
- 신규 차트 라이브러리 도입 없음 (기존 CSS 차트 유지)

## 완료 기준

1. `npm run build` 성공
2. 데스크톱(1440)/모바일(390) 스크린샷에서 레이아웃 깨짐·오버플로 없음
3. `@keyframes`가 스피너 1개만 남음, `transition` 속성 0개
4. 카테고리 팔레트 validator PASS (새 서피스 대비)
