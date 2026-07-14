-- 미나(life) 계정 Threads 초안 시드 — /threads queue life 로 카드 확인 후 발행/예약
-- account_id는 topic='life' 계정을 자동 조회. 정보글은 link_url(첫 댓글 자동)·이미지 포함.
-- 실행: Supabase SQL Editor에 붙여넣고 RUN. 중복 실행하면 초안이 또 쌓이니 1회만.

-- ── 정보글 (링크=첫 댓글 자동, 이미지 포함) ──
insert into threads_queue (account_id, text, image_url, link_url, link_kind, status)
select id,
E'해외여행 가는데 아직 공항에서 환전하는 스친 있어?\n\n트래블로그·트래블월렛이면 환전 수수료 0에 현지 결제까지 되거든.\n일본이면 세븐뱅크 무료 출금 되는 트래블로그가 거의 필수더라.\n남는 돈 환급 조건은 카드마다 다르니 확인하고.\n\n스친들은 무슨 트래블카드 써? 어디 갈 거야? 👇',
'https://images.pexels.com/photos/1051071/pexels-photo-1051071.jpeg?auto=compress&cs=tinysrgb&w=1200',
'https://life-revenue-blog.vercel.app/blog/2026-07-14-travel-travel-card-comparison-2026/', 'blog', 'draft'
from threads_accounts where topic='life' limit 1;

insert into threads_queue (account_id, text, image_url, link_url, link_kind, status)
select id,
E'연말정산 12월에 하려는 스친들, 그거 이미 늦었어.\n\n지출 다 끝나서 그때 되면 바꿀 게 없거든.\n진짜 승부는 지금 7월이더라.\n- 월세공제: 무주택에 총급여 8천 이하면 최대 170만원 돌려받잖아\n- 연금저축·IRP: 한도 600/900만, 여유되면 채워두면 개이득\n- 카드: 총급여 25% 넘게 썼는지 지금 봐두면 편해\n\n스친들은 연말정산 얼마나 돌려받았어? 👇',
'https://images.pexels.com/photos/7680483/pexels-photo-7680483.jpeg?auto=compress&cs=tinysrgb&w=1200',
'https://life-revenue-blog.vercel.app/blog/2026-07-14-finance-year-end-tax-early-preparation-2026/', 'blog', 'draft'
from threads_accounts where topic='life' limit 1;

insert into threads_queue (account_id, text, image_url, link_url, link_kind, status)
select id,
E'영양제 ''좋다니까'' 사서 서랍에 쌓아둔 스친 나뿐이야? ㅋㅋ\n\n2026년은 목적별이 트렌드더라. 눈·장·관절·회복.\n눈은 루테인, 장은 균주 다양성+보장균수 보고 고르는 거고.\n근데 종합비타민이랑 겹치면 지용성 비타민 과다되니 주의 ㅠ\n\n스친들은 무슨 영양제 챙겨 먹어? 👇',
'https://images.pexels.com/photos/3683074/pexels-photo-3683074.jpeg?auto=compress&cs=tinysrgb&w=1200',
'https://life-revenue-blog.vercel.app/blog/2026-07-14-health-supplement-by-purpose-guide-2026/', 'blog', 'draft'
from threads_accounts where topic='life' limit 1;

insert into threads_queue (account_id, text, image_url, link_url, link_kind, status)
select id,
E'2026년에 국민연금 더 내는 거, 스친들 알고 있었어?\n\n보험료율 9.5%로 오르는데 소득대체율도 43%로 올라(더 내고 더 받음).\n주택연금은 월 수령 늘고 보증료 내려서 문턱도 낮아졌고.\n근데 국민연금만으론 부족해서 연금 3층 쌓아야 되더라.\n\n스친들은 노후 준비 뭐부터 하고 있어? 👇',
'https://images.pexels.com/photos/16055842/pexels-photo-16055842.jpeg?auto=compress&cs=tinysrgb&w=1200',
'https://life-revenue-blog.vercel.app/blog/2026-07-14-finance-national-housing-pension-reform-2026/', 'blog', 'draft'
from threads_accounts where topic='life' limit 1;

-- ── 공감글 (링크 없음, 순수 댓글 유도) ──
insert into threads_queue (account_id, text, link_kind, status)
select id,
E'월급날인데 카드값 빠지니까 3초 만에 텅장 되는 거, 스친들도 그래?\n\n분명 어제까진 부자였는데.\n이번 달도 "다음 달부터 아껴야지" 시전 중 ㅋㅋㅠ\n\n스친들 이번 달 텅장 탈출 각 있어? 👇',
'none', 'draft'
from threads_accounts where topic='life' limit 1;

insert into threads_queue (account_id, text, link_kind, status)
select id,
E'적금 붓다가 급한 일로 중간에 깨본 스친… 나만 있는 거 아니지?\n\n만기까지 못 간 적금이 벌써 몇 개째인지 모르겠어.\n그래서 요즘은 비상금부터 따로 떼두는 중이야.\n\n스친들은 적금 만기까지 성공한 적 있어? 👇',
'none', 'draft'
from threads_accounts where topic='life' limit 1;

insert into threads_queue (account_id, text, link_kind, status)
select id,
E'에어컨 켜자니 전기세, 끄자니 더위… 스친들은 어느 쪽 참아?\n\n26도가 국룰이라는데 나는 자꾸 24도로 손이 가고 ㅋㅋ\n고지서 볼 때마다 잠깐 반성함.\n\n스친들 집 에어컨 몇 도에 맞춰놔? 👇',
'none', 'draft'
from threads_accounts where topic='life' limit 1;

insert into threads_queue (account_id, text, link_kind, status)
select id,
E'냉장고에 뭐는 많은데 먹을 건 없는 그 현상, 다들 알지?\n\n문 열고 30초 째려보다 그냥 닫는 거 몇 번째인지.\n분명 장은 봤는데 조합이 안 됨 ㅋㅋ\n\n스친들 냉장고 털어먹기 메뉴 하나만 추천해줘 👇',
'none', 'draft'
from threads_accounts where topic='life' limit 1;
