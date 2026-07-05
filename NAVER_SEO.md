# 네이버 SEO 실행 가이드 (AI Revenue Blog)

> 목적: 구글 위주로 잡히는 유입을 네이버로 확장. 한국 검색 트래픽의 큰 축이 네이버이므로,
> 인디게임 클러스터처럼 반응이 오는 주제를 네이버에도 노출시키는 것이 목표.

## 0. 현재 상태 (이미 되어 있는 것)
- [x] `public/naver-site-verification.txt` 존재 + `<meta name="naver-site-verification">` 삽입됨
- [x] 사이트맵 `sitemap-index.xml` 자동 생성
- [x] RSS `/rss.xml` 제공
- [x] robots.txt 존재

## 1. 네이버 서치어드바이저 (필수, 5분)
1. https://searchadvisor.naver.com 접속 → 네이버 로그인
2. **웹마스터 도구 > 사이트 등록**: `https://ai-revenue-blog.vercel.app` 추가
3. **사이트 소유확인**: 이미 verification 파일/메타가 있으므로 '확인' 클릭이면 통과
4. **요청 > 사이트맵 제출**: `https://ai-revenue-blog.vercel.app/sitemap-index.xml` 등록
5. **요청 > RSS 제출**: `https://ai-revenue-blog.vercel.app/rss.xml` 등록

## 2. 신규/핵심 URL 수동 수집요청 (핵심 URL은 개별 제출)
서치어드바이저 **요청 > 웹 페이지 수집**에 아래 URL을 하나씩 제출(1일 할당량 있음, 며칠 나눠서):
- 허브: `/blog/2026-02-26-game-2026-indie-game-monetization-reality-5-truths/`
- `/blog/2026-06-30-game-indie-game-steam-launch-guide-2026-wishlist-to-launch/`
- `/blog/2026-07-01-game-indie-game-marketing-zero-budget-2026-wishlist-growth/`
- `/blog/2026-07-02-game-game-platform-fees-comparison-2026-steam-epic-mobile-itch/`
- `/blog/2026-07-03-game-indie-game-revenue-models-2026-premium-f2p-subscription/`
- `/blog/2026-07-04-game-solo-game-developer-survival-guide-2026-burnout-budget/`
- `/blog/2026-07-05-game-generative-ai-indie-game-development-2026-cost-cut-controversy/`
- `/blog/2026-07-05-game-ugc-creator-economy-2026-roblox-uefn-monetization/`
- `/blog/2026-07-05-game-hot-game-genres-2026-roguelike-survivorlike-trends/`
- (2026-07-06 신규 5편도 배포 후 동일하게 제출)

## 3. 진단 점검 (서치어드바이저 내)
- **웹마스터 도구 > 진단 > 웹 페이지 최적화**: 대표 URL 입력해 제목·설명·OG 태그 점검(대부분 이미 충족)
- **수집 현황 / 색인 현황** 주기적 확인 → 색인 누락 URL 재요청

## 4. 네이버 노출 확장 — 요약본 신디케이션 (효과 큼)
네이버는 자체 생태계(블로그·카페) 문서를 검색에 우선 노출하는 경향이 있음. 핵심 글을 **네이버 블로그/티스토리에 요약본으로 재게시**:
- 원문 3~4문단 요약 + "전체 글 보기" 원문 링크
- **주의(중복 콘텐츠)**: 전문 복붙 금지. 요약 + 링크 형태로. 원문이 정본(canonical)임을 유지
- 티스토리는 네이버·다음 색인 모두 유리
- 제목에 검색 키워드 그대로 포함 (예: "인디게임 수익화 현실", "스팀 출시 위시리스트")

## 5. 네이버 키워드 리서치 (다음 주제 선정용)
- **네이버 자동완성 / 연관검색어**: 검색창에 "인디게임", "스팀 출시" 입력 → 실제 사용자 검색어 확보
- **네이버 데이터랩**(datalab.naver.com) > 검색어 트렌드: 후보 키워드 검색량 추세 비교
- 확보한 실검색어를 다음 글 제목·H2·태그에 반영

## 6. 스마트블록/뷰 최적화 팁
- 질문형 제목·소제목(FAQ)이 네이버 스마트블록에 유리 → 이미 각 글에 FAQ 있음
- 이미지 alt·본문 표가 있으면 노출 품질 상승 (이미 적용됨)
- 발행 후 최소 1~2주는 순위 변동 관찰 (네이버는 신규 도메인 신뢰 축적에 시간 필요)

## 7. 체크리스트 요약
- [ ] 서치어드바이저 사이트 등록 + 소유확인
- [ ] 사이트맵·RSS 제출
- [ ] 핵심 9~14개 URL 수동 수집요청 (며칠 분할)
- [ ] 티스토리/네이버 블로그에 인디게임 허브 요약본 1편 게시(원문 링크 포함)
- [ ] 데이터랩으로 다음 주제 키워드 검증
- [ ] 2주 후 색인/노출 현황 재점검
