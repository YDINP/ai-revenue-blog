---

## Session e704eb46-0a07-41b0-acc4-e31065dcc300 — 2026-07-21T02:41:34.011412+00:00


# Active — TF/LF/VIP 마케팅·SEO 전략 전면 실행

## 사용자 지시
추천방안 전부 진행. 진행중 채널(네이버블로그·서치어드바이저·GSC·Threads)은 유지, 나머지 내가 직접.

## 실행 워크스트림 (순서=ROI)
1. [✅ 완료·배포] **JSON-LD** 3블로그 — LF a51bd0d, VIP e736265(VideoObject포함), TF 2729e54. 전부 빌드+JSON.parse 검증.
2. [✅ 완료·배포] **IndexNow**: TF/VIP 자동핑 워크플로 신규(LF는 기존), VIP 키 c35215b7a57806accdc3775204221bf6(playcast public/ 호스팅+_blogs.js 등록).
3. [✅ 기구현] 내부링크 — TF/LF RelatedPosts, VIP watch "이어서 볼 방송"(같은카테고리 6개) 모두 존재. 추가작업 불필요.
4. [✅ 완료·배포] 3블로그 교차홍보 네트워크 nav+footer — TF 82335cc, LF 77d55ff, VIP 8423ea4. 6개 상호링크 검증.
5. [5a 완료·배포 ee46a9d] 부진글 3건(TF 6위·CTR0%) 제목/메타 개선. LF는 노출36=검색사망→제외. [5b 대기] 전글 일괄=대규모 별도 세션.
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

## 진행 로그
- JSON-LD 3레포 병렬 에이전트 디스패치(TF/LF/VIP). LF는 BlogPostLayout 반영 확인됨.
- IndexNow 진행: VIP 키=c35215b7a57806accdc3775204221bf6 (scratchpad 저장).
  - [완료·미커밋] ai-revenue-blog: api/_blogs.js pc에 indexNowKey 추가 + .github/workflows/indexnow.yml 생성(master, src/blog/**).
  - [대기] playcast-blog: public/<key>.txt + .github/workflows/indexnow.yml(src/videos/**, /watch/ 매핑) — VIP 에이전트 빌드 충돌 방지 위해 그 에이전트 완료 후.
  - LF는 indexnow.yml 이미 있음.
- 커밋 규칙: 각 레포는 해당 JSON-LD 에이전트 완료+리뷰 후 1회 커밋(JSON-LD+IndexNow 묶어서). 지금은 미커밋.
- VIP watch URL 매핑: src/videos/FILE.md → /watch/FILE/ (sitemap 확인).


