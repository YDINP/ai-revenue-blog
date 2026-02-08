---
title: "Python 자동화 입문: 반복 업무를 코드로 해결하는 5가지 실전 예제"
description: "파이썬으로 반복 업무를 자동화하는 5가지 실전 예제를 초보자도 따라할 수 있게 설명합니다."
pubDate: 2026-02-06
category: "Dev"
tags: ["Python자동화", "파이썬", "업무자동화", "코딩입문", "자동화"]
author: "TechFlow"
image:
  url: "https://images.pexels.com/photos/1181281/pexels-photo-1181281.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
  alt: "노트북 키보드에서 타이핑하는 손의 클로즈업, Python 책이 보이며 코딩 진행 중"
coupangLinks:
  - title: "혼자 공부하는 파이썬"
    url: "https://link.coupang.com/a/dH5mU8"
  - title: "점프 투 파이썬"
    url: "https://link.coupang.com/a/dH5nbS"
---

## 왜 Python 자동화인가?

매일 반복되는 파일 정리, 데이터 복사, 이메일 발송 같은 업무를 손으로 하고 계신가요? **Python 자동화**를 배우면 클릭 100번을 코드 10줄로 줄일 수 있습니다. Python은 배우기 쉬운 문법과 강력한 라이브러리 덕분에 비개발자도 **업무자동화**를 시작하기 좋은 언어입니다.

이번 가이드에서는 실무에서 바로 쓸 수 있는 **파이썬 업무자동화** 예제 5가지를 단계별로 소개합니다. 모든 코드는 Windows 환경에서 테스트되었으며, Python 3.10 이상에서 동작합니다.

## 자동화 예제 비교표

| 예제 | 난이도 | 소요 시간 | 활용 상황 | 주요 라이브러리 |
|------|--------|----------|----------|---------------|
| 파일명 일괄 변경 | ★☆☆ | 5분 | 다운로드 폴더 정리, 사진 정리 | os, pathlib |
| 이메일 자동 발송 | ★★☆ | 15분 | 단체 공지, 리포트 전송 | smtplib, email |
| 웹 스크래핑 | ★★★ | 20분 | 뉴스 수집, 가격 모니터링 | requests, BeautifulSoup |
| Excel 데이터 처리 | ★★☆ | 10분 | 매출 집계, 데이터 정제 | openpyxl, pandas |
| 스케줄 자동 실행 | ★☆☆ | 10분 | 정기 백업, 알림 발송 | schedule |

## 1. 파일명 일괄 변경 - 다운로드 폴더 정리

### 문제 상황
다운로드 폴더에 `image_001.jpg`, `image_002.jpg` 같은 파일 100개가 있는데, `vacation_2026_001.jpg`처럼 앞에 접두사를 붙이고 싶습니다.

### 코드
```python
import os
from pathlib import Path

def rename_files(folder_path, prefix):
    """폴더 내 모든 파일 이름 앞에 접두사 추가"""
    folder = Path(folder_path)

    for index, file in enumerate(sorted(folder.glob("*.jpg")), start=1):
        new_name = f"{prefix}_{index:03d}{file.suffix}"
        new_path = file.parent / new_name
        file.rename(new_path)
        print(f"변경: {file.name} -> {new_name}")

# 실행 예시
rename_files("C:/Users/Downloads/photos", "vacation_2026")
```

### 해설
`Path.glob()`으로 확장자별 파일을 필터링하고, `enumerate()`로 일련번호를 붙입니다. `{index:03d}`는 001, 002처럼 3자리 숫자로 포맷팅하는 문법입니다. 이 **Python 자동화** 스크립트 하나로 1000개 파일도 5초 안에 처리됩니다.

## 2. 이메일 자동 발송 - 단체 공지 보내기

### 문제 상황
팀원 50명에게 같은 내용의 월간 리포트를 Gmail로 발송해야 합니다. 수동으로 보내면 30분 걸리지만, **파이썬 업무자동화**로 1분 안에 해결합니다.

### 코드
```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email(to_list, subject, body):
    """Gmail SMTP로 이메일 일괄 발송"""
    sender = "your_email@gmail.com"
    password = "your_app_password"  # Gmail 앱 비밀번호 사용

    for recipient in to_list:
        msg = MIMEMultipart()
        msg['From'] = sender
        msg['To'] = recipient
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(sender, password)
            server.send_message(msg)
            print(f"발송 완료: {recipient}")

# 실행 예시
recipients = ["team1@company.com", "team2@company.com"]
send_email(recipients, "2월 월간 리포트", "첨부된 리포트를 확인해주세요.")
```

### 주의사항
Gmail은 보안을 위해 앱 비밀번호를 사용해야 합니다. Google 계정 설정 > 보안 > 2단계 인증 활성화 > 앱 비밀번호 생성 순으로 발급받으세요. **업무자동화** 시 비밀번호는 환경변수로 관리하는 것이 안전합니다.

## 3. 웹 스크래핑 - 뉴스 제목 수집

### 문제 상황
매일 아침 IT 뉴스 사이트에서 헤드라인 10개를 복사해 슬랙에 공유합니다. **Python 자동화**로 한 번에 가져오고 싶습니다.

### 코드
```python
import requests
from bs4 import BeautifulSoup

def scrape_news(url):
    """웹 페이지에서 뉴스 제목 추출"""
    response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    soup = BeautifulSoup(response.text, 'html.parser')

    headlines = soup.select('h2.article-title')  # CSS 선택자는 사이트마다 다름

    for index, headline in enumerate(headlines[:10], start=1):
        print(f"{index}. {headline.get_text(strip=True)}")

# 실행 예시 (가상의 URL)
scrape_news("https://example-news-site.com/tech")
```

### 법적 주의사항
웹 스크래핑은 사이트의 `robots.txt` 정책을 확인하고, 과도한 요청으로 서버에 부하를 주지 않도록 주의해야 합니다. **파이썬 업무자동화**로 크롤링 시 `time.sleep()`을 사용해 요청 간격을 두세요.

## 4. Excel 데이터 처리 - 매출 집계 자동화

### 문제 상황
매달 엑셀 파일 10개를 열어 판매량 합계를 수작업으로 계산합니다. **업무자동화**로 자동 집계하고 싶습니다.

### 코드
```python
import pandas as pd
from pathlib import Path

def aggregate_sales(folder_path):
    """폴더 내 모든 엑셀 파일 매출 합계"""
    folder = Path(folder_path)
    total_sales = 0

    for excel_file in folder.glob("*.xlsx"):
        df = pd.read_excel(excel_file)
        sales = df['매출액'].sum()  # '매출액' 열이 있다고 가정
        total_sales += sales
        print(f"{excel_file.name}: {sales:,}원")

    print(f"\n총 매출: {total_sales:,}원")

# 실행 예시
aggregate_sales("C:/Users/Reports/2026")
```

### 라이브러리 설치
```bash
pip install pandas openpyxl
```

Pandas는 **Python 자동화**에서 엑셀/CSV 처리의 표준 라이브러리입니다. `read_excel()`, `sum()`, `groupby()` 같은 함수로 복잡한 데이터 분석도 10줄로 해결됩니다.

## 5. 스케줄 자동 실행 - 매일 오전 9시 백업

### 문제 상황
매일 아침 특정 폴더를 ZIP으로 압축해 백업해야 하는데, 깜빡하는 경우가 많습니다. **파이썬 업무자동화**로 자동 실행하고 싶습니다.

### 코드
```python
import schedule
import time
import shutil
from datetime import datetime

def backup_folder():
    """폴더 압축 백업"""
    source = "C:/Users/Documents/project"
    backup_name = f"backup_{datetime.now().strftime('%Y%m%d')}"
    shutil.make_archive(backup_name, 'zip', source)
    print(f"백업 완료: {backup_name}.zip")

# 매일 오전 9시 실행
schedule.every().day.at("09:00").do(backup_folder)

# 스케줄러 실행 (24시간 대기)
print("스케줄러 시작. Ctrl+C로 종료.")
while True:
    schedule.run_pending()
    time.sleep(60)  # 1분마다 확인
```

### 라이브러리 설치
```bash
pip install schedule
```

### Windows 작업 스케줄러 등록
스크립트를 `.py` 파일로 저장 후, Windows 작업 스케줄러에 등록하면 PC 부팅 시 자동 실행됩니다. **업무자동화**의 핵심은 사람이 신경 쓰지 않아도 돌아가는 시스템을 만드는 것입니다.

## Python 자동화 학습 로드맵

| 단계 | 학습 내용 | 예상 기간 |
|------|----------|----------|
| 1단계 | Python 기초 문법 (변수, 함수, 반복문) | 1주 |
| 2단계 | 파일 입출력, pathlib 사용법 | 3일 |
| 3단계 | pandas, openpyxl로 엑셀 다루기 | 1주 |
| 4단계 | requests, BeautifulSoup 웹 크롤링 | 1주 |
| 5단계 | GUI 자동화 (pyautogui) | 3일 |

**Python 자동화** 학습 시 추천하는 순서는 "내가 반복하는 업무 찾기 → 해당 예제 검색 → 코드 수정해서 실행" 입니다. 책을 처음부터 끝까지 읽기보다, 실전 문제를 해결하며 배우는 것이 훨씬 효율적입니다.

## 자주 묻는 질문

### Q1. Python 설치가 어려운데요?
Anaconda를 설치하면 Python + 주요 라이브러리가 한 번에 설치됩니다. 비개발자에게 가장 쉬운 방법입니다.

### Q2. 에러가 나면 어떻게 하나요?
에러 메시지를 구글에 검색하거나, ChatGPT에 에러 로그를 붙여넣으세요. **파이썬 업무자동화** 커뮤니티(예: 생활코딩, 점프 투 파이썬)에서도 질문할 수 있습니다.

### Q3. 회사 보안 정책에 위배되지 않나요?
회사 데이터를 외부로 전송하거나, 허가되지 않은 웹사이트에 접근하는 자동화는 사전에 IT 팀과 협의하세요. 로컬 파일 정리, 엑셀 작업 같은 단순 **업무자동화**는 대부분 문제없습니다.

## 마무리

**Python 자동화**는 하루 30분을 절약해주는 작은 스크립트부터 시작됩니다. 처음엔 5줄짜리 파일명 변경 코드지만, 익숙해지면 복잡한 데이터 파이프라인도 구축할 수 있습니다. 이번 가이드의 5가지 예제를 직접 실행해보고, 여러분의 반복 업무에 맞게 수정해보세요. **파이썬 업무자동화**로 시간을 절약하고, 더 창의적인 일에 집중하시길 바랍니다.

> 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
