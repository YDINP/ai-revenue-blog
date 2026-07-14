# SETUP — Threads 자동 포스팅 (사용자 액션)

내가 코드는 다 만들지만, **Threads 계정 생성 + Meta 앱 등록 + OAuth 로그인**은 사용자님이 직접 하셔야 합니다(대신 로그인 불가). 아래 순서대로 하시면 됩니다.

## 1. Threads 계정 준비
- 먼저 **1개만** (life·꿀팁용 추천). 인스타그램 연동 계정으로 Threads 활성화.
- ⚠️ 여러 신규 계정을 하루에 몰아서 만들지 말 것 (Meta 계정팜 탐지). 1~2주 간격 순차.

## 2. Meta 개발자 앱 생성
1. https://developers.facebook.com → **My Apps → Create App**
2. Use case에서 **"Access the Threads API"** 선택
3. 앱 생성 후 **Threads → Settings** 이동

## 3. 앱 설정값 확보
- **Threads App ID**, **Threads App Secret** 복사 → 나에게 전달(또는 Vercel 환경변수 직접 입력)
- **Redirect Callback URLs**에 추가:
  ```
  https://ai-revenue-blog.vercel.app/api/threads-oauth
  ```
- **Permissions**: `threads_basic`, `threads_content_publish`, `threads_manage_insights` 요청
  (개발 모드에선 본인 계정으로 바로 테스트 가능. 앱 리뷰는 나중에)

## 4. Vercel 환경변수 (내가 안내, 값은 사용자)
Vercel 프로젝트 Settings → Environment Variables:
```
THREADS_APP_ID          = (3번의 App ID)
THREADS_APP_SECRET      = (3번의 App Secret)
THREADS_REDIRECT_URI    = https://ai-revenue-blog.vercel.app/api/threads-oauth
SUPABASE_SERVICE_ROLE_KEY = (Supabase → Settings → API → service_role key)  ← 토큰 저장용, 절대 클라이언트 노출 금지
```

## 5. Supabase 스키마 적용
Supabase SQL Editor에서 `supabase/threads-schema.sql` 실행.

## 6. 계정 연결 (토큰 자동 저장)
위가 끝나면 내가 만든 링크를 브라우저에서 1회 열면 됩니다:
```
https://ai-revenue-blog.vercel.app/api/threads-oauth?connect=1&topic=life&persona=<페르소나설명>
```
→ Threads 로그인·승인 → long-lived 토큰이 `threads_accounts`에 자동 저장 → 연결 완료.

## 완료 후
텔레그램 `/threads`로 계정 확인 → `/threads gen life`로 첫 초안 → 승인 발행 테스트.
