
## [진행중] 4작업 (2026-07-23)
1. 팝업배너 교체: popup 1886(overlay pum-1886, NOT 1884=예시). content raw=wp:html <a><img>. 새이미지 id=1892 pd-banner-1200x400-1.png. 깨진 wp:paragraph 제거+가로배너.
2. chart-progress: 5개→3-2(:has CSS) + 점수순 정렬(chart-static.mjs)
3. chart-bar 세로: 최고값 상단도달 + 작은차이 증폭(스케일 min baseline)
4. 본문광고: 728x90 데스크톱한정 + 모바일 320x50 DAN-FxUxEhp2LCne6gT3
CSS위젯=custom_html-2(footer1). 차트렌더=ai-revenue-blog/scripts/chart-static.mjs

## [완료] 4작업 (2026-07-23) — 커밋 1bd0c5b, 팝업 pop-fix
1. ✅ 팝업배너: popup 1886 새 가로배너(pd-banner-1200x400, id1892) 620px. 라이브확인
2. ✅ chart-progress: 정렬(85/60/50/40/30)+3-2(:has). 시각확인
3. ✅ chart-bar 세로: 증폭스케일(최대100%,14~100). 검증완료
4. ✅ 본문광고 반응형: 데스크톱728(.code-block-1)/모바일320(.mg-inpost-mo). 뷰포트검증 OK
   - 재렌더: chart 101개 완료 + 전체176 진행중(.logs/rerender-all.log)
남은것: 재렌더 완료대기. ⚠️보안: Hostinger토큰 폐기+WP비번 변경(미완)

## [2026-07-23 대량 세션] 완료
- versus 차트 열정렬(고정폭) 3055b6e
- 볼드 §3.5 정리(수치만) 3055b6e/044d626
- 코드블록 Astro스타일(Prism 다크+언어라벨+📋복사, ben=unfiltered_html이라 위젯<script>생존) f61b96b, LF동기화 55ae096
- 쿠팡 이미지카드 WP(parseCoupang+buildCoupangCards, 3번째h2앞, Pexels스톡, LF폴백) b3ad2ed/2f9307d
- 오늘발행: TF Phaser #2156, LF finance #2157~2159 (로컬 게이트웨이 생성). 대표이미지 codex(TF)+Pexels(LF)
- [진행중] VIP 패스오브엑자일 글: playcast-blog/src/videos/2026-07-23-poe-allflame-curse.md 작성완료. codex 이미지8종 생성중(.tmp/gen/poe/)→resize→public/games/(scenes/)→커밋push
핵심파일: publish-wordpress.mjs(TF정본, LF복사동일). CSS위젯 custom_html-2. reinject-css.mjs(복사JS포함)
