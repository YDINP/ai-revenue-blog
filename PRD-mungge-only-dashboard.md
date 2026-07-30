# PRD — 대시보드·리포트 집계를 뭉게 단독 기준으로 재편 (TF/LF 제거)

> 작성: 2026-07-30

## 1. 배경

TF(ai-revenue-blog)·LF(life-revenue-blog)는 07-27~30에 걸쳐 **mungge.com 으로 301 통합**됐다.
두 사이트는 이제 리다이렉트 셸만 남았고 자체 조회는 한 자릿수다. 그런데 대시보드
(`src/pages/dashboard.astro`)와 일부 봇 경로는 아직 **TF/LF를 1급 소스로** 집계한다.

결과적으로:
- 대시보드 KPI가 "TF + LF + VIP 합산 + 뭉게 덧붙임" 구조라 **뭉게가 곁가지**로 보인다
- 빌드타임에 LF RSS를 fetch하는 등 죽은 사이트에 의존한다
- 뭉게에는 클릭 트래커가 없어 쿠팡·페이퍼닥 탭이 "뭉게 미추적"으로 비어 있다

## 2. 목표

**뭉게를 유일한 본 사이트로 세우고, 소스로서의 TF/LF를 제거한다.**

1. 대시보드·봇 리포트의 모든 집계 기준을 뭉게(+별도 운영 중인 VIP)로 교체
2. 뭉게에 없던 클릭 집계(쿠팡·페이퍼닥)를 **새로 심어** 지표를 잃지 않는다
3. 뉴스레터 구독 source를 `mg`로 통일(기존 구독자 마이그레이션 포함)
4. 과거 TF/LF 누적 데이터는 **화면에서 완전히 숨긴다** (DB는 보존)

### 비목표 (건드리지 않음)
- `automation/daily-run.mjs`의 `tf`/`lf` — 이건 사이트가 아니라 **발행 레인(silo)**
  (tf=테크·개발, lf=생활·재테크)이고 발행처는 mungge WP 하나다. 그대로 유지.
- TF/LF Vercel 프로젝트·301 리다이렉트 설정 — 그대로 살려 둔다(이관 URL이 계속 돌아야 함)

## 3. 현황 조사

### 뭉게가 이미 집계하는 것
| 소스 | 내용 |
|---|---|
| `ga4_daily` (source=`mg`) | Site Kit GA4 태그. 하루 1회 배치(`syncGa4`) |
| `analytics` `pageview_mg` | WP footer 자체 트래커(`scripts/wp-track.js`) — 실시간·글 단위 |
| `analytics` `like` (source=`mg`) | 글 하단 추천 버튼(`scripts/wp-like.js`) |
| `analytics` `naver_index` (source=`mg`) | 로컬 `naver-index-check.mjs` 측정치 |
| `gsc_daily` (source=`mg`) | Search Console(`mungge.com/`) |
| WP REST | 글 수(196편)·카테고리(12종)·최근 발행 |

⚠️ 같은 날을 GA4와 자체 트래커로 **동시에 더하면 이중계산**이다.
GA4 행이 있는 날은 GA4만, 없는 날만 자체 트래커로 채운다(기존 `_mungge.js` 원칙 유지).

### 뭉게가 집계하지 **않던** 것 → 이번에 신설
- `coupang_click` — 뭉게 본문에 쿠팡 링크가 실제로 있는데(`<a href="link.coupang.com/a/...">`) 클릭 추적이 없었다
- `paperdoc_click` — 뭉게 본문에 `paperdoc-web.vercel.app` 링크가 있는데 추적이 없었다
- 뉴스레터 구독 source — `wp-widget.js`가 카테고리로 추측해 `blog`/`lifeflow`로 보내고 있었다

### 이미 집계되지만 손대야 하는 것
- 도구(계산기) 방문 — 대시보드가 `event_type=pageview` + `path like /tools/*`로 읽는데,
  뭉게는 `pageview_mg`라서 안 잡혔다. 뭉게 `/tools/<slug>/` 페이지는 이미 존재(200).

## 4. 설계

### 4.1 소스 체계

```
mg      뭉게 (mungge.com)      — 본 사이트. 모든 지표의 기준
playcast VIP (virtual-in-playing) — 별도 운영 중인 게임소개 채널. 유지
blog/lifeflow                   — 제거. 화면에 노출하지 않음
```

### 4.2 탭 구성

| 기존 | 변경 후 |
|---|---|
| 전체 요약 | 유지 — 뭉게 중심 KPI. TF/LF 카드·스플릿·범례 제거 |
| TechFlow | ❌ 삭제 |
| LifeFlow | ❌ 삭제 |
| — | ✅ **🌐 뭉게** 신규 (글수·카테고리 도넛·카테고리별 트래픽·최근 발행·조회/클릭/전환) |
| VIP | 유지 |
| 🔍 검색(GSC) | source 버튼 `전체 / 뭉게 / VIP` |
| 🌐 뭉게 유입 | 유지 |
| 쿠팡 | CTR 카드 `TF/LF` → `뭉게/VIP` |
| 페이퍼닥 | 블로그별 `TF/LF/GF` → `뭉게/VIP` |
| 🛠 도구 | LifeFlow → 뭉게(`pageview_mg`) |
| 댓글 | 필터 `TF/LF` → `뭉게/VIP` |

### 4.3 빌드타임 → 런타임 전환

프론트매터에서 제거:
- `getCollection('blog')` 기반 TF 글수·카테고리·최근글 (TF 콘텐츠는 이제 mungge에 있다)
- `life-revenue-blog/rss.xml` 빌드타임 fetch (죽은 사이트에 빌드가 의존하면 안 된다)

대체: 전부 런타임 WP REST(`loadMunggePosts()`, 이미 존재) + Supabase.
VIP는 기존대로 상수 + RSS.

### 4.4 뭉게 클릭 트래커 (`scripts/wp-affiliate.js` 신규)

`BaseLayout.astro`의 TF 트래커와 **메타데이터 모양을 동일하게** 맞춘다 — 모양이 다르면
같은 대시보드 코드로 나란히 못 놓는다.

```js
coupang_click  source='mg'  metadata { product, url, slug, path, title }
paperdoc_click source='mg'  metadata { placement, url, slug, path, title }
```
- 셀렉터: `a[href*="coupang.com"]`, `a[href*="paperdoc-web.vercel.app"]`
- `placement`: 클래스에 `pd-pop`→popup / `pd-side`→side / `pd-promo`→banner / 그 외 `inline`
- `capture: true` + `sendBeacon` (링크 이탈 전 발사) — TF 트래커와 동일
- 관리자 opt-out(`__notrack`)·크롤러 제외 규칙은 `wp-track.js`와 동일 기준 사용
- SSOT는 라이브 footer 위젯 → `scripts/inject-wp-js.mjs`에 `MG-AFF` 조각 등록

### 4.5 구독 source 통일

- `scripts/wp-widget.js`: 카테고리 추측 제거 → `source='mg'` 고정
- `scripts/migrate-subscribers-to-mg.mjs` (신규): `newsletter_subscribers`·`newsletter_sends`의
  `blog`/`lifeflow` → `mg`.
  ⚠️ 한 사람이 TF·LF 둘 다 구독했으면 `(source,email)` 유니크에서 충돌한다
  → 이메일 기준 dedupe 후 UPDATE, 중복은 삭제.
- `api/_blogs.js`: `mg.source = 'mg'`, `mg.rssPath = '/feed/'`
  (WP RSS는 `/rss.xml`이 아니라 `/feed/` — 확인: `/rss.xml`은 404)
- `api/_newsletter.js`: `recentPosts()`가 `rssPath`를 쓰게

### 4.6 레지스트리 (`api/_blogs.js`)

- `tf`·`lf` 엔트리 삭제
- `mg`에 `source:'mg'`, `rssPath:'/feed/'`, `communities`(tf+lf 통합), `newsQueries`(통합) 이관
  → `_report.js`의 "오늘의 추천 주제"가 계속 동작하게 (`generator` 필터는 `communities`로 완화)
- `pc`(VIP) 그대로

### 4.7 레거시 블록 제거

- `api/_dashboard.js`: `sourceMessage()`(/tf /lf) 삭제, `/stats`·`/top`·`/trend`의 레거시 블록 삭제
- `api/_report.js`: `collectLegacy()` 삭제 → 뭉게 기준 댓글·좋아요·쿠팡클릭 집계로 대체
- `api/_gsc-view.js`: 레거시 한 줄 삭제
- `api/telegram-webhook.js`: `/tf` `/lf` 명령·도움말 삭제
- `api/_shared.js`: `SOURCE_META`에서 blog/lifeflow 삭제, `mg` 추가(`postUrl`이 뭉게 URL을 만들게)

## 5. 리스크

| 리스크 | 대응 |
|---|---|
| 과거 TF/LF 데이터가 화면에서 사라져 누적 수치가 급감해 보인다 | 뭉게 카드에 "GA4 수집 시작 2026-07-27" 기준일을 명시 |
| 구독자 마이그레이션 중복 충돌 | 이메일 dedupe 후 UPDATE, `--dry-run` 먼저 |
| 뭉게 클릭 트래커가 footer 위젯을 덮어써 기존 조각 손실 | `inject-wp-js.mjs --backup` 로 원문 저장 후 주입 |
| `postUrl()` 이 뭉게 URL 규칙(`/<slug>/`, `/blog/` 없음)과 다름 | `mg`는 `/blog/` 프리픽스 없이 `/<slug>/` |
| 빌드타임 LF RSS 제거로 `lfPosts` 참조 남으면 빌드 실패 | `astro build` 로 검증 |

## 6. 완료 기준

- [x] `npm run build` 통과 (LF RSS·TF collection 참조 0건) — 789 페이지 빌드 성공
- [x] 빌드 산출물에 `TechFlow`/`LifeFlow` 문자열 0건, `data-filter="blog|lifeflow"` 0건
- [x] 삭제한 식별자(`splitVisitors`/`TF_SLUG_CAT`/`fetchLifeFlowRSS` 등) 참조 0건,
      삭제한 DOM id(`tab-techflow`/`coup-tf-ctr`/`views-split-tf` 등) 0건
- [x] 뭉게 탭 KPI·도넛·카테고리 트래픽이 참조하는 DOM id 전부 마크업에 존재
- [x] `scripts/test-telegram-bot.mjs` — 133 assertion 전부 PASS
- [x] 봇 명령 라이브 실측: `/stats` `/mg` `/top` `/trend` `/cstats` `/coupang` `/paperdoc`
      `/report` `/money` 모두 뭉게 실데이터로 응답
- [ ] **사용자 조치 필요** ↓

## 7. 남은 수동 조치 (코드 밖)

이 세 가지는 코드가 아니라 외부 시스템 설정이라 사람이 실행해야 한다.

1. **뭉게 클릭 트래커 주입** — footer 위젯이 라이브 SSOT 다.
   ```
   node scripts/inject-wp-js.mjs --backup ./wp-widget-backup.txt   # 원문 백업 후 전체 주입
   node scripts/inject-wp-js.mjs --only MG-AFF                     # 새 조각만
   ```
   (`WP_URL` / `WP_USER` / `WP_APP_PASS` = `automation/.env`)

2. **Supabase SQL 2개 실행** (SQL Editor)
   - `supabase/get_traffic_summary.sql` — tf_/lf_ 필드 → mg_/vip_ 로 교체.
     ⚠️ 실행 전에는 대시보드의 뭉게 클릭·CTR 카드가 `--` 로 뜬다(에러는 아님).
   - `supabase/newsletter-source-to-mg.sql` — 구독자·발송이력 source 를 mg 로 통합.
     ⚠️ 실행 전에는 기존 구독자 3명이 뉴스레터 발송 대상에서 빠진다.

3. **Vercel 배포** — `api/` 변경은 배포 후에 적용된다. 새 action 을 호출하기 전에
   배포 성공을 먼저 확인할 것(구버전이 기본 경로를 실행함).
