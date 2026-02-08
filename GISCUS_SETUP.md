# Giscus 댓글 시스템 설정 가이드

## 개요

이 가이드는 ai-revenue-blog에 Giscus 댓글 시스템을 통합하는 방법을 설명합니다. Giscus는 GitHub Discussions를 기반으로 하는 오픈소스 댓글 시스템으로, GitHub 계정으로 댓글을 작성할 수 있습니다.

---

## 1단계: GitHub Discussions 활성화

1. GitHub 저장소 페이지로 이동합니다
   - URL: https://github.com/YDINP/ai-revenue-blog

2. **Settings** 탭 클릭

3. **Features** 섹션에서 **Discussions** 체크박스 활성화
   - "Set up discussions" 버튼이 보이면 클릭하여 초기화

4. Discussions가 활성화되면 자동으로 **General** 카테고리가 생성됩니다
   - 이 카테고리를 블로그 댓글용으로 사용합니다

---

## 2단계: giscus.app에서 설정 생성

1. https://giscus.app 접속

2. **Configuration** 섹션 작성:

   ### Repository 입력
   ```
   YDINP/ai-revenue-blog
   ```

   ### Page ↔ Discussions Mapping
   - **pathname** 선택
   - 각 블로그 글의 경로를 Discussion과 매핑합니다

   ### Discussion Category
   - **General** 선택
   - (1단계에서 자동 생성된 카테고리)

   ### Features
   - ✅ **Enable reactions** 체크 (댓글에 이모지 반응 가능)
   - **Discussion Input Position**: **Top** 선택 (입력창을 상단에 배치)

   ### Theme
   - **preferred_color_scheme** 선택
   - 사용자 시스템 테마(라이트/다크)에 자동 반응합니다

   ### Language
   - **한국어 (Korean)** 선택

3. **"이 설정을 활성화합니다"** 버튼 클릭

4. 하단에 생성된 스크립트에서 다음 두 값을 복사합니다:
   ```html
   <script ...
     data-repo="YDINP/ai-revenue-blog"
     data-repo-id="R_여기에_긴_문자열"         ← 이 값 복사
     data-category="General"
     data-category-id="DIC_여기에_긴_문자열"   ← 이 값 복사
     ...
   </script>
   ```

   **예시:**
   - `data-repo-id`: `R_kgDOMpUBxA` (실제로는 더 길 수 있음)
   - `data-category-id`: `DIC_kwDOMpUBxM4ClXbz` (실제로는 더 길 수 있음)

---

## 3단계: 블로그에 적용

### 파일 경로
```
D:\park\YD_Claude_RND\ai-revenue-blog\src\layouts\BlogPostLayout.astro
```

### 수정할 위치
**라인 295번**과 **라인 297번**의 빈 값을 채웁니다:

```astro
<!-- 수정 전 (라인 284-309) -->
<section class="comments-section">
  <h3>댓글</h3>
  <script src="https://giscus.app/client.js"
    data-repo="YDINP/ai-revenue-blog"
    data-repo-id=""                          ← 라인 295: 여기에 복사한 값 입력
    data-category="General"
    data-category-id=""                      ← 라인 297: 여기에 복사한 값 입력
    data-mapping="pathname"
    data-strict="0"
    data-reactions-enabled="1"
    data-emit-metadata="0"
    data-input-position="top"
    data-theme="preferred_color_scheme"
    data-lang="ko"
    data-loading="lazy"
    crossorigin="anonymous"
    async>
  </script>
</section>
```

### 수정 후 예시
```astro
<script src="https://giscus.app/client.js"
  data-repo="YDINP/ai-revenue-blog"
  data-repo-id="R_kgDOMpUBxA"                 ← 2단계에서 복사한 값
  data-category="General"
  data-category-id="DIC_kwDOMpUBxM4ClXbz"    ← 2단계에서 복사한 값
  data-mapping="pathname"
  data-strict="0"
  data-reactions-enabled="1"
  data-emit-metadata="0"
  data-input-position="top"
  data-theme="preferred_color_scheme"
  data-lang="ko"
  data-loading="lazy"
  crossorigin="anonymous"
  async>
</script>
```

### TODO 주석 제거 (옵션)
적용 후 라인 287-292의 TODO 주석을 삭제하거나 주석 처리할 수 있습니다:
```astro
<!--
  TODO: Giscus 설정 완료 필요
  1. https://giscus.app 에서 GitHub 저장소 연결
  2. data-repo-id 및 data-category-id 값 받아오기
  3. 아래 스크립트의 빈 값 채우기
-->
```

---

## 4단계: 테스트

### 로컬 개발 서버 실행
```bash
cd D:\park\YD_Claude_RND\ai-revenue-blog
npm run dev
```

### 확인 사항
1. 브라우저에서 `http://localhost:4321/blog/` 접속
2. 아무 블로그 글 하나 클릭
3. 글 하단으로 스크롤하여 **"댓글"** 섹션 확인
4. Giscus 위젯이 정상적으로 표시되는지 확인:
   - GitHub 로그인 버튼 또는 댓글 입력창이 보여야 함
   - 다크/라이트 모드가 시스템 테마와 일치하는지 확인

### 프로덕션 배포 후 확인
```bash
npm run build
npm run preview
```
또는 Vercel에 배포 후 실제 URL(https://ai-revenue-blog.vercel.app)에서 테스트

---

## 문제 해결

### 위젯이 표시되지 않는 경우
1. **브라우저 콘솔**에서 에러 확인 (F12 → Console)
2. **data-repo-id**와 **data-category-id** 값이 정확한지 재확인
3. GitHub Discussions가 **Public** 저장소에서 활성화되어 있는지 확인
4. giscus.app에서 다시 설정을 생성하여 값 재확인

### 댓글이 저장되지 않는 경우
1. GitHub 저장소의 **Discussions** 탭에서 댓글이 Discussion으로 생성되는지 확인
2. 저장소가 **Public**인지 확인 (Private 저장소는 추가 설정 필요)

### 테마가 적용되지 않는 경우
- `data-theme="preferred_color_scheme"` 값이 정확한지 확인
- 브라우저 시스템 테마 설정 확인

---

## 추가 정보

### Giscus 공식 문서
- https://giscus.app
- https://github.com/giscus/giscus

### 현재 설정 요약
| 설정 항목 | 값 |
|----------|-----|
| Repository | YDINP/ai-revenue-blog |
| Mapping | pathname |
| Category | General |
| Theme | preferred_color_scheme |
| Language | 한국어 (ko) |
| Input Position | Top |
| Reactions | Enabled |

---

## 완료 체크리스트

- [ ] GitHub Discussions 활성화 (1단계)
- [ ] giscus.app에서 repo-id, category-id 생성 (2단계)
- [ ] BlogPostLayout.astro 파일 수정 (3단계)
- [ ] 로컬 개발 서버에서 테스트 (4단계)
- [ ] 프로덕션 배포 후 최종 확인
- [ ] TODO 주석 제거 (옵션)

모든 단계 완료 후, 블로그의 모든 글에서 GitHub Discussions 기반 댓글 시스템을 사용할 수 있습니다!
