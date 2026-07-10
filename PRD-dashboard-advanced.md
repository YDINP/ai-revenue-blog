# PRD — 대시보드 고도화 (정석 애널리틱스化)

> 2026-07-10 | 요청: "다 해줘" (리서치 기반 9종 전부, 멀티에이전트 금지 → 단일 구현)

## 배경

리서치 결과 현재 대시보드는 정석 애널리틱스(Plausible/GA4/Fathom)의 기본 섹션 중
**유입경로·기기/브라우저·기간비교·퍼널**이 없음. 특히 `referrer`/`user_agent`는
이미 수집 중(analytics 테이블 metadata)인데 미사용 → 트래킹 변경 없이 화면만 추가하면 됨.

## 데이터원

- `analytics` 테이블 직접 조회(PostgREST). event_type: pageview 989 / coupang_click 10 / newsletter_subscribe 1
- pageview metadata: `{path, slug, title, referrer, user_agent}` ← referrer/UA 여기 있음
- 프로젝션 조회로 경량화: `select=created_at,ref:metadata->>referrer,ua:metadata->>user_agent,path:metadata->>path,source`

## 구현 항목 (9)

1. **유입경로 패널** — referrer 분류(Direct/Google/Naver/Daum/Bing/Social/Referral) 막대 랭킹
2. **기기·브라우저·OS 패널** — user_agent 파싱(모바일/데스크톱/태블릿 + 브라우저 + OS)
3. **기간 비교 델타** — 방문 추이 선택기간 vs 이전 동기간 증감%
4. **전환 퍼널** — 페이지뷰 → 쿠팡 클릭 전환율(+뉴스레터 목표)
5. **목표 위젯** — 쿠팡 클릭 / 뉴스레터 구독 목표 카운트·전환율
6. **AI 인사이트 한 줄** — 규칙기반 요약(조회 증감·최다 유입·전환율). KPI 위 배너
7. **스켈레톤 로딩** — "Loading..." 텍스트 → 정적 스켈레톤 블록(무애니메이션 유지)
8. **CSV 내보내기 + 표 보기** — 방문 추이 표 CSV 다운로드, 차트 aria-label
9. **커스텀 날짜 범위** — 방문 추이에 from/to date 입력(프리셋과 병행)

## 설계 제약

- **무애니메이션 원칙 유지** (transition 0, keyframes=spin만). 스켈레톤도 정적
- **색 = 의미** (증가 초록/감소 빨강), 컬러풀 다크 시스템 계승
- **실데이터만** (허위 시각화 금지). 지역/이탈률/신규재방문은 데이터 없어 제외
- 모든 기존 JS ID 보존, 데이터 로직 파괴 없음

## 레이아웃 추가

- AI 인사이트: main-tabs 아래, KPI 위 (전폭 배너)
- 오디언스 행: [유입경로 col-6][기기·브라우저·OS col-6]  (Row 4 뒤)
- 전환 행: [전환 퍼널 + 목표 col-12]

## 완료 기준

1. build OK, transition 0 / keyframes=spin만
2. 유입경로/기기/퍼널 실데이터 렌더, 기간비교 델타 동작
3. CSV 다운로드 동작, 스켈레톤 표시, 커스텀 범위 집계
4. 전 탭·모바일 정상, 오버플로 없음
5. 커밋 + 푸시(Vercel 자동배포) 반영 확인
