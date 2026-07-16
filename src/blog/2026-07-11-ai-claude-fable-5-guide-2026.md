---
title: "Claude Fable 5: 첫 Mythos급 모델"
description: "2026년 6월 공개된 Claude Fable 5, 앤트로픽 최초의 Mythos급 모델을 정리했습니다. 강점(소프트웨어·비전·과학), 가격, 안전장치, Mythos 5와의 차이까지 공식 데이터로 확인하세요."
pubDate: 2026-07-11
author: "TechFlow"
category: "AI"
tags: ["Claude Fable 5", "Anthropic", "Mythos 5", "AI 모델", "Claude", "2026 AI 트렌드"]
image:
  url: "https://images.pexels.com/photos/17483868/pexels-photo-17483868.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200"
  alt: "추상적인 인공지능 이미지 — Claude Fable 5를 상징하는 개념 이미지"
faq:
  - q: "Claude Fable 5가 뭔가요?"
    a: "앤트로픽이 2026년 6월 9일 공개한 최신 모델로, 회사가 일반에 공개한 모델 중 성능이 가장 높습니다. 'Mythos급(Mythos-class)'이라 불리는데, 이는 기존 Opus보다 위 티어의 능력을 가진 모델 계열을 뜻합니다. 즉 Fable 5는 그 강력한 Mythos 계열을 '일반 사용자도 안전하게 쓸 수 있도록' 안전장치를 얹어 공개한 버전입니다."
  - q: "Fable 5는 어디에 특히 강한가요?"
    a: "공식 발표에 따르면 소프트웨어 엔지니어링, 지식 노동, 비전(이미지 이해), 과학 연구 등 거의 모든 테스트 벤치마크에서 최고 수준(SOTA)을 기록했습니다. 특히 '작업이 길고 복잡할수록' 다른 모델과의 격차가 더 벌어진다는 점이 특징입니다. 즉 단발성 질문보다 장시간 이어지는 복잡한 프로젝트에서 진가를 발휘합니다."
  - q: "Mythos 5와 Fable 5는 뭐가 다른가요?"
    a: "둘은 같은 기반 모델입니다. 차이는 안전장치입니다. Fable 5는 일반 공개용으로 안전장치가 켜져 있고, Mythos 5는 일부 영역에서 안전장치를 완화한 버전으로 미국 정부와의 협업(Project Glasswing)을 통해 제한적으로 제공됩니다. 일반 사용자·기업이 접하는 것은 Fable 5입니다."
  - q: "가격은 얼마인가요?"
    a: "100만 토큰당 입력 10달러, 출력 50달러입니다. 이는 Claude Opus 4.8의 약 2배 수준으로, 최상위 성능인 만큼 가격도 프리미엄입니다. 비용이 부담되는 반복·대량 작업에는 하위 모델을 쓰고, 정말 어려운 핵심 작업에만 Fable 5를 투입하는 혼합 전략이 현실적입니다."
  - q: "'일부 질의는 Opus 4.8이 답한다'는 게 무슨 뜻인가요?"
    a: "Fable 5는 강력한 만큼 안전장치를 보수적으로 걸어뒀습니다. 민감하다고 판단되는 일부 주제의 질문은 Fable 5 대신 Claude Opus 4.8이 대신 응답합니다. 앤트로픽은 이 안전장치가 평균적으로 전체 세션의 5% 미만에서만 작동하도록 조정했다고 밝혔습니다. 즉 대부분의 일반적인 사용에서는 Fable 5가 그대로 응답합니다."
---

2026년 6월, 앤트로픽이 지금까지 일반에 공개한 모델 중 <span style="font-size:1.15em;font-weight:700">가장 강력한 Claude Fable 5</span>를 내놓았습니다. 'Mythos급'이라는 낯선 표현과 함께 등장했는데, 대체 무엇이 달라졌고 왜 화제인지, 공식 발표 기준으로 정리했습니다.


<!-- seo-inlink -->
<div class="seo-inlink">🔗 <strong>함께 보면 좋은 글:</strong> <a href="/blog/2026-07-12-ai-google-gemini-3-5-omni-guide-2026/">구글 Gemini 3.5 &amp; Gemini Omni 완…</a> · <a href="/blog/2026-07-11-ai-gpt-5-6-vs-claude-fable-5-coding-showdown/">GPT-5.6 vs Claude Fable 5: 20…</a> · <a href="/blog/2026-07-11-ai-mcp-model-context-protocol-guide-2026/">MCP(모델 컨텍스트 프로토콜) 완벽 가이드: 202…</a></div>

## Fable 5를 한마디로: '봉인 해제된 상위 티어'

앤트로픽에는 공개 라인업(Haiku·Sonnet·Opus) 위에, 더 강력한 Mythos 계열이 있습니다. 그동안은 일반에 열지 않았죠. Fable 5는 이 Mythos급 능력을 '안전하게 쓸 수 있도록' 다듬어 처음으로 일반 공개한 모델입니다.

<div class="callout-info">💡 핵심: Fable 5 = Mythos급 성능 + 일반 공개용 안전장치. 앤트로픽이 지금까지 공개한 모델 중 최상위 성능입니다.</div>

## 무엇이 강한가: '길고 복잡할수록' 강하다

공식 발표에 따르면 Fable 5는 다음 영역에서 최고 수준(SOTA)을 기록했습니다.

| 영역 | 특징 |
|------|------|
| 소프트웨어 엔지니어링 | 복잡한 코드베이스·장시간 작업에 강함 |
| 지식 노동 | 조사·분석·문서 등 실무 업무 |
| 비전 | 이미지·화면 이해 |
| 과학 연구 | 고난도 추론·전문 지식 |

가장 인상적인 특징은 "작업이 길고 복잡할수록 다른 모델과의 격차가 더 커진다"는 점입니다. 짧은 질문 하나로는 차이를 못 느낄 수 있지만, 여러 단계를 거치는 긴 프로젝트일수록 진가가 드러납니다.

<div class="chart-radar" data-title="Claude Fable 5 강점 프로필 (10점 만점, 상대 비교)" data-items='[
  {"name":"Fable 5","scores":[
    {"label":"SW엔지니어링","value":10,"color":"#3b82f6"},
    {"label":"장기 작업","value":10,"color":"#3b82f6"},
    {"label":"지식노동","value":9,"color":"#3b82f6"},
    {"label":"비전","value":9,"color":"#3b82f6"},
    {"label":"가성비","value":5,"color":"#3b82f6"}
  ]}
]'></div>

## 가격: 최상위인 만큼 프리미엄

성능이 최고인 만큼 가격도 높습니다.

<div class="chart-bar" data-title="100만 토큰당 가격 비교 ($, 입력/출력 합산 참고용)" data-labels="Fable 5 출력,Fable 5 입력" data-values="50,10" data-colors="#ef4444,#3b82f6" data-unit="$"></div>

- <span style="font-size:1.3em;font-weight:800">입력 $10 / 출력 $50</span> (100만 토큰당)
- Claude Opus 4.8의 약 2배 수준

그래서 실무에서는 모든 작업에 Fable 5를 쓰기보다, 반복·대량 작업은 하위 모델로 처리하고 정말 어려운 핵심 작업에만 Fable 5를 투입하는 편이 합리적입니다.

## 안전장치: 일부 질의는 Opus 4.8이 대신 답한다

강력한 능력에는 책임이 따릅니다. Fable 5는 민감하다고 판단되는 일부 주제의 질문을 Claude Opus 4.8이 대신 응답하도록 안전장치를 걸어뒀습니다.

- 이 장치는 <span style="font-size:1.15em;font-weight:700">평균 전체 세션의 5% 미만</span>에서만 작동하도록 조정됨
- 실제로 앤트로픽은 초기 공개 후 가드레일을 더 강화해 재배포하기도 했음

즉 대부분의 일반적인 사용에서는 Fable 5가 그대로 응답하며, 극히 일부 민감 영역에서만 보수적으로 작동합니다.

<div class="callout-warning">⚠️ 참고: Fable 5와 동일 기반이지만 안전장치를 일부 완화한 버전이 'Mythos 5'입니다. 이는 미국 정부와의 협업(Project Glasswing)으로 제한 제공되며, 일반 사용자가 접하는 것은 Fable 5입니다.</div>

## 어디서 쓸 수 있나

Fable 5는 Claude API를 비롯해 AWS(Amazon Bedrock), Google Cloud, Microsoft Foundry 등 주요 클라우드에서 제공됩니다. 기업은 기존 클라우드 환경에 그대로 붙여 쓸 수 있습니다.

## 정리

- Fable 5 = 앤트로픽 최초의 일반 공개 Mythos급 모델
- 긴·복잡한 작업에서 특히 강함 (SW·지식노동·비전·과학 SOTA)
- 가격은 $10/$50 (Opus 4.8의 2배) — 혼합 전략 권장
- 민감 질의는 Opus 4.8이 대신 응답(세션의 5% 미만)

"짧은 답변 속도"보다 "길고 어려운 문제를 끝까지 풀어내는 힘"이 필요하다면, Fable 5가 2026년 현재 가장 강력한 선택지입니다.

*※ 본문은 2026년 6월 공식 발표 기준입니다. 가격·제공처·안전정책은 이후 변경될 수 있습니다.*
