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

---

## Phase 2 — 레이아웃 재구성 (벤토 그리드)

> 요청: "대시보드 구성 레이아웃 디자인들 자체를 전부 재구성"

### 문제

Phase 1은 색·타이포·애니메이션(표면)만 정비. 전체 요약 탭은 여전히
모든 섹션이 **전폭 세로 단일 컬럼**으로 쌓여 스크롤 과다·계층 부재
(테이블/히트맵이 히어로 KPI와 같은 시각 비중).

### 재구성 (데스크톱 >1100px, 12컬럼 벤토)

| Row | 구성 |
|---|---|
| 1 | KPI 히어로 ×4 (span 3) |
| 2 | 7일 트렌드(8) + 오늘 현황 2×2 스탯(4) |
| 3 | 시간대별 조회(4) + 히트맵(8) |
| 4 | Top Pages(4) + Live Activity(4) + 추천 TOP(4) |
| 5 | 날짜별 상세 30일 테이블 (12) |
| 6 | TechFlow(6) + LifeFlow(6) 콘텐츠 |
| 7 | System Status(8) + Quick Links(4) |

- 기존 `.traffic-section`(지표+시간대+Top/Live+추천 한 카드)을 해체 →
  각 위젯을 독립 `.panel` 셀로 분리, 관련끼리 나란히 배치
- `#refresh-traffic`(JS 바인딩)은 오늘 현황 패널 헤더로 이동
- **모든 JS ID 보존** (splice 후 22개 ID 각 1개 확인). 데이터 로직 무변경
- 반응형: ≤1100px는 벤토 해제(단일 컬럼, 가독성 우선), ≤768px 완전 스택
- 결과: 전체 높이 3564→2975px, 관련 위젯 그룹화로 스캔성 향상

### 완료 기준 (Phase 2)

1. build 성공 / 22개 JS ID 보존
2. 데스크톱 벤토 정상, 태블릿·모바일 오버플로 없음(1000=1000, 390=390)

---

## Phase 3 — 컬러풀 다크 비주얼 리디자인

> 요청: "스타일 자체를 전체적으로 눈에 보기 쉽게, 트렌디하게 리디자인 및 항목 재구성"
> 사용자 선택(AskUserQuestion): **컬러풀 다크** — 다크 배경 유지 + 컬러 강조

### 배경

Phase 1~2가 미니멀·플랫이라 "밋밋하다"는 피드백(3번째 리디자인 요청).
다크는 유지하되 시각 에너지·스캔성을 높이는 방향으로 전환.

### 적용

- **KPI 아이콘 칩**: 카드마다 틴트 배경 라운드 칩 + Lucide 계열 라인 아이콘
  (file-text/layers/eye/cart). frontmatter `ICONS` 맵 + `set:html` 주입
- **컬러 수치**: KPI 값을 카드 테마색으로(밝은 톤 유지, 가독성 확보).
  카드 우상단 은은한 컬러 글로우(`::after` radial, opacity 0.12)
- **델타 칩**: Page Views=오늘/어제 %(↑초록/↓빨강 화살표+색 이중 인코딩),
  Coupang=오늘 클릭 수. `setDeltaChip()` 헬퍼
- **미니 스파크라인**: Page Views 카드에 실제 7일 조회수 CSS 바(오늘 강조).
  `renderKpiSpark()` — 실데이터만(허위 차트 금지), 어제/오늘은 trend RPC 재사용
- **섹션 라인 아이콘**: 12개 섹션/패널 헤더에 테마색 아이콘
  (trending-up/clock/bar-chart/grid/list/activity/heart/table/pie/server/link)
- **전 탭 일관 적용**: TechFlow·LifeFlow·쿠팡·댓글 탭 KPI 카드도 동일 처리
  (color-cyan/red 변형 추가, message/calendar/alert/percent 아이콘 추가)
- **무애니메이션 원칙 유지**: transition 0개, keyframes는 로딩 스피너만.
  아이콘·글로우·스파크라인 전부 정적

### 완료 기준 (Phase 3)

1. build 성공, transition 0 / keyframes=spin만
2. 데스크톱·전 탭·모바일 정상, 오버플로 없음(390=390)
3. 스파크라인은 실제 데이터만(허위 시각화 없음)

---

## Phase 4 — 항목 통합(토글 패널) + 쿠팡 상품 추적

> 요청: "항목이 너무 흩뿌려져 있다. 방문자수는 한 패널에서 일일/주간/월간
> 토글로 볼 수 있게 고도화. + 쿠팡은 어떤 항목을 클릭했는지까지 체크."

### A. 시간 위젯 통합 (흩어짐 → 토글 패널 2개)

기존 4개 산재 패널(7일 트렌드 · 30일 상세표 · 시간대 막대 · 14일 히트맵) →

- **방문 추이** (전폭): `일간/주간/월간` 세그먼트 토글. TF/LF 스택 차트 +
  상세표 2단. `get_daily_detail(p_days:180)` 클라이언트 집계
  (일간=최근14일 패딩, 주간=ISO주 10주, 월간=6개월). 현재 기간 강조
- **시간대 패턴** (col-8): `오늘 시간대 / 14일 히트맵` 토글(표시 전환)
- 오늘 현황(col-4)은 시간대 패턴과 한 행에 배치

결과: 전체 높이 3037→2554px. `renderTrafficPanel/bucketDetail` 신규,
`renderTrendChart/renderDailyDetail` 대체.

### B. 쿠팡 상품별 클릭 추적

트래킹은 이미 `metadata.product`를 저장(CoupangBanner.astro). RPC/테이블
확인 결과 `analytics` 테이블 직접 조회 가능(PostgREST) + 이벤트에 `product` 필드.

- **상품별 클릭 순위** 패널(쿠팡 탭): `analytics?event_type=eq.coupang_click`
  전체 조회 → `metadata.product` 집계, 클릭수 바 랭킹(메달·오늘 배지·상품 링크)
- **쿠팡 클릭 트래킹 피드**: 최근 이벤트(20건) 대신 analytics 전체에서
  최근순 + 상품명 표시(recent_events엔 쿠팡이 드물어 비던 문제 해결)
- **Live Activity**: coupang_click 행에 상품명(🛒) 표시

### 회귀/주의

- Row 교체 splice 시 Row 4(Top Pages/Live/추천)까지 삭제됐다가 복원.
  → splice는 교체 범위와 신규 블록의 섹션 수 일치 확인 필수(ID 카운트 검증)

### 완료 기준 (Phase 4)

1. build OK, 일/주/월·오늘/14일 토글 동작(주간 10주·월간 6개월 집계 확인)
2. 쿠팡 상품 순위(8종)·피드·Live에 상품명 표시
3. 전 탭·모바일 정상, 오버플로 없음(1440=1440, 390=390)



