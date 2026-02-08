# Blog Content Guidelines (블로그 콘텐츠 작성 가이드)

## 필수 규칙

### 1. 시각 차트 (비교/분석 글 필수)

비교, 분석, 리뷰 성격의 글에는 **반드시** 시각 차트를 포함해야 합니다.

#### chart-bar (막대 차트)
수치 데이터 비교에 사용:
```html
<div class="chart-bar"
  data-title="차트 제목"
  data-labels="항목1,항목2,항목3"
  data-values="85,92,78"
  data-colors="#10b981,#3b82f6,#f59e0b"
  data-unit="점">
</div>
```

#### chart-radar (항목별 점수 비교)
여러 항목을 점수로 비교할 때 사용 (10점 만점):
```html
<div class="chart-radar"
  data-title="차트 제목"
  data-items='[
    {"name":"제품A","scores":[
      {"label":"성능","value":9,"color":"#10b981"},
      {"label":"가격","value":7,"color":"#10b981"}
    ]},
    {"name":"제품B","scores":[
      {"label":"성능","value":8,"color":"#3b82f6"},
      {"label":"가격","value":9,"color":"#3b82f6"}
    ]}
  ]'>
</div>
```

#### 색상 팔레트
- 제품/모델 A: `#10b981` (초록)
- 제품/모델 B: `#3b82f6` (파랑)
- 제품/모델 C: `#f59e0b` (노랑)
- 제품/모델 D: `#ef4444` (빨강)
- 제품/모델 E: `#8b5cf6` (보라)
- 비강조/참고: `#94a3b8` (회색)

### 2. 차트 배치 위치
- **종합 비교 차트**: 첫 번째 비교 테이블 바로 아래 또는 본문 시작 직후
- **세부 비교 차트**: 해당 섹션의 비교 테이블 바로 아래
- **결론 차트**: 최종 추천 섹션 직전

### 3. 차트가 필요한 글 유형
- "vs", "비교", "추천", "TOP", "순위" 키워드가 포함된 글
- 2개 이상의 제품/서비스/도구를 비교하는 글
- 수치 데이터(가격, 성능, 점수)가 포함된 글

### 4. 이미지
- 모든 글에 `image` frontmatter 필수 (Pexels API large2x URL)
- `alt` 텍스트 한국어 작성

### 5. 쿠팡 링크
- 리뷰/추천 글에 관련 쿠팡 상품 1-3개 연결
- `coupangLinks` frontmatter 배열 사용

## n8n 자동 생성 시 체크리스트
- [ ] image frontmatter 포함?
- [ ] 비교 글이면 chart-bar 또는 chart-radar 포함?
- [ ] coupangLinks 매핑?
- [ ] category/tags 정확?
- [ ] pubDate가 오늘 이하?
