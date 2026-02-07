# AI Revenue Blog - 설정 가이드

## 1. n8n 워크플로우 설정 (5분)

### 1-1. n8n 시작
```bash
n8n start
```
브라우저에서 **http://localhost:5678** 접속

### 1-2. 워크플로우 크리덴셜 연결
1. **AI Revenue Blog - Content Generator** 워크플로우 열기
2. 각 HTTP Request 노드를 클릭하여 크리덴셜 연결:
   - **EXA Trend Search** → `EXA API Key` 선택
   - **Claude Haiku - Generate Post** → `Anthropic API Key` 선택
   - **GitHub - Commit Post** → `GitHub PAT` 선택
3. 테스트: 상단 **Test workflow** 버튼 클릭
4. 성공 시: 워크플로우 상단 **Active** 토글 ON

### 1-3. 자동 실행 확인
- 매일 오전 9시(KST)에 자동 실행
- 트렌드 키워드 수집 → AI 글 생성 → GitHub 커밋 → Vercel 자동 배포

---

## 2. Vercel-GitHub 자동 배포 연동 (3분)

1. **https://vercel.com/dashboard** 접속
2. **ai-revenue-blog** 프로젝트 클릭
3. **Settings → Git** 메뉴
4. **Connect Git Repository** 클릭
5. **GitHub** 선택 → `YDINP/ai-revenue-blog` 연결
6. 이후 GitHub push 시 자동 배포 (별도 vercel 명령 불필요)

---

## 3. 쿠팡파트너스 설정 (10분)

### 3-1. 가입
1. **https://partners.coupang.com** 접속
2. 쿠팡 계정으로 로그인
3. 파트너스 가입 신청 (즉시 승인)

### 3-2. 제휴 링크 생성
1. 파트너스 대시보드 → **링크 생성**
2. 추천하고 싶은 상품 검색
3. **링크 생성** 클릭 → URL 복사

### 3-3. 블로그에 적용
기존 글의 쿠팡 링크를 실제 링크로 교체:

**수정할 파일들:**
- `src/blog/2026-02-07-best-ai-coding-tools-2026.md`
- `src/blog/2026-02-06-supabase-free-tier-guide.md`
- `src/blog/2026-02-05-n8n-automation-income.md`
- `src/blog/2026-02-08-ai-automation-passive-income-guide.md`

각 파일의 `coupangLinks` 섹션에서 URL을 교체:
```yaml
coupangLinks:
  - title: "로지텍 MX Keys S 무선 키보드"
    url: "https://link.coupang.com/re/AFFSDP?lptag=실제파트너ID"
```

### 3-4. n8n 워크플로우에도 적용
`n8n/workflows/blog-content-generator.json`의 `Format Blog Post` 노드에서
`coupangProducts` 객체의 URL을 실제 파트너스 링크로 교체

---

## 4. Google AdSense 설정 (글 10편 이상 축적 후)

1. **https://adsense.google.com** 접속
2. 사이트 추가: `ai-revenue-blog.vercel.app`
3. 승인 대기 (보통 1-2주)
4. 승인 후 `src/layouts/BaseLayout.astro`에서 AdSense 코드 주석 해제:
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-실제ID" crossorigin="anonymous"></script>
```

---

## 5. 서비스 URL

| 서비스 | URL |
|--------|-----|
| 블로그 | https://ai-revenue-blog.vercel.app |
| GitHub | https://github.com/YDINP/ai-revenue-blog |
| n8n | http://localhost:5678 |
| Supabase | https://mkatzcmsrdntsmnykxpt.supabase.co |
| 쿠팡파트너스 | https://partners.coupang.com |
| AdSense | https://adsense.google.com |

---

## 6. n8n 자동 시작 (Windows)

시작 프로그램에 등록하려면:
```
Win+R → shell:startup → 바로가기 만들기
대상: cmd /c "n8n start"
```

또는 Windows Task Scheduler에서:
- 트리거: 로그온 시
- 동작: `n8n start`
