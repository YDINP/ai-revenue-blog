---
title: "인디게임 개발 로드맵 시리즈 2탄: 게임 엔진 완벽 비교 (Unity·Unreal·Godot·Phaser·Cocos)"
description: "인디게임 로드맵 2탄 엔진·도구 선택. 2026년 7월 기준 Unity 6.3 LTS, Unreal 5.8, Godot 4.7, Phaser 4, Cocos Creator 3.8의 최신 버전·요금·로열티를 비교하고 프로젝트별 선택 기준을 정리합니다."
pubDate: 2026-07-12T20:00:00+09:00
updatedDate: 2026-07-12
category: "Game"
tags: ["게임엔진", "Unity", "Unreal Engine", "Godot", "Phaser", "게임개발"]
author: "TechFlow"
image:
  url: "https://images.pexels.com/photos/4792726/pexels-photo-4792726.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
  alt: "Crop anonymous male using contemporary computer with big monitors and typing on backlit keyboard"
coupangLinks:
  - title: "게임 프로그래밍 패턴 도서"
    url: "https://www.coupang.com/np/search?q=%EA%B2%8C%EC%9E%84%20%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%98%EB%B0%8D%20%ED%8C%A8%ED%84%B4%20%EB%8F%84%EC%84%9C&src=1139000&spec=10799999&addtag=200&ctag=%EA%B2%8C%EC%9E%84%20%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%98%EB%B0%8D%20%ED%8C%A8%ED%84%B4%20%EB%8F%84%EC%84%9C&lptag=AF7838146&pageType=SEARCH&pageValue=%EA%B2%8C%EC%9E%84%20%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%98%EB%B0%8D%20%ED%8C%A8%ED%84%B4%20%EB%8F%84%EC%84%9C"
  - title: "로지텍 G Pro X 게이밍 마우스"
    url: "https://www.coupang.com/np/search?q=%EB%A1%9C%EC%A7%80%ED%85%8D%20G%20Pro%20X%20%EA%B2%8C%EC%9D%B4%EB%B0%8D%20%EB%A7%88%EC%9A%B0%EC%8A%A4&src=1139000&spec=10799999&addtag=200&ctag=%EB%A1%9C%EC%A7%80%ED%85%8D%20G%20Pro%20X%20%EA%B2%8C%EC%9D%B4%EB%B0%8D%20%EB%A7%88%EC%9A%B0%EC%8A%A4&lptag=AF7838146&pageType=SEARCH&pageValue=%EB%A1%9C%EC%A7%80%ED%85%8D%20G%20Pro%20X%20%EA%B2%8C%EC%9D%B4%EB%B0%8D%20%EB%A7%88%EC%9A%B0%EC%8A%A4"
faq:
  - q: "2026년 Unity 런타임 요금(Runtime Fee)은 아직 있나요?"
    a: "없다. Unity는 2024년 9월 런타임 요금제를 공식 철회하고 기존의 좌석(시트) 기반 구독제로 되돌아갔다. 2026년 7월 기준 Unity Personal은 연 매출·펀딩 20만 달러 미만이면 무료이며, Unity Pro는 2026년 1월 12일부터 5% 인상되어 좌석당 연 2,310달러다. Enterprise는 별도 문의 가격이다."
  - q: "인디 개발자에게 비용이 가장 유리한 엔진은 무엇인가요?"
    a: "순수 비용만 보면 Godot다. MIT 라이선스라 구독료·로열티·매출 상한이 전부 0이다. Unreal은 게임의 경우 평생 총매출 100만 달러를 넘긴 이후 초과분에 5% 로열티만 내면 되고(에픽게임즈 스토어 판매분은 면제), Unity는 매출 20만 달러를 넘는 순간 Pro 구독이 필요해진다. 다만 Godot은 콘솔 출시를 하려면 W4 Consoles 같은 유상 포팅 솔루션이 필요하니 그 비용을 함께 계산해야 한다."
  - q: "지금 새 프로젝트를 시작하면 어떤 버전을 써야 하나요?"
    a: "2026년 7월 기준 Unity는 6.3 LTS(2027년 12월까지 지원), Unreal은 5.8(UE5 계열의 마지막 메이저 릴리스, 이후 UE6 개발), Godot은 4.7 stable, Phaser는 4.x(최신 4.2.1), Cocos Creator는 3.8.x 라인이 기준선이다. 상용 프로젝트라면 최신 기능 버전보다 LTS·stable을 고르는 편이 안전하다."
---
> 📚 이 글은 **[인디게임 개발 로드맵](/series/indie-roadmap/)** 시리즈의 **2탄 · 엔진·도구 선택**입니다. 앞 단계는 [1탄 · 기획·프로토타입](/blog/2026-07-11-game-indie-game-concept-prototype-2026-from-idea-to-vertical-slice/), 다음 단계는 [3탄 · 개발·에셋](/blog/2026-07-07-game-ai-coding-tools-indie-game-development-2026-cursor-claude-code/)입니다.

## 들어가며

프로토타입으로 재미를 검증했다면, 이제 그 게임을 **무엇으로 만들 것인가**를 정할 차례다. 엔진 선택은 되돌리기 비용이 가장 큰 결정 중 하나다. 개발 중반에 엔진을 갈아타는 건 사실상 처음부터 다시 만드는 일이기 때문이다.

문제는 이 판이 매년 흔들린다는 것이다. Unity는 런타임 요금제를 밀었다가 철회했고, Epic은 UE5의 마지막 메이저 버전을 내놓으며 UE6 준비에 들어갔으며, Godot은 4.7까지 올라오며 3D 격차를 좁히는 중이고, Phaser는 4.0에서 렌더러를 통째로 갈아엎었다. **2026년 7월 기준 최신 정보로** 5대 엔진을 다시 비교한다.

<a class="coupang-inline" href="https://www.coupang.com/np/search?q=%EA%B2%8C%EC%9E%84%20%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%98%EB%B0%8D%20%ED%8C%A8%ED%84%B4%20%EB%8F%84%EC%84%9C&src=1139000&spec=10799999&addtag=200&ctag=%EA%B2%8C%EC%9E%84%20%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%98%EB%B0%8D%20%ED%8C%A8%ED%84%B4%20%EB%8F%84%EC%84%9C&lptag=AF7838146&pageType=SEARCH&pageValue=%EA%B2%8C%EC%9E%84%20%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%98%EB%B0%8D%20%ED%8C%A8%ED%84%B4%20%EB%8F%84%EC%84%9C" target="_blank" rel="noopener noreferrer nofollow">
  <span class="ci-icon" aria-hidden="true">🛒</span>
  <span class="ci-body">
    <span class="ci-label">쿠팡 추천</span>
    <span class="ci-title">게임 프로그래밍 패턴 도서</span>
  </span>
  <span class="ci-cta">최저가 →</span>
</a>

## 한눈에 보는 요약 (2026년 7월 기준)

| 엔진 | 현행 버전 | 라이선스·비용 | 강점 | 한 줄 평 |
|---|---|---|---|---|
| **Unity** | 6.3 LTS (지원 2027-12까지), 6.5는 최신 기능 버전 | Personal 무료(매출·펀딩 20만 달러 미만) / Pro 좌석당 연 **2,310달러**(2026-01-12 5% 인상) / Enterprise 문의 | 모바일·에셋스토어·인력풀 | 무난한 기본값, 대신 매출 20만 달러부터 유료 |
| **Unreal** | 5.8 (2026-06, **UE5 마지막 메이저**) | 게임 무료, 평생 총매출 **100만 달러 초과분에 5% 로열티** (에픽게임즈 스토어 판매분 면제) / 비게임 업종은 좌석당 연 1,850달러 | 최고 수준 3D·시네마틱 | 성공하기 전엔 공짜, 성공하면 나눠 냄 |
| **Godot** | 4.7 stable (2026-06-18) | **MIT, 완전 무료·로열티 0** | 2D·경량·빠른 반복 | 비용 0이지만 콘솔은 별도 파트너 필요 |
| **Phaser** | 4.x (4.0 "Caladan" 2026-04, 최신 4.2.1) | 오픈소스 무료 | 웹·즉시 실행 | 브라우저가 곧 배포 채널 |
| **Cocos Creator** | 3.8.x 라인 (최신 3.8.8) | 무료 | 모바일·미니게임·아시아 시장 | 가볍고 웹빌드가 강함 |

> 요금·버전은 2026년 7월 12일 확인 기준이며, 각 사가 언제든 정책을 바꿀 수 있다. 계약 전엔 반드시 공식 페이지를 다시 확인할 것.

## Unity: 런타임 요금은 끝났고, 다시 구독제다

Unity는 여전히 모바일·인디 시장에서 가장 널리 쓰이는 엔진이다. 2023년의 런타임 요금(Runtime Fee) 사태로 신뢰를 크게 잃었지만, **2024년 9월 해당 요금제를 공식 철회**하고 예전의 좌석 기반 구독 모델로 돌아왔다.

**2026년 요금 구조**

- **Personal**: 무료. 연 매출·조달 자금 **20만 달러 미만**이면 사용 가능하다(과거 10만 달러에서 상향된 기준이 유지 중).
- **Pro**: **2026년 1월 12일부로 5% 인상**되어 좌석당 연 2,310달러.
- **Enterprise**: 좌석 수·지원 범위에 따른 별도 견적.

여기에 2026년에는 무료 티어를 넓히는 방향의 변화도 있었다. 공용 클라우드에서 돌리는 Unity Version Control의 좌석 과금이 사라지고, 클라우드 무료 저장 용량이 5GB에서 25GB로 늘어나는 식이다. 요금은 올리되 무료 사용자에게는 당근을 주는, 사태 이후 신뢰 회복용 조정에 가깝다.

**버전**: 현재 기준선은 **Unity 6.3 LTS**로 2027년 12월까지 지원된다(Enterprise·Industry는 +1년). Jolt·Box2D v3 통합 등 안정성 개선이 들어갔다. 더 최신 기능이 필요하면 6.5(구 Tech Stream 계열의 Supported Update)를 쓸 수 있지만, 상용 프로젝트라면 LTS가 정석이다.

**장점:** 압도적인 에셋 스토어와 학습 자료, C#의 낮은 진입 장벽, 모든 플랫폼으로 나가는 빌드 파이프라인, 채용 가능한 인력 풀.

**단점:** 매출 20만 달러를 넘는 순간 유료 구독이 붙는다. 정책 변동 이력 때문에 "또 바뀔 수 있다"는 리스크 프리미엄이 여전히 붙어 있다.

**적합:** 모바일 게임, 2D·캐주얼, VR/AR, 팀 채용을 염두에 둔 인디.

## Unreal Engine: 5.8이 UE5의 마지막, 다음은 UE6

Epic의 Unreal Engine은 2026년 6월 Unreal Fest Chicago에서 **5.8**을 공개했다. 여기서 중요한 건 기능보다 로드맵이다. **5.8은 UE5 계열의 마지막 메이저 릴리스**로 예고됐고, Epic은 UE6 개발로 무게중심을 옮기고 있다. 지금 장기 프로젝트를 UE로 시작한다면 이 전환을 염두에 둬야 한다.

5.7(2025년 11월)과 5.8을 거치며 들어온 굵직한 변화는 메시 터레인(오버행·터널이 가능한 진짜 3D 지형), MegaLights의 프로덕션 준비 완료, MetaHuman 대규모 배치, 에디터 내장 AI 어시스턴트 등이다.

**요금 구조 (2026년 7월 기준)**

- **게임 개발**: 다운로드·학습·프로토타입·출시 모두 무료. **평생 총매출 100만 달러를 넘긴 시점부터 초과분에 5% 로열티**. 에픽게임즈 스토어에서 발생한 매출은 로열티 면제.
- **비게임 업종**(영상·자동차 인포테인먼트·테마파크 등 런타임에 엔진 코드를 쓰지 않는 용도): 직전 12개월 매출 100만 달러 초과 시 **좌석당 연 1,850달러**. 참고로 2026년 5월부터 Twinmotion·RealityCapture는 이 라이선스에서 분리되어 별도 요금이 됐다.

즉 인디 입장에서 Unreal은 **"성공하기 전까지는 완전 무료"**인 엔진이다. 100만 달러를 넘기는 인디는 극소수이므로 비용은 사실상 진입 장벽이 아니다. 진짜 장벽은 학습 곡선과 하드웨어 요구 사양이다.

**적합:** 3D 액션·FPS·오픈월드, 포토리얼 비주얼이 무기인 프로젝트, 시네마틱·버추얼 프로덕션.

## Godot: 4.7까지 왔다, 비용은 여전히 0

Godot은 이 비교에서 유일하게 **돈이 한 푼도 들지 않는** 선택지다. MIT 라이선스라 구독료도, 로열티도, 매출 상한도 없다.

**최근 흐름**

- **4.6**(2026년 1월): 3D 물리 기본 엔진이 **Jolt**로 교체됐고, 스크린 스페이스 리플렉션이 전면 재작성, 도킹 UI가 개편됐다.
- **4.7 stable**(2026년 6월 18일, 코드명 "Lights, Camera, Action!"): 309명이 1,265건의 수정을 넣었다. **HDR 출력**(Windows·macOS·Linux Wayland·iOS), 사각형 면광원 **AreaLight3D**, **새 Asset Store**(기존 Asset Library 대체), Control 노드 트랜스폼(UI 애니메이션), 안드로이드 에디터에서의 직접 익스포트, 모바일용 VirtualJoystick 노드 등이 들어왔다.

3D는 여전히 Unity·Unreal에 못 미치지만, 매 릴리스마다 격차가 눈에 띄게 줄고 있다. 2D에서는 애초에 최상위권이다.

**콘솔이 유일한 함정:** Godot은 플랫폼 홀더의 비공개 SDK 문제로 콘솔을 공식 지원하지 못한다. 실무에서는 **W4 Games의 W4 Consoles** 같은 유상 솔루션으로 Switch·Switch 2(베타)·PS5·Xbox Series로 포팅한다. 가격은 비공개 견적이므로, "Godot은 무료"라는 말은 **PC·모바일·웹에 한정**해서 참이다.

**적합:** 2D 인디 전반, 빠른 반복이 필요한 소규모 팀, 로열티·구독을 원천 차단하고 싶은 개발자.

## Phaser: 4.0에서 렌더러를 갈아엎었다

Phaser는 HTML5 웹 게임 프레임워크의 사실상 표준이다. 그리고 2026년은 Phaser에게 큰 해였다.

**Phaser 4.0 "Caladan"**(2026년 4월 10일)은 역사상 가장 큰 릴리스로, **WebGL 렌더러를 바닥부터 다시 만들었다.** 기존 v3의 파이프라인 시스템이 노드 기반 렌더 노드 구조로 교체됐고, WebGL 상태가 완전히 관리되며 컨텍스트 복구가 내장됐다. API는 최대한 유지해 마이그레이션 부담을 낮췄다. 이후 4.1 "Salusa"(4월 말)를 거쳐 **최신은 4.2.1**(2026년 7월 9일)이다.

**장점:** JS/TS 그대로 쓰는 웹 개발자 친화성, 설치 없이 링크만으로 즉시 플레이, 배포·업데이트가 즉각적, 광고·소셜 플랫폼 유통에 최적.

**단점:** 2D 전용이고, 무거운 물리·대량 오브젝트에서는 성능 천장이 낮다. 네이티브 앱 수준의 퍼포먼스는 기대할 수 없다.

**적합:** 캐주얼 웹 게임, 플레이어블 광고, 교육용 인터랙티브 콘텐츠, 메신저·소셜 플랫폼 미니게임.

## Cocos Creator: 모바일·미니게임 파이프라인의 강자

Cocos Creator는 **3.8.x 라인**(최신 3.8.8)이 현행 안정 버전이다. 경량 런타임과 강력한 웹 빌드 덕분에, 카카오·위챗 같은 **플랫폼 내장 미니게임**과 하이퍼캐주얼 모바일 게임 파이프라인에서 특히 많이 쓰인다.

**장점:** 빌드 산출물이 가볍고 웹뷰에서 잘 돈다, TypeScript 기반, 2D 툴셋이 성숙, 중국·아시아 퍼블리싱 생태계와의 궁합.

**단점:** 영어권 문서·커뮤니티가 얇고, 3D는 제한적이며, 글로벌 에셋 마켓이 작다. 문제가 생기면 검색으로 안 나오는 경우가 잦아 엔진 소스를 직접 뒤져야 할 때가 있다.

**적합:** 카카오·위챗 등 플랫폼 미니게임, 2D 캐주얼·퍼즐, 저사양 기기 타깃 모바일.

## 그 밖에 눈여겨볼 엔진

- **Bevy** (Rust): 0.19가 2026년 6월 19일 릴리스됐다. 새 씬 시스템(BSN), 리소스-컴포넌트 통합, 렌더링 성능 개선이 들어갔다. 아직 0.x 대라 API가 자주 깨지지만, ECS 설계와 Rust 생태계를 좋아한다면 지켜볼 가치가 있다. **상용 첫 프로젝트로는 아직 권하지 않는다.**
- **Defold**: 무료·경량·크로스플랫폼. 모바일 2D에서 빌드 크기와 성능이 뛰어나 캐주얼 게임 스튜디오들이 조용히 잘 쓰는 엔진이다.

## 엔진별 핵심 지표 비교

<div class="chart-progress" data-title="게임 엔진 학습 난이도 (높을수록 어려움)" data-labels="Unity,Unreal,Godot,Phaser,Cocos" data-values="60,85,40,30,50" data-colors="#3b82f6,#10b981,#8b5cf6,#f59e0b,#ef4444" data-max="100" data-unit="점"></div>

<div class="chart-donut" data-title="게임 엔진 커뮤니티 크기 (상대 비중)" data-labels="Unity,Unreal,Godot,Phaser,Cocos" data-values="95,85,70,60,45" data-colors="#3b82f6,#10b981,#8b5cf6,#f59e0b,#ef4444" data-value-mode="percent"></div>

<div class="chart-bar" data-orient="vertical" data-title="게임 엔진 2D 게임 지원 강도" data-labels="Unity,Unreal,Godot,Phaser,Cocos" data-values="90,65,90,95,90" data-colors="#3b82f6,#10b981,#8b5cf6,#f59e0b,#ef4444" data-unit="점"></div>

<div class="chart-bar" data-orient="vertical" data-title="게임 엔진 3D 게임 지원 강도" data-labels="Unity,Unreal,Godot,Phaser,Cocos" data-values="85,98,70,0,40" data-colors="#3b82f6,#10b981,#8b5cf6,#f59e0b,#ef4444" data-unit="점"></div>

※ 위 점수는 공식 수치가 아니라, 2026년 7월 기준 기능·생태계를 종합해 매긴 상대적 참고 지표다.

## Unity vs Unreal vs Godot 3대 엔진 레이더 비교

<div class="chart-radar" data-title="Unity vs Unreal vs Godot 종합 비교" data-items='[{"name":"Unity","scores":[{"label":"학습곡선","value":7,"color":"#3b82f6"},{"label":"커뮤니티","value":10,"color":"#3b82f6"},{"label":"2D성능","value":9,"color":"#3b82f6"},{"label":"3D성능","value":8,"color":"#3b82f6"},{"label":"가격","value":6,"color":"#3b82f6"}]},{"name":"Unreal","scores":[{"label":"학습곡선","value":4,"color":"#10b981"},{"label":"커뮤니티","value":9,"color":"#10b981"},{"label":"2D성능","value":6,"color":"#10b981"},{"label":"3D성능","value":10,"color":"#10b981"},{"label":"가격","value":8,"color":"#10b981"}]},{"name":"Godot","scores":[{"label":"학습곡선","value":9,"color":"#8b5cf6"},{"label":"커뮤니티","value":7,"color":"#8b5cf6"},{"label":"2D성능","value":9,"color":"#8b5cf6"},{"label":"3D성능","value":7,"color":"#8b5cf6"},{"label":"가격","value":10,"color":"#8b5cf6"}]}]'></div>

## 엔진 선택 가이드

### 결정 트리로 3분 만에 좁히기

1. **웹 브라우저에서 바로 돌아가야 하는가?** → Phaser (2D 확정). 플랫폼 미니게임이면 Cocos Creator도 후보.
2. **포토리얼 3D가 게임의 핵심 셀링 포인트인가?** → Unreal. 아니라면 굳이 감당할 이유가 없다.
3. **2D인가?** → Godot 우선. 비용 0에 반복 속도가 가장 빠르다.
4. **콘솔 출시가 로드맵에 있는가?** → Unity 또는 Unreal이 안전하다. Godot이면 W4 Consoles 견적을 미리 받아 예산에 넣는다.
5. **팀을 늘리거나 외주를 쓸 계획인가?** → Unity. 구할 수 있는 사람 수가 압도적이다.

### 플랫폼별 추천

- **PC (Steam):** Unity, Unreal, Godot
- **모바일 (iOS/Android):** Unity, Cocos Creator, Godot
- **콘솔 (PS5, Xbox, Switch 2):** Unreal, Unity (Godot은 W4 Consoles 경유)
- **웹 브라우저:** Phaser, Cocos Creator
- **VR/XR:** Unity, Unreal

### 비용 관점 정리

- 매출이 **20만 달러를 넘길 것 같다면** Unity의 구독 비용을 손익에 미리 반영한다.
- 매출이 **100만 달러를 넘길 것 같다면** Unreal의 5% 로열티를 계산에 넣되, 그 지점까지는 지출이 0이라는 점도 함께 본다.
- **어느 쪽도 내기 싫다면** Godot이다. 대신 콘솔 포팅 비용이 그 자리를 대신할 수 있다.

## 결론

완벽한 엔진은 없다. 2026년 7월 현재의 지형을 한 줄씩 요약하면 이렇다.

- **Unity 6.3 LTS** — 런타임 요금은 끝났고 다시 평범한 구독제다. 가장 무난한 기본값.
- **Unreal 5.8** — UE5의 마지막 메이저. 인디에겐 100만 달러 전까지 사실상 무료.
- **Godot 4.7** — 비용 0, 2D 최상급, 3D 격차 축소 중. 콘솔만 별도 계획.
- **Phaser 4.x** — 렌더러 재작성으로 웹에서 한 단계 올라섰다.
- **Cocos Creator 3.8** — 모바일·미니게임 파이프라인에서 여전히 실속 있는 선택.

그리고 무엇보다, **선택보다 완주가 어렵다.** 엔진 비교글을 열 편 읽는 시간에 프로토타입 하나를 더 만드는 편이 낫다. 엔진을 골랐다면 다음 단계는 실제 개발과 에셋 확보다 — [3탄 · 개발·에셋](/blog/2026-07-07-game-ai-coding-tools-indie-game-development-2026-cursor-claude-code/)에서 이어진다.

<a class="coupang-inline" href="https://www.coupang.com/np/search?q=%EB%A1%9C%EC%A7%80%ED%85%8D%20G%20Pro%20X%20%EA%B2%8C%EC%9D%B4%EB%B0%8D%20%EB%A7%88%EC%9A%B0%EC%8A%A4&src=1139000&spec=10799999&addtag=200&ctag=%EB%A1%9C%EC%A7%80%ED%85%8D%20G%20Pro%20X%20%EA%B2%8C%EC%9D%B4%EB%B0%8D%20%EB%A7%88%EC%9A%B0%EC%8A%A4&lptag=AF7838146&pageType=SEARCH&pageValue=%EB%A1%9C%EC%A7%80%ED%85%8D%20G%20Pro%20X%20%EA%B2%8C%EC%9D%B4%EB%B0%8D%20%EB%A7%88%EC%9A%B0%EC%8A%A4" target="_blank" rel="noopener noreferrer nofollow">
  <span class="ci-icon" aria-hidden="true">✅</span>
  <span class="ci-body">
    <span class="ci-label">쿠팡 추천</span>
    <span class="ci-title">로지텍 G Pro X 게이밍 마우스</span>
  </span>
  <span class="ci-cta">최저가 →</span>
</a>

## 참고 자료

- [Unity 6.3 LTS 릴리스](https://unity.com/blog/unity-6-3-lts-is-now-available)
- [Unity — 런타임 요금 철회 공지](https://unity.com/blog/unity-is-canceling-the-runtime-fee)
- [Unity 요금제](https://unity.com/products)
- [Unreal Engine 5.8 소개](https://www.unrealengine.com/news/unreal-engine-5-8-is-now-available)
- [Unreal Engine 라이선스](https://www.unrealengine.com/license)
- [Godot 4.7 다운로드·릴리스 노트](https://godotengine.org/download/archive/4.7-stable/)
- [Godot 콘솔 지원 안내](https://godotengine.org/consoles/)
- [Phaser 릴리스](https://github.com/phaserjs/phaser/releases)
- [Cocos Creator 다운로드](https://www.cocos.com/en/creator-download)
