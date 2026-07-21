# WordPress 메인 전환 — 설정·이전 가이드

> 방향: **WordPress = 공개 메인(색인·수익)**, **Astro = 제작·운영 백엔드(noindex)**.
> 이전 대상: **색인글(noindex=false)만.** 잉여(noindex=true) 143개는 이전 제외(Astro에 남김, 삭제 안 함).
> VIP(playcast)는 씬플레이어 특수포맷이라 Astro 유지(WP 이전 대상 아님).

## 준비물 (스크립트 — 이미 작성됨)
- `scripts/publish-wordpress.mjs` — 단건 발행 + `publishPost()` export (REST API + App Password)
- `scripts/bulk-migrate-wordpress.mjs` — 색인글만 벌크 이전(재개·레이트리밋·`--list` 드라이런·`--keep-charts`)

## P0. 사용자 준비 (호스팅·인증)
1. 저렴 공유호스팅(Hostinger 등) 구매 → WordPress 원클릭 설치 (TF/LF 2개, 필요시 3개)
2. `wp.techflowkr.com` 등 서브도메인 연결 + **HTTPS 필수**(REST API 조건)
3. RankMath(또는 Yoast) SEO 플러그인 설치
4. `사용자 → 프로필 → Application Passwords` 발급
5. 다음 env 전달(파일 저장 X, GitHub/Vercel Secret):
   - `WP_URL`(예 https://wp.techflowkr.com) / `WP_USER` / `WP_APP_PASS` / `CANONICAL_BASE`(WP 메인이면 WP_URL 자신)

## P1. 차트 이식 (WP에서 chart-* div 렌더)
Astro의 차트는 `blog-post.js`가 그립니다. WP에서도 동일 렌더하려면:
1. **Code Snippets 플러그인**(또는 child theme functions.php)에 단일 글에서 로드되게 추가:
   - `public/js/blog-post.js` 내용 → WP에 `/wp-content/.../blog-post.js`로 업로드 후 `wp_enqueue_script`(single post)
   - `src/styles/global.css`의 `.chart-*` 규칙 → 인라인 CSS로 enqueue
2. 이식 완료 후 벌크 이전 시 **`--keep-charts`** 플래그를 붙이면 chart div가 그대로 발행됨.
   (이식 전엔 chart div가 "📊 원문에서 확인" 링크로 자동 대체됨)

## P2. 벌크 이전 실행
```bash
# 1) 대상 미리보기(WP 호출 X)
node scripts/bulk-migrate-wordpress.mjs ../ai-revenue-blog/src/blog --list   # TF 91
node scripts/bulk-migrate-wordpress.mjs ../life-revenue-blog/src/blog --list # LF 85

# 2) draft로 안전 발행 → WP에서 몇 개 육안 확인
WP_URL=... WP_USER=... WP_APP_PASS=... CANONICAL_BASE=... \
  node scripts/bulk-migrate-wordpress.mjs ../ai-revenue-blog/src/blog --status draft --keep-charts

# 3) 문제 없으면 publish (재실행해도 .tmp/wp-migrated-*.json 로 기발행분 스킵)
... --status publish --keep-charts
```
- 재개: 중단돼도 재실행하면 이미 발행된 slug는 스킵.
- 레이트리밋: 2.5초 간격(429 회피).

## P3. 도메인·SEO 전환
- 커스텀 도메인 apex → WordPress(공유호스팅). Astro(vercel.app) 공개 블로그 페이지는 **noindex + canonical→WP**.
- WordPress: AdSense 즉시 + RankMath로 sitemap → GSC·네이버 서치어드바이저 재등록.
- 트래픽 성장 후 Mediavine/Raptive 등 프리미엄 애드네트워크 가입(월 5만+ 세션).

## P4. 파이프라인 재배선
- 기존 자동생성/텔레그램 봇/Threads는 Astro 백엔드 유지 → 생성 글을 `publishPost()`로 WP에도 자동 push.
