# Active — TF/LF/VIP 마케팅·SEO 전략 전면 실행

## 사용자 지시
추천방안 전부 진행. 진행중 채널(네이버블로그·서치어드바이저·GSC·Threads)은 유지, 나머지 내가 직접.

## 실행 워크스트림 (순서=ROI)
1. [✅ 완료·배포] **JSON-LD** 3블로그 — LF a51bd0d, VIP e736265(VideoObject포함), TF 2729e54. 전부 빌드+JSON.parse 검증.
2. [✅ 완료·배포] **IndexNow**: TF/VIP 자동핑 워크플로 신규(LF는 기존), VIP 키 c35215b7a57806accdc3775204221bf6(playcast public/ 호스팅+_blogs.js 등록).
3. [✅ 기구현] 내부링크 — TF/LF RelatedPosts, VIP watch "이어서 볼 방송"(같은카테고리 6개) 모두 존재. 추가작업 불필요.
4. [✅ 완료·배포] 3블로그 교차홍보 네트워크 nav+footer — TF 82335cc, LF 77d55ff, VIP 8423ea4. 6개 상호링크 검증.
5. [5a 완료·배포 ee46a9d] 부진글 3건. [5b 진행중] 전글감사(CRLF파서 수정후 실데이터): 누락desc=0(경보는 파서버그)·누락hero=1(nextjs)·짧은desc TF14+LF16·과長1(qwen). 안전스코프=짧은/과長 메타디스크립션만 최적화(제목·FAQ 대량수정 제외=리스크/저ROI). [✅ 5b 완료·배포] 메타디스크립션 최적화: LF 16건(66344ac)+TF 15건(b55ef60)=31건, 전부 110~155자 범위·description만 변경·빌드통과. nextjs 히어로=noindex 글이라 스킵(무관). **항목5 전체완료**.
발견: TF 2026-03-01-nextjs 글은 noindex+본문 미가공 JSON(깨진 초안) — 사용자 인지용. 색인영향 없음.
6. [A 완료·확장중] Programmatic 비교허브 /compare — 데이터드리븐. **총 5건**: 엔진(dcb07ea)·수수료(dcb07ea)·수익화모델(b471f12)·아트확보(51820c2)·마케팅채널(51820c2). 항목끼리 related 상호링크 + 랭킹글→비교 내부링크(b471f12). IndexNow 시드3 수동핑 완료. 남은 후보 B(베스트N)·C(AI툴, 가격변동 주의)·D(VIP장르허브).
7. [판단변경] RSS 풀콘텐츠 = **실행안함**(수익형 블로그는 요약 유지가 클릭·광고수익에 유리). 카테고리 피드만 선택적.
B. [ ] Threads 신규글 훅 자동큐(VIP포함)·GSC 부진키워드 리포트

## 6-D VIP 장르 허브 [완료·배포 85d724d]
/genre 허브+4장르(최신11·가이드4·무료2·인디1) 페이지, nav "장르". VideoCard재사용, JSON-LD(CollectionPage+ItemList). VTuber2=draft라 정상제외(발행18). 라이브200+IndexNow 202. 방치 VIP 색인/내부링크 강화.

## A+B 병행 (사용자 승인)
- A[완료 1f76571]: /compare 6번째=광고네트워크(AdMob/AppLovin MAX/LevelPlay). 
- 브레드크럼 버그[완료 898919e]: TF 글 제목 잘림(max-width+ellipsis)→wrap. 모바일 스샷 검증.
- B[완료 f40c608]: LF /guide 허브(index+money 재테크38+growth 자기계발23), nav·footer "가이드". 실제글61 내부링크 검증. JSON-LD OK. IndexNow는 배포후(nav·사이트맵 커버).

## LF 진단 결론(중요)
LF는 순위OK(1p,7.6위)인데 **노출 페이지 16/143·총36노출** = 검색량0 키워드로만 랭킹+대부분 글 미노출. 원인=네이버장악 주제+vercel.app천장+주제분산(코드로 못고침). B는 색인개선 시도지 demand해결 아님. 구조fix=커스텀도메인·네이버최적화(사용자).

## 발견/결정 (B)
- B-GSC부진키워드: **이미 구현됨** = `/seo` 봇명령(_gsc-view.js seoMessage: CTR개선/문턱8~20위/미공략0클릭). 중복 안만듦.
- B-Threads자동큐: 사용자 진행중 → 미개입(워크플로 충돌 위험).
- 4(교차홍보): 에이전트 ada35448 작동중(3 BaseLayout nav+footer 상호링크, 특히 VIP 유입).
- 3(내부링크): TF/LF RelatedPosts 있음, VIP 없음 → VIP watch에 "관련 영상" 추가가 클린한 다음 작업(단 교차홍보 에이전트 VIP 편집중이라 그 후).

## 남은 항목 성격
- 3(내부링크/클러스터)·4(교차홍보/VIP뉴스레터): 중간규모, 레포별 신중.
- 5(콘텐츠 SEO 일괄)·6(Programmatic SEO): 대규모(수십글 스윕/신규 랜딩시스템) → 포커스 세션 필요.
- 다음 착수: 4 교차홍보(3블로그 상호링크) → 3 내부링크 → B → 5/6.

## 핵심 사실
- JSON-LD 현재 3블로그 전무. TF=image객체/master, LF=heroImage플랫/main, VIP=src/videos·watch페이지·master.
- 각 블로그 og:image 절대화: LF는 BaseLayout `new URL(img,Astro.site)` 적용됨(이전 세션). TF/VIP 확인 필요.
- Astro head 주입: BlogPostLayout `<Fragment slot="head">` 존재. `<script type="application/ld+json" set:html={JSON.stringify(x)}/>`.
- 커밋: 각 레포별. TF=master, LF=main, VIP=master. push=Vercel 자동배포.

## 네이버 발행 전략 (대기중)
- 워크플로: Astro(LF) 원본 발행 → 네이버는 완전 리라이트 + 1~2일 뒤(유사문서 회피).
- 주제=네이버 검색량 기준. 검증도구 `ai-revenue-blog/scripts/naver-keywords.mjs`(.env.local NAVER_AD_*).
- 1순위 클러스터(경쟁 낮음): 실업급여계산기115k·3.3%계산기23.6k·주휴수당10.8k·시급계산4.4k·세액계산기1.5k (LF/재테크).
- 상태: **초안 대기**(사용자 "일단 초안 대기"). 착수 신호+주제 확정 오면 LF Astro 글부터 풀작성 → 히어로 → 배포 → 네이버 리라이트 준비.

## 오늘 3블로그 핫토픽 발행 (WP이사중=Astro발행, 나중 자동이전)
- 중복체크 완료. 확정3: TF=폴드8vs플립8(Flip8글 07-11 내부링크), LF=코스닥상폐(신선), VIP=패서제닉(신선).
- 패서제닉 검증(루리웹227216): Aberrant Labs개발/Slug Disco퍼블, 세포 로그라이크 슈팅, 플레이어=병원체가 면역계와 전투, 스팀 10,500원(출시20%~7/31), 첫주10만장·동접5,800·리뷰1,200/95%긍정, 출시7/16, 120+세포소기관·소프트바디물리·스팀덱검증.
- [✅ 완료·발행] TF 74e9dad·LF 587452a·VIP 0286ed3. 3개 다 빌드통과·JSON-LD·내부링크·검증사실. IndexNow 자동핑 트리거됨(src/blog·src/videos push). 마이그레이션 배치에 자동편입(TF91→92, LF85→86).

## VIP 씬플레이어 8이슈 (watch 페이지, playcast)
파일: HostStage.astro(booth 뉴스룸 DOM)·public/js/scene-player.js·src/styles/global.css. blink clip 이미 65%로 수정됨.
1. 말시작/끝 모핑 초기화(scene-player _loop viseme/--mouth)
2. 자막 폰트 반응형(.sp-caption .box clamp/cqw)
3. sp-screen-tag LIVE 영상 위로
4. chyron-tag "로지" 자막패널 분리/가시성
5. .cursor 타이핑 캐럿 제거
6. 해상도↓ 자막이 sp-anchor 호스트 가림
7. sp-controls 하단 네비가 sp-desk 날씨티커 겹침
8. 조회수 views:0 정적→DB(analytics, source=vip/playcast)
분담: 1~7=frontend agent(스샷검증), 8=나(analytics).
[✅ 1~7 완료·배포 141dd79] global.css+HostStage. 데스크톱/모바일 스샷 검증(내가 재확인).
[✅ 8 완료·배포 ad6c228] 조회수=시드+실pageview(count=exact, anon). patho 0→8회 확인. VideoCard/watch/BaseLayout.
[대기] 9. 커스텀 썸네일(로지×게임 코스프레 i2i). 프루프부터 제안, 사용자 확인 대기.

## 진행 로그
- JSON-LD 3레포 병렬 에이전트 디스패치(TF/LF/VIP). LF는 BlogPostLayout 반영 확인됨.
- IndexNow 진행: VIP 키=c35215b7a57806accdc3775204221bf6 (scratchpad 저장).
  - [완료·미커밋] ai-revenue-blog: api/_blogs.js pc에 indexNowKey 추가 + .github/workflows/indexnow.yml 생성(master, src/blog/**).
  - [대기] playcast-blog: public/<key>.txt + .github/workflows/indexnow.yml(src/videos/**, /watch/ 매핑) — VIP 에이전트 빌드 충돌 방지 위해 그 에이전트 완료 후.
  - LF는 indexnow.yml 이미 있음.
- 커밋 규칙: 각 레포는 해당 JSON-LD 에이전트 완료+리뷰 후 1회 커밋(JSON-LD+IndexNow 묶어서). 지금은 미커밋.
- VIP watch URL 매핑: src/videos/FILE.md → /watch/FILE/ (sitemap 확인).

