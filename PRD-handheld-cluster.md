# PRD — 휴대용 게이밍PC 클러스터 강화 (위성글 4)

## 배경
- 허브글 `2026-07-11-review-handheld-gaming-pc-2026`(스팀덱 vs 스위치2 3파전)이 7/12 오가닉 랭킹 돌파 → 7일 노출 532·CTR 9%(GSC 실측). 이 블로그가 뚫은 첫 실수요 쿼리.
- 허브가 고립(관련글 0). 하위 쿼리 위성글 + 허브↔위성 내부링크로 토픽 권위 구축.

## 위성글 4 (허브 head "3파전 비교" 잠식 안 하게 하위쿼리 타겟)
| slug(무날짜) | 제목 | 타겟 쿼리 |
|---|---|---|
| steam-deck-oled-price-worth-2026 | 스팀덱 OLED 지금 살까? 2026 가격·가치 | 스팀덱 가격/살까 |
| switch2-vs-steam-deck-games-2026 | 스위치2 vs 스팀덱 게임 라이브러리 비교 | 스위치2 스팀덱 게임 |
| budget-handheld-gaming-pc-2026 | 가성비 핸드헬드 게이밍PC 추천 2026 | 가성비 핸드헬드 |
| handheld-gaming-pc-buying-guide-2026 | 휴대용 게이밍PC 고르는 법 2026 입문 | 휴대용 게이밍PC 추천/입문 |

## 포맷 (허브 준수)
- 프론트매터: title/description/pubDate(2026-07-17)/author"TechFlow"/category"Review"/tags/image{url:/images/<img>.webp,alt}/coupangLinks(검색URL·imageUrl생략)/faq(4~5).
- 본문: 도입 → seo-inlink(허브 링크) → ## 섹션 → chart-bar 1개(값정렬) → 상황별 추천 → 정리. §3.5 볼드절제(핵심수치 span강조), 존댓말, 사실기반(2026 알려진 사실: 스팀덱 OLED $789(5월인상)·스위치2 2025출시 $449.99).
- 무-날짜 slug(§3.6). 허브→위성 링크는 허브 seo-inlink에 추가.

## 산출/검증
- 4 posts + 4 hero webp(codex 생성) + 허브 링크 갱신 → astro build + 깨진링크 0 → 커밋/푸시.
