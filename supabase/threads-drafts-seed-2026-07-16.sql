-- Threads 초안 시드 — 2026-07-16 신규 6글 (스팀 전환율·광고eCPM·리뷰매출 / 추석상여금·추석여행·가을알레르기)
-- 실행: Supabase SQL Editor에 붙여넣고 RUN. 중복 실행 금지(초안이 또 쌓임). 1회만.
-- 발행: /threads queue 에서 카드 확인 후 발행/예약. 링크는 publishDraft가 첫 댓글에 자동 배치.
-- 계정: TF 글=topic='tech', LF 글=topic='life'. ⚠️ tech 계정 미연결이면 TF 3건은 0행 삽입됨
--        → tech 계정 연결 후 재실행하거나, 임시로 아래 TF 3건의 topic='tech'를 'life'로 바꿔 실행.

-- ══════════════ TechFlow (tech 계정) ══════════════

-- 스팀 상점페이지 전환율
insert into threads_queue (account_id, text, image_url, link_url, link_kind, status)
select id,
E'스팀 위시리스트 안 늘면 캡슐 이미지부터 의심해.\n\n상점페이지 클릭률(CTR) 3% 넘어야 스팀이 노출을 밀어주더라.\n캡슐만 바꿔서 CTR 8%→24% 된 사례도 있고.\n트레일러는 첫 30초에서 절반이 이탈하니까 앞을 세게 가야 함.\n\n스친들 겜 상점페이지 뭐부터 손봐? 👇',
'https://images.pexels.com/photos/12670693/pexels-photo-12670693.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200',
'https://ai-revenue-blog.vercel.app/blog/steam-store-page-conversion-optimization-2026/', 'blog', 'draft'
from threads_accounts where topic='tech' limit 1;

-- 게임 광고수익 eCPM
insert into threads_queue (account_id, text, image_url, link_url, link_kind, status)
select id,
E'같은 광고인데 미국 유저가 베트남보다 10배 벌어줘.\n\n보상형 eCPM이 티어1(미국·한국)은 $15~30인데 동남아는 $2~3대거든.\n그래서 인디는 DAU당 매출(ARPDAU)로 안 보면 착시 옴.\n광고·인앱결제·웹플랫폼이 수익구조가 다 달라서 섞어 봐야 하고.\n\n스친들 게임 수익 광고파야 결제파야? 👇',
'https://images.pexels.com/photos/442576/pexels-photo-442576.jpeg?auto=compress&cs=tinysrgb&w=1200',
'https://ai-revenue-blog.vercel.app/blog/indie-game-ad-revenue-iaa-ecpm-2026/', 'blog', 'draft'
from threads_accounts where topic='tech' limit 1;

-- 스팀 리뷰로 매출 역산
insert into threads_queue (account_id, text, image_url, link_url, link_kind, status)
select id,
E'스팀 리뷰 300개면 판매량 대충 계산돼.\n\n리뷰 1개당 판매 배수(박스라이터)가 2014년 70배에서 지금 30배 아래로 떨어졌거든.\n긍정률 90% 넘으면 이 배수가 또 달라지고.\n그래서 남 게임 매출도 리뷰 수로 역산이 되더라.\n\n스친들은 리뷰 몇 개부터 ''되는'' 것 같아? 👇',
'https://images.pexels.com/photos/442576/pexels-photo-442576.jpeg?auto=compress&cs=tinysrgb&w=1200',
'https://ai-revenue-blog.vercel.app/blog/steam-reviews-sales-correlation-2026/', 'blog', 'draft'
from threads_accounts where topic='tech' limit 1;

-- ══════════════ LifeFlow (life 계정) ══════════════

-- 추석 상여금 재테크
insert into threads_queue (account_id, text, image_url, link_url, link_kind, status)
select id,
E'추석 상여금 통장에 그냥 두는 스친 손 🙋\n\n명절 지출부터 예산 잡고, 고금리 빚 먼저 갚는 게 순서더라.\n남는 건 파킹통장이나 단기예금·ISA로 잠깐 굴리고.\n명절 쓰고 남은 걸 저축하려니까 늘 0원이었던 거임 ㅋㅋ\n\n스친들은 상여금 들어오면 뭐부터 해? 👇',
'https://images.pexels.com/photos/16055842/pexels-photo-16055842.jpeg?auto=compress&cs=tinysrgb&w=1200',
'https://life-revenue-blog.vercel.app/blog/2026-07-16-finance-chuseok-bonus-money-management-2026/', 'blog', 'draft'
from threads_accounts where topic='life' limit 1;

-- 추석 연휴·귀성 교통
insert into threads_queue (account_id, text, image_url, link_url, link_kind, status)
select id,
E'2026 추석 연휴 9월 24일부터야, 스친들.\n\n26일이 토요일이라 연차 하루면 5~6일도 만들어지더라.\n귀성은 오전 일찍, 귀경은 정체 시간대 피해서 쪼개는 게 답이고.\n붐비는 명소 말고 안 붐비는 데 미리 찜해두면 편해.\n\n스친들 이번 추석 어디 가? 귀성? 여행? 👇',
'https://images.pexels.com/photos/7734672/pexels-photo-7734672.jpeg?auto=compress&cs=tinysrgb&w=1200',
'https://life-revenue-blog.vercel.app/blog/2026-07-16-travel-chuseok-2026-domestic-travel-traffic/', 'blog', 'draft'
from threads_accounts where topic='life' limit 1;

-- 가을 알레르기·비염
insert into threads_queue (account_id, text, image_url, link_url, link_kind, status)
select id,
E'가을에 콧물 나면 감기 아니라 알레르기일 수도.\n\n8~10월 잡초 꽃가루(돼지풀·환삼덩굴) 때문에 이맘때 비염 환자 확 늘거든.\n열 없고 맑은 콧물에 눈·코 가려우면 알레르기 쪽이더라.\n침구 60도 세탁이랑 실내습도 40~50%가 기본이고.\n\n스친들은 환절기 비염 어떻게 버텨? 👇',
'https://images.pexels.com/photos/4386466/pexels-photo-4386466.jpeg?auto=compress&cs=tinysrgb&w=1200',
'https://life-revenue-blog.vercel.app/blog/2026-07-16-health-autumn-allergy-rhinitis-prevention-2026/', 'blog', 'draft'
from threads_accounts where topic='life' limit 1;
