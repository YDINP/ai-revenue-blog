---
title: "2026년 Git & GitHub 완벽 입문 가이드: 초보자도 10분만에 시작"
description: "Git과 GitHub를 처음 배우는 분을 위한 완벽 입문 가이드입니다. 설치부터 첫 커밋, PR까지 10분만에 마스터하세요."
pubDate: 2026-02-04
category: "Dev"
tags: ["Git 입문", "GitHub 사용법", "버전 관리", "개발 입문"]
author: "TechFlow"
coupangLinks:
  - title: "모던 자바스크립트 Deep Dive"
    url: "https://link.coupang.com/a/dH5mpm"
  - title: "클린 코드"
    url: "https://link.coupang.com/a/dH5mF4"
---

## Git, 왜 배워야 할까?

프로그래밍을 시작하면 반드시 만나게 되는 도구가 바로 **Git**입니다. Git은 코드의 변경 이력을 관리하는 **버전 관리 시스템**으로, 전 세계 개발자의 93% 이상이 사용하고 있습니다.

"혼자 개발하는데 Git이 필요해?" — 네, 절대적으로 필요합니다. 코드를 실수로 삭제해도 복구할 수 있고, 실험적인 기능을 안전하게 테스트할 수 있습니다.

## Git vs GitHub: 차이점 이해하기

| | Git | GitHub |
|--|-----|--------|
| 정의 | 버전 관리 도구 | Git 호스팅 플랫폼 |
| 설치 | 로컬 컴퓨터 | 웹사이트 |
| 역할 | 코드 변경 추적 | 코드 공유 & 협업 |
| 비유 | 문서 편집기 (Word) | 클라우드 저장소 (Google Drive) |

쉽게 말해, **Git**은 도구이고 **GitHub**는 그 도구로 만든 작업물을 저장하고 공유하는 플랫폼입니다.

## Step 1: Git 설치하기

### Windows
1. [git-scm.com](https://git-scm.com)에서 설치 파일 다운로드
2. 설치 시 기본 옵션 유지 (Next만 클릭)
3. 설치 확인:

```bash
git --version
# git version 2.45.0
```

### Mac
```bash
# Homebrew가 없다면 먼저 설치
brew install git
```

### 초기 설정 (필수)
```bash
git config --global user.name "홍길동"
git config --global user.email "hong@example.com"
```

## Step 2: 첫 번째 저장소 만들기

```bash
# 프로젝트 폴더 생성
mkdir my-first-project
cd my-first-project

# Git 저장소 초기화
git init
```

`git init`을 실행하면 숨겨진 `.git` 폴더가 생성됩니다. 이 폴더가 모든 버전 이력을 저장합니다.

## Step 3: 첫 번째 커밋하기

커밋(commit)은 코드의 **스냅샷**입니다. "이 시점의 코드를 저장해둬"라는 의미입니다.

```bash
# 파일 생성
echo "# My First Project" > README.md

# 변경 사항 확인
git status

# 스테이징 (커밋할 파일 선택)
git add README.md

# 커밋 (스냅샷 저장)
git commit -m "첫 번째 커밋: README 추가"
```

### Git의 3단계 워크플로우

```
작업 디렉토리 → (git add) → 스테이징 영역 → (git commit) → 저장소
```

1. **작업 디렉토리**: 실제로 파일을 편집하는 곳
2. **스테이징 영역**: 다음 커밋에 포함할 파일들
3. **저장소**: 커밋된 스냅샷들이 저장되는 곳

## Step 4: GitHub에 올리기

### GitHub 계정 만들기
1. [github.com](https://github.com) 접속
2. Sign Up → 이메일, 비밀번호 입력
3. 이메일 인증 완료

### 원격 저장소 연결

```bash
# GitHub에서 새 저장소(repository) 생성 후
git remote add origin https://github.com/username/my-first-project.git

# 코드 업로드
git push -u origin main
```

## Step 5: 브랜치 사용하기

브랜치(branch)는 **독립된 작업 공간**입니다. 메인 코드에 영향을 주지 않고 새로운 기능을 개발할 수 있습니다.

```bash
# 새 브랜치 생성 & 이동
git checkout -b feature/login

# 작업 후 커밋
git add .
git commit -m "로그인 기능 구현"

# 메인 브랜치로 돌아가기
git checkout main

# 브랜치 병합
git merge feature/login
```

### 브랜치 전략 (초보자 추천)

```
main ─────────────────────────── (안정 버전)
  └── feature/login ────┐
                         └──── merge
  └── feature/signup ───┐
                         └──── merge
```

## Step 6: Pull Request (PR) 만들기

**Pull Request**는 "내 코드를 검토하고 합쳐주세요"라는 요청입니다. 팀 협업의 핵심 기능입니다.

1. 새 브랜치에서 작업 완료
2. GitHub에 push
3. GitHub 웹에서 "New Pull Request" 클릭
4. 변경 내용 설명 작성
5. 리뷰어 지정 → 승인 후 Merge

## 자주 쓰는 Git 명령어 모음

| 명령어 | 설명 | 사용 빈도 |
|--------|------|----------|
| `git status` | 현재 상태 확인 | 매우 높음 |
| `git add .` | 모든 변경 파일 스테이징 | 매우 높음 |
| `git commit -m "메시지"` | 커밋 | 매우 높음 |
| `git push` | 원격 저장소에 업로드 | 높음 |
| `git pull` | 원격 변경사항 다운로드 | 높음 |
| `git log --oneline` | 커밋 이력 보기 | 중간 |
| `git branch` | 브랜치 목록 | 중간 |
| `git diff` | 변경 내용 비교 | 중간 |
| `git stash` | 임시 저장 | 중간 |
| `git reset --soft HEAD~1` | 마지막 커밋 취소 | 낮음 |

## 초보자가 자주 하는 실수와 해결법

### 실수 1: 커밋 메시지를 대충 쓴다
```bash
# 나쁜 예
git commit -m "수정"
git commit -m "asdf"

# 좋은 예
git commit -m "로그인 비밀번호 유효성 검사 추가"
git commit -m "메인 페이지 로딩 속도 30% 개선"
```

### 실수 2: main에서 직접 작업한다
항상 **브랜치를 만들어서** 작업하세요. main은 항상 안정된 상태를 유지해야 합니다.

### 실수 3: .gitignore를 설정 안 한다
```bash
# .gitignore 파일 생성
echo "node_modules/" >> .gitignore
echo ".env" >> .gitignore
echo ".DS_Store" >> .gitignore
```

비밀번호, API 키, node_modules 같은 것들은 절대 GitHub에 올리면 안 됩니다!

## 추천 Git GUI 도구

명령어가 어렵다면 GUI 도구를 사용해보세요:

- **GitHub Desktop**: 가장 쉬움 (초보자 추천)
- **GitKraken**: 시각화 우수
- **VS Code 내장**: 별도 설치 불필요

## 결론: Git은 개발자의 안전벨트

Git을 모르고 개발하는 것은 안전벨트 없이 운전하는 것과 같습니다. 처음에는 명령어가 낯설지만, 일주일만 사용하면 습관이 됩니다.

오늘 배운 6단계를 순서대로 따라해보세요. **첫 커밋**을 하는 순간, Git의 매력에 빠지게 될 것입니다!
