---
title: "Docker 입문: 개발 환경을 컨테이너로 통일하는 실전 가이드"
description: "Docker를 처음 접하는 개발자를 위한 실전 입문 가이드입니다. 설치부터 Dockerfile 작성, docker-compose까지 단계별로 설명합니다."
pubDate: 2026-02-03
category: "Dev"
tags: ["Docker", "컨테이너", "개발 환경", "DevOps 입문"]
author: "TechFlow"
image:
  url: "https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2"
  alt: "서버 인프라 컨테이너 기술"
coupangLinks:
  - title: "클린 코드"
    url: "https://link.coupang.com/a/dH5mF4"
  - title: "삼성 SSD 980 PRO 1TB"
    url: "https://link.coupang.com/a/dH5nqe"
---

## "내 컴퓨터에서는 되는데요?" 의 종말

개발자라면 한 번쯤 들어봤을 이 문장. **Docker**는 이 문제를 근본적으로 해결합니다. 개발 환경을 **컨테이너**라는 독립된 상자에 담아서, 어떤 컴퓨터에서든 동일하게 실행되도록 보장합니다.

2026년 현재, Docker는 개발자의 필수 도구입니다. 이 글에서는 Docker를 처음 접하는 분도 바로 실무에 적용할 수 있도록 단계별로 안내합니다.

## Docker란? 쉽게 이해하기

### 가상머신 vs Docker

| | 가상머신 (VM) | Docker 컨테이너 |
|--|--------------|-----------------|
| 크기 | 수 GB | 수십 MB |
| 시작 시간 | 분 단위 | 초 단위 |
| OS | 전체 OS 포함 | 호스트 OS 공유 |
| 성능 | 오버헤드 큼 | 거의 네이티브 |
| 비유 | 아파트 한 채 | 방 하나 |

Docker 컨테이너는 가상머신보다 **가볍고 빠릅니다**. OS를 통째로 띄우는 대신, 앱에 필요한 것만 담아서 실행합니다.

## Step 1: Docker 설치

### Windows / Mac
[Docker Desktop](https://www.docker.com/products/docker-desktop/) 다운로드 후 설치

### Linux (Ubuntu)
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

### 설치 확인
```bash
docker --version
# Docker version 26.x.x

docker run hello-world
# Hello from Docker! 메시지 확인
```

## Step 2: 핵심 개념 이해

### 이미지 (Image)
앱을 실행하기 위한 **설계도**입니다. OS, 언어, 라이브러리, 코드가 모두 포함됩니다.

### 컨테이너 (Container)
이미지를 기반으로 **실제 실행되는 인스턴스**입니다. 하나의 이미지로 여러 컨테이너를 만들 수 있습니다.

### Docker Hub
이미지를 공유하는 **저장소**입니다. `node`, `python`, `nginx` 등 공식 이미지를 무료로 사용할 수 있습니다.

```
이미지(설계도) → 컨테이너(실행 인스턴스) → 앱 실행
```

## Step 3: 첫 번째 컨테이너 실행

```bash
# Node.js 18 컨테이너 실행
docker run -it node:18 bash

# 컨테이너 안에서
node --version  # v18.x.x
exit
```

### 자주 쓰는 Docker 명령어

```bash
# 이미지 다운로드
docker pull python:3.12

# 컨테이너 목록 보기
docker ps        # 실행 중인 것만
docker ps -a     # 전체

# 컨테이너 중지/삭제
docker stop [컨테이너ID]
docker rm [컨테이너ID]

# 이미지 목록/삭제
docker images
docker rmi [이미지ID]
```

## Step 4: Dockerfile 작성하기

**Dockerfile**은 이미지를 만드는 레시피입니다. 직접 작성하면 나만의 환경을 구성할 수 있습니다.

### Node.js 앱 예제

```dockerfile
# 베이스 이미지
FROM node:20-alpine

# 작업 디렉토리
WORKDIR /app

# 의존성 파일 복사 & 설치
COPY package*.json ./
RUN npm ci --production

# 소스 코드 복사
COPY . .

# 포트 설정
EXPOSE 3000

# 앱 실행
CMD ["node", "server.js"]
```

### 이미지 빌드 & 실행

```bash
# 이미지 빌드
docker build -t my-app:1.0 .

# 컨테이너 실행
docker run -p 3000:3000 my-app:1.0
```

### Dockerfile 베스트 프랙티스

1. **alpine 이미지 사용**: `node:20-alpine` (훨씬 가벼움)
2. **레이어 캐싱 활용**: `package.json`을 먼저 복사
3. **.dockerignore 설정**: `node_modules`, `.git` 제외
4. **멀티스테이지 빌드**: 빌드 도구를 최종 이미지에서 제거

## Step 5: Docker Compose로 멀티 서비스 관리

실제 앱은 웹 서버 + DB + 캐시 등 여러 서비스로 구성됩니다. **Docker Compose**는 이를 한 파일로 관리합니다.

### docker-compose.yml 예제

```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/mydb
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=mydb
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### 실행 명령어

```bash
# 모든 서비스 시작
docker compose up -d

# 로그 확인
docker compose logs -f

# 모든 서비스 중지
docker compose down
```

## 실전 활용 시나리오

### 시나리오 1: 팀 개발 환경 통일
```bash
# 새 팀원이 합류하면
git clone https://github.com/team/project.git
cd project
docker compose up -d
# 끝! 5분 만에 개발 환경 세팅 완료
```

### 시나리오 2: 로컬 DB 테스트
```bash
# MySQL을 설치하지 않고 바로 사용
docker run -d -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=test \
  mysql:8.0
```

### 시나리오 3: CI/CD 파이프라인
GitHub Actions에서 Docker 이미지를 빌드하고 자동 배포하는 것이 현대 DevOps의 표준입니다.

## Docker 초보자 FAQ

### Q: Docker가 가상머신을 완전히 대체하나요?
A: 아닙니다. Docker는 **앱 단위** 격리에 적합하고, 완전한 OS 격리가 필요하면 VM이 필요합니다.

### Q: Docker Desktop은 유료인가요?
A: 개인/소규모 기업은 무료입니다. 대기업(직원 250명 이상)은 유료 구독이 필요합니다.

### Q: 윈도우에서 Docker가 잘 돌아가나요?
A: WSL2 기반으로 잘 동작합니다. 다만 Mac/Linux 대비 약간의 성능 차이가 있습니다.

## 결론: Docker로 개발 생산성 2배 올리기

Docker는 "있으면 좋은 도구"가 아니라 **"없으면 안 되는 도구"**입니다. 환경 설정에 시간을 낭비하지 않고, 코딩에만 집중할 수 있게 해줍니다.

오늘 배운 5단계를 순서대로 따라해보세요. 한 번 익숙해지면 Docker 없이는 개발하기 싫어질 것입니다!
