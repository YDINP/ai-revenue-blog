---
title: "REST API 설계 베스트 프랙티스: 2026년 실무 가이드"
description: "실무에서 바로 적용할 수 있는 REST API 설계 원칙과 베스트 프랙티스를 예제와 함께 정리합니다. URL 설계, 에러 처리, 인증, 버전 관리까지."
pubDate: 2026-02-06
category: "Dev"
tags: ["REST API", "API 설계", "백엔드 개발", "웹 개발"]
author: "TechFlow"
image:
  url: "https://images.pexels.com/photos/10816120/pexels-photo-10816120.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
  alt: "어두운 테마의 컴퓨터 화면에 표시된 프로그래밍 코드의 상세 보기"
coupangLinks:
  - title: "클린 코드"
    url: "https://link.coupang.com/a/dH5mF4"
  - title: "모던 자바스크립트 Deep Dive"
    url: "https://link.coupang.com/a/dH5mpm"
---

## 좋은 API vs 나쁜 API, 차이는 설계에 있다

API는 서비스의 **얼굴**입니다. 잘 설계된 API는 프론트엔드 개발자의 생산성을 높이고, 외부 파트너와의 통합을 쉽게 만듭니다. 반면 나쁜 API는 끝없는 버그와 혼란의 원인이 됩니다.

이 글에서는 수백 개의 API를 설계하며 쌓은 경험을 바탕으로, **실무에서 바로 적용 가능한 REST API 설계 원칙**을 정리합니다.

## 원칙 1: URL은 리소스 중심으로 설계하라

### 나쁜 예

```
GET /getUserById?id=123
POST /createNewUser
PUT /updateUserEmail
DELETE /deleteUser?id=123
```

### 좋은 예

```
GET    /users/123          # 사용자 조회
POST   /users              # 사용자 생성
PATCH  /users/123          # 사용자 부분 수정
DELETE /users/123          # 사용자 삭제
```

### 핵심 규칙
- URL에는 **명사**를 사용 (동사 금지)
- **복수형** 사용: `/users`, `/products`, `/orders`
- **소문자**와 **하이픈** 사용: `/user-profiles` (카멜케이스 금지)
- 계층 관계는 중첩으로 표현: `/users/123/orders`

## 원칙 2: HTTP 메서드를 올바르게 사용하라

| 메서드 | 용도 | 멱등성 | 요청 바디 |
|--------|------|--------|----------|
| GET | 리소스 조회 | 예 | 없음 |
| POST | 리소스 생성 | 아니요 | 있음 |
| PUT | 리소스 전체 교체 | 예 | 있음 |
| PATCH | 리소스 부분 수정 | 예 | 있음 |
| DELETE | 리소스 삭제 | 예 | 없음 |

### PUT vs PATCH

```json
// PUT: 전체 교체 (누락된 필드는 null 처리)
PUT /users/123
{
  "name": "홍길동",
  "email": "hong@example.com",
  "phone": "010-1234-5678"
}

// PATCH: 부분 수정 (명시된 필드만 변경)
PATCH /users/123
{
  "email": "newemail@example.com"
}
```

## 원칙 3: 일관된 응답 구조를 유지하라

### 성공 응답

```json
{
  "data": {
    "id": 123,
    "name": "홍길동",
    "email": "hong@example.com"
  },
  "meta": {
    "requestId": "req_abc123"
  }
}
```

### 목록 응답 (페이지네이션 포함)

```json
{
  "data": [
    { "id": 1, "name": "제품 A" },
    { "id": 2, "name": "제품 B" }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "hasNext": true
  }
}
```

### 에러 응답

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "이메일 형식이 올바르지 않습니다.",
    "details": [
      {
        "field": "email",
        "message": "유효한 이메일 주소를 입력해주세요."
      }
    ]
  }
}
```

## 원칙 4: 적절한 HTTP 상태 코드를 사용하라

### 자주 사용하는 상태 코드

| 코드 | 의미 | 사용 시점 |
|------|------|----------|
| 200 | OK | 일반 성공 |
| 201 | Created | 리소스 생성 성공 |
| 204 | No Content | 삭제 성공 |
| 400 | Bad Request | 잘못된 요청 (유효성 검사 실패) |
| 401 | Unauthorized | 인증 필요 |
| 403 | Forbidden | 권한 없음 |
| 404 | Not Found | 리소스 없음 |
| 409 | Conflict | 중복 등 충돌 |
| 422 | Unprocessable Entity | 문법은 맞지만 처리 불가 |
| 429 | Too Many Requests | 요청 횟수 초과 |
| 500 | Internal Server Error | 서버 오류 |

### 안티패턴: 모든 응답에 200 반환

```json
// 나쁜 예: 에러인데 200을 반환
HTTP 200 OK
{
  "success": false,
  "error": "사용자를 찾을 수 없습니다"
}

// 좋은 예: 적절한 상태 코드 사용
HTTP 404 Not Found
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "사용자를 찾을 수 없습니다."
  }
}
```

## 원칙 5: 필터링, 정렬, 페이지네이션

```
# 필터링
GET /products?category=electronics&minPrice=10000

# 정렬
GET /products?sort=-createdAt,name

# 페이지네이션 (오프셋 방식)
GET /products?page=2&limit=20

# 페이지네이션 (커서 방식 — 대규모 데이터에 추천)
GET /products?cursor=eyJpZCI6MTAwfQ&limit=20

# 필드 선택
GET /users/123?fields=name,email
```

## 원칙 6: 인증과 보안

### JWT 기반 인증

```
# 로그인
POST /auth/login
→ { "accessToken": "eyJ...", "refreshToken": "..." }

# 인증된 요청
GET /users/me
Authorization: Bearer eyJ...

# 토큰 갱신
POST /auth/refresh
{ "refreshToken": "..." }
```

### 보안 체크리스트

- HTTPS 필수
- Rate Limiting 적용
- 입력 데이터 유효성 검사
- SQL Injection 방어
- CORS 설정
- 민감 정보 로깅 금지

## 원칙 7: API 버전 관리

### URL 방식 (추천)
```
GET /v1/users/123
GET /v2/users/123
```

### 헤더 방식
```
GET /users/123
Accept: application/vnd.myapi.v2+json
```

URL 방식이 가장 직관적이고 디버깅이 쉬워 **대부분의 팀에서 선호**합니다.

## 실전: Express.js 예제

```javascript
// routes/users.js
const express = require('express');
const router = express.Router();

// 사용자 목록 조회 (필터링 + 페이지네이션)
router.get('/', async (req, res) => {
  const { page = 1, limit = 20, role } = req.query;
  const offset = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.findAll({ where: role ? { role } : {}, offset, limit }),
    User.count({ where: role ? { role } : {} })
  ]);

  res.json({
    data: users,
    meta: { total, page: +page, limit: +limit, hasNext: offset + limit < total }
  });
});

// 사용자 생성
router.post('/', validate(createUserSchema), async (req, res) => {
  const user = await User.create(req.body);
  res.status(201).json({ data: user });
});
```

## API 문서화

좋은 API에는 좋은 문서가 필수입니다.

- **OpenAPI (Swagger)**: 업계 표준, 자동 문서 생성
- **Postman Collection**: 팀 공유와 테스트에 편리

## 결론: 좋은 API는 개발자 경험(DX)이다

API 설계는 단순한 기술 결정이 아니라 **개발자 경험(DX) 설계**입니다. 이 글에서 소개한 7가지 원칙을 적용하면, 사용하기 쉽고 유지보수가 편한 API를 만들 수 있습니다.

핵심을 요약하면: **일관성**, **명확성**, **표준 준수**. 이 세 가지만 지켜도 상위 20%의 API가 됩니다.
