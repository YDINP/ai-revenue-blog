// 스모크 테스트: fetch 모킹 후 두 핸들러의 주요 플로우 검증. 실행: node scripts/test-telegram-bot.mjs
process.env.WEBHOOK_SECRET = 'testsecret';
process.env.TELEGRAM_BOT_TOKEN = 'TESTTOKEN';
process.env.TELEGRAM_ADMIN_CHAT_ID = '11111';
process.env.COMMENT_ADMIN_KEY = 'testadminkey';
process.env.GITHUB_TOKEN = 'ghtest';
process.env.CRON_SECRET = 'croncron';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'testsrk'; // site_feedback은 RLS 차단이라 service_role 필요

// 봇 대화 상태(newpost/edit/delete 흐름)를 인메모리로 모킹
let botState = null;

// 사이트 피드백 인메모리 스토어 (조회/삭제 검증용)
let feedbackRows = [
  {
    id: 7, site: 'ipsi-archive', category: '데이터오류',
    target: '인덕대학교|웹툰만화학과(방송문화콘텐츠 학부)',
    message: '실기 일정이 <b>작년</b> 기준이에요',
    context: { view: 'card', shown: 40, q: '인덕', fields: ['만화·웹툰'], types: [], regions: [], admits: [], practs: [], screen: '390x844' },
    page_url: 'https://ipsi-archive-site.vercel.app/', user_agent: 'Mozilla/5.0 (iPhone)',
    created_at: '2026-07-27 05:21:01.624642+00',
  },
  {
    id: 8, site: 'ipsi-archive', category: '기능제안', target: null,
    message: '등록금도 같이 보여주세요',
    context: { view: 'table', shown: 40 },
    page_url: 'https://ipsi-archive-site.vercel.app/', user_agent: 'Mozilla/5.0 (Windows NT 10.0)',
    created_at: '2026-07-27 06:00:00+00',
  },
];

const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
  if (url.includes('api.telegram.org')) return { json: async () => ({ ok: true }) };
  if (url.includes('/rest/v1/comments?id=eq.')) {
    return { json: async () => [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', post_slug: 'my-post', source: 'mg', nickname: '홍길동', content: '질문요' }] };
  }
  if (url.includes('/rpc/admin_reply')) return { status: 200, json: async () => ({ success: true, id: 'new-id' }) };
  if (url.includes('/rpc/admin_delete_comment')) return { status: 200, json: async () => ({ success: true, deleted: 2 }) };
  // ── 뭉게(mungge) 모킹 ──
  // 뭉게 수치는 RPC 가 아니라 ga4_daily(배치) + analytics pageview_mg(실시간) + WP REST 다.
  // 이걸 안 깔면 /stats·/top·/report 가 전부 "조회 실패"로 떨어져 회귀를 못 잡는다.
  if (url.includes('/rest/v1/ga4_daily') && url.includes('select=updated_at')) {
    return { ok: true, json: async () => [{ updated_at: new Date().toISOString() }] };
  }
  if (url.includes('/rest/v1/ga4_daily')) {
    const day = (n) => new Date(Date.now() + 9 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
    const rowsFor = (d, mul) => [
      { date: d, dim: 'total', key: '(all)', sessions: 30 * mul, users: 25 * mul, views: 40 * mul, engaged: 12 * mul },
      { date: d, dim: 'source_medium', key: 'naver / referral', sessions: 12 * mul, users: 10 * mul, views: 14 * mul, engaged: 5 * mul },
      { date: d, dim: 'source_medium', key: 'google / organic', sessions: 8 * mul, users: 7 * mul, views: 9 * mul, engaged: 4 * mul },
      { date: d, dim: 'source_medium', key: '(direct) / (none)', sessions: 6 * mul, users: 5 * mul, views: 7 * mul, engaged: 3 * mul },
      { date: d, dim: 'channel', key: 'Organic Search', sessions: 8 * mul, users: 7 * mul, views: 9 * mul, engaged: 4 * mul },
      { date: d, dim: 'page_all', key: '/mg-hot-post/', sessions: 20 * mul, users: 18 * mul, views: 25 * mul, engaged: 9 * mul },
    ];
    // 일일 리포트 기준일(어제) · /stats 기준일(오늘) · 그 전날(전일 대비 계산용)
    return { ok: true, json: async () => [...rowsFor(day(0), 1), ...rowsFor(day(1), 2), ...rowsFor(day(2), 1)] };
  }
  if (url.includes('event_type=eq.pageview_mg')) {
    return { ok: true, json: async () => [
      { created_at: new Date().toISOString(), metadata: { path: '/mg-hot-post/', title: '뭉게 인기글', referrer: 'https://search.naver.com/', user_agent: 'UA9' } },
    ] };
  }
  if (url.includes('event_type=eq.naver_index')) {
    return { ok: true, json: async () => [{ created_at: new Date().toISOString(), metadata: { date: new Date().toISOString().slice(0, 10), indexed: 7, sitemap: 244 } }] };
  }
  if (url.includes('mungge.com/wp-json/wp/v2/posts')) {
    return { ok: true, headers: { get: (k) => (k.toLowerCase() === 'x-wp-total' ? '196' : null) },
      json: async () => [{ title: { rendered: '뭉게 최근글' }, link: 'https://mungge.com/mg-new/', date: new Date().toISOString().slice(0, 19), slug: 'mg-new' }] };
  }
  if (url.includes('mungge.com/wp-json/wp/v2/comments')) {
    return { ok: true, headers: { get: (k) => (k.toLowerCase() === 'x-wp-total' ? '2' : null) },
      json: async () => [{ id: 1, author_name: '뭉게독자', content: { rendered: '<p>잘 봤어요</p>' }, date: new Date(Date.now() + 9 * 3600e3 - 864e5).toISOString().slice(0, 19), link: 'https://mungge.com/mg-new/#comment-1' }] };
  }

  // ── 대시보드 조회 RPC 모킹 ──
  if (url.includes('/rpc/get_traffic_summary')) return { status: 200, json: async () => ({ today_views: 123, yesterday_views: 98, today_clicks: 5, total_clicks: 321, today_likes: 2, total_likes: 45, total_subscribers: 12, today_subscribers: 1, total_views: 12345, mg_today_clicks: 3, mg_total_clicks: 200, mg_today_likes: 1, mg_total_likes: 20, mg_live_today_views: 7, vip_today_views: 43, vip_total_views: 4345, vip_today_clicks: 2, vip_total_clicks: 121 }) };
  if (url.includes('/rpc/get_comment_stats')) return { status: 200, json: async () => ({ total: 57, today: 3, reports: 1, vip_count: 17 }) };
  if (url.includes('/rpc/get_top_pages')) return { ok: true, status: 200, json: async () => [{ path: '/blog/vip-post/', slug: 'vip-post', title: 'VIP글 | VIP', source: 'vip', views: 55 }] };
  if (url.includes('/rpc/get_all_comments')) return { status: 200, json: async () => [
    { id: '11111111-2222-3333-4444-555555555555', post_slug: 'p1', source: 'blog', nickname: 'A', content: 'c1', parent_id: null, is_admin: false, created_at: new Date().toISOString(), report_count: 0 },
    { id: '66666666-7777-8888-9999-000000000000', post_slug: 'p2', source: 'lifeflow', nickname: 'B', content: 'c2', parent_id: null, is_admin: false, created_at: new Date().toISOString(), report_count: 1 },
  ] };
  if (url.includes('/rpc/get_daily_trend')) return { status: 200, json: async () => [{ day: '2026-07-10', views: 10 }, { day: '2026-07-11', views: 20 }] };
  if (url.includes('/rpc/get_comment_trend')) return { status: 200, json: async () => [{ day: '2026-07-11', count: 3, blog_count: 2, lf_count: 1 }] };
  if (url.includes('/rpc/get_top_liked_posts')) return { status: 200, json: async () => [{ title: '좋아요글 | TechFlow', slug: 'liked', like_count: 7 }] };
  if (url.includes('/rpc/get_recent_events')) return { status: 200, json: async () => [{ event_type: 'pageview', source: 'blog', created_at: new Date().toISOString(), metadata: { title: '이벤트글 | TechFlow', slug: 'ev' } }] };
  if (url.includes('/rest/v1/analytics?')) return { ok: true, json: async () => [
    { event_type: 'pageview', source: 'blog', created_at: new Date().toISOString(), metadata: { title: '내글 | TechFlow', slug: 'my-post', user_agent: 'UA1', referrer: 'https://www.google.com/search?q=x' } },
    { event_type: 'pageview', source: 'blog', created_at: new Date().toISOString(), metadata: { title: '내글 | TechFlow', slug: 'my-post', user_agent: 'UA1', referrer: 'direct' } },
    { event_type: 'coupang_click', source: 'blog', created_at: new Date().toISOString(), metadata: { product: '노트북 거치대', url: 'https://link.coupang.com/a/x', slug: 'my-post', title: '내글 | TechFlow', user_agent: 'UA1' } },
    { event_type: 'affiliate_click', source: 'lifeflow', created_at: new Date().toISOString(), metadata: { target: 'coupang', label: '무선 청소기', href: 'https://link.coupang.com/a/y', slug: 'lf-post', user_agent: 'UA2' } },
  ] };
  // ── 봇 대화 상태 RPC ──
  if (url.includes('/rpc/bot_state_set')) { botState = JSON.parse(opts.body).p_value; return { status: 200, json: async () => ({ success: true }) }; }
  if (url.includes('/rpc/bot_state_get')) return { status: 200, json: async () => (botState || {}) };
  if (url.includes('/rpc/bot_state_clear')) { botState = null; return { status: 200, json: async () => ({ success: true }) }; }
  // ── 리포트용 REST ──
  if (url.includes('/rest/v1/comments?created_at')) return { ok: true, json: async () => [{ source: 'blog', nickname: '독자', content: '좋은 글', post_slug: 'p1', is_admin: false }] };
  if (url.includes('/rest/v1/card_likes')) return { ok: true, json: async () => [{ slug: 'p1' }, { slug: 'p2' }] };
  // ── 핫 키워드 소스 ──
  // 블로그 RSS = 이미 쓴 글 제목 (시드 미사용 판정 기준)
  // 뭉게는 WordPress RSS(/feed/), VIP 는 Astro(/rss.xml) — 두 경로 모두 같은 목으로 받는다
  if (url.includes('/rss.xml') || url.includes('/feed/')) return { ok: true, text: async () => '<rss><channel><item><title>ChatGPT 활용법: 최신 기능과 실전 팁</title></item></channel></rss>' };
  // 커뮤니티 목: 긱뉴스(Atom) — 'llm 추론'이 두 글에 반복 = 실시간 화제
  // IndexNow 제출 엔드포인트
  if (url.includes('api.indexnow.org')) return { ok: true, status: 200, json: async () => ({}) };
  if (url.includes('news.hada.io')) return { ok: true, text: async () => `<feed>
    <entry><title><![CDATA[LLM 추론 비용을 90% 줄인 방법]]></title></entry>
    <entry><title><![CDATA[LLM 추론 서버를 직접 만들어봤습니다]]></title></entry>
    <entry><title><![CDATA[정청래 의원 관련 정치 이슈]]></title></entry>
  </feed>` };
  // 커뮤니티 목: 뽐뿌 — 핫딜 제목의 단위(3kg/355ml)가 키워드로 새면 안 됨
  if (url.includes('ppomppu.co.kr')) return { ok: true, text: async () => `<rss><channel>
    <item><title>[G마켓] 열무김치 3kg (9,900원/무배)</item></title></item>
    <item><title>[톡딜] 몬스터 에너지 355ml 24캔 (23,940원)</title></item>
  </channel></rss>` };
  // 뉴스 목: 검색어(q)를 그대로 되돌려 관련성 게이트를 통과시키고, 잡음/옛기사 케이스를 섞음
  const q = decodeURIComponent((url.match(/[?&]q=([^&]+)/) || [])[1] || '').replace(' when:7d', '');
  const head = q.split(' ')[0];
  const fresh = new Date().toUTCString();
  const old = new Date(Date.now() - 400 * 86400000).toUTCString();
  if (url.includes('news.google.com')) return { ok: true, text: async () => `<rss><channel>
    <item><title>${head} 신제품 출시 - AI타임스 - AI타임스</title><pubDate>${fresh}</pubDate></item>
    <item><title>refactor: SomeComponent 마이그레이션 #973</title><pubDate>${fresh}</pubDate></item>
  </channel></rss>` };
  if (url.includes('bing.com/news')) return { ok: true, text: async () => `<rss><channel>
    <item><title>${head} 신제품 출시</title><pubDate>${fresh}</pubDate></item>
    <item><title>${head} 도입 확산으로 업계 변화</title><pubDate>${fresh}</pubDate></item>
    <item><title>${head} 5년 전 회고 기사</title><pubDate>${old}</pubDate></item>
    <item><title>무관한 지역 행사 소식</title><pubDate>${fresh}</pubDate></item>
  </channel></rss>` };
  // Hacker News = 해외 개발자 커뮤니티 (블로그 키워드 필터링 대상)
  if (url.includes('hn.algolia.com')) return { ok: true, json: async () => ({ hits: [
    { title: 'Show HN: A new LLM inference engine', points: 300 },
    { title: 'Sourdough starter tips from a baker', points: 120 },
  ] }) };
  // ── GitHub API ──
  if (url.includes('api.github.com')) {
    if (url.includes('category-seeds.json')) {
      const seeds = { categories: [
        { name: 'AI', keywords: ['AI 코딩 도구 추천', 'ChatGPT 활용법'], searchTerms: ['AI coding tools', 'LLM inference'] },
        { name: 'Game', keywords: ['인디게임 마케팅'], searchTerms: ['indie game marketing'] },
      ] };
      return { ok: true, status: 200, json: async () => ({ sha: 's', content: Buffer.from(JSON.stringify(seeds), 'utf8').toString('base64') }) };
    }
    if (url.includes('/enable')) return { ok: true, status: 204, json: async () => null };
    // Vercel 이 GitHub 에 남기는 배포 기록 (Vercel 토큰 없이 /status 조회)
    if (/\/deployments\/\d+\/statuses/.test(url)) return { ok: true, status: 200, json: async () => [
      { state: 'success', target_url: 'https://ai-revenue-blog.vercel.app', created_at: new Date().toISOString() },
    ] };
    if (url.includes('/deployments?')) return { ok: true, status: 200, json: async () => [
      { id: 123, sha: 'abc1234def', created_at: new Date().toISOString(), payload: { githubCommitMessage: 'feat: 새 글' } },
    ] };
    if (url.includes('/dispatches')) {
      // 첫 호출은 비활성 워크플로 422 → enable 후 재시도 성공을 재현
      if (!globalThis.__dispatchEnabled) {
        globalThis.__dispatchEnabled = true;
        return { ok: false, status: 422, json: async () => ({ message: "Cannot trigger a 'workflow_dispatch' on a disabled workflow" }) };
      }
      return { ok: true, status: 204, json: async () => null };
    }
    const m = url.match(/\/contents\/([^?]+)/);
    // VIP(playcast)의 contentDir 은 src/videos 다 — 경로를 하나만 받으면 /posts·/index 가 죽는다
    if (url.includes('/contents/src/blog?') || url.includes('/contents/src/videos?')) return { ok: true, status: 200, json: async () => [
      { type: 'file', name: '2026-07-12-new-post.md', path: 'src/videos/2026-07-12-new-post.md', sha: 'sha1' },
      { type: 'file', name: '2026-07-11-old-post.md', path: 'src/videos/2026-07-11-old-post.md', sha: 'sha2' },
    ] };
    if (m && opts.method === undefined) {
      const md = '---\ntitle: "테스트 글"\npubDate: 2026-07-12\ndraft: false\n---\n\n본문입니다.\n';
      return { ok: true, status: 200, json: async () => ({ sha: 'sha1', content: Buffer.from(md, 'utf8').toString('base64') }) };
    }
    if (m && (opts.method === 'PUT' || opts.method === 'DELETE')) return { ok: true, status: 200, json: async () => ({ commit: { sha: 'newsha' } }) };
    if (url.includes('/dispatches')) return { ok: true, status: 204, json: async () => null };
    if (url.includes('/runs?')) return { ok: true, status: 200, json: async () => ({ workflow_runs: [{ status: 'completed', conclusion: 'success', html_url: 'u', created_at: 'now' }] }) };
    if (url.includes('/git/ref/')) return { ok: true, status: 200, json: async () => ({ object: { sha: 'headsha' } }) };
    if (url.includes('/git/commits/')) return { ok: true, status: 200, json: async () => ({ tree: { sha: 'treesha' } }) };
    if (url.includes('/git/commits')) return { ok: true, status: 200, json: async () => ({ sha: 'abcdef1234' }) };
    if (url.includes('/git/refs/')) return { ok: true, status: 200, json: async () => ({}) };
  }
  // ── 사이트 피드백(site_feedback) — RLS 차단이라 service_role REST로만 접근 ──
  if (url.includes('/rest/v1/site_feedback')) {
    if (opts.method === 'DELETE') {
      const id = (url.match(/id=eq\.(\d+)/) || [])[1];
      feedbackRows = feedbackRows.filter((f) => String(f.id) !== id);
      return { ok: true, status: 200, json: async () => [] };
    }
    const idEq = (url.match(/id=eq\.(\d+)/) || [])[1];
    if (idEq) return { ok: true, status: 200, json: async () => feedbackRows.filter((f) => String(f.id) === idEq) };
    const siteEq = decodeURIComponent((url.match(/site=eq\.([^&]+)/) || [])[1] || '');
    let rows = siteEq ? feedbackRows.filter((f) => f.site === siteEq) : feedbackRows;
    const lim = Number((url.match(/limit=(\d+)/) || [])[1]);
    if (Number.isFinite(lim)) rows = rows.slice(0, lim);
    return { ok: true, status: 200, json: async () => rows };
  }
  throw new Error('unexpected fetch ' + url);
};

function mockRes() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

const assert = (cond, name) => { if (!cond) { console.error('FAIL:', name); process.exitCode = 1; } else console.log('PASS:', name); };

const { default: commentHook } = await import('../api/comment-webhook.js');
const { default: tgHook } = await import('../api/telegram-webhook.js');

// 1. 잘못된 시크릿 → 401
let res = mockRes();
await commentHook({ method: 'POST', headers: { 'x-webhook-secret': 'wrong' }, body: {} }, res);
assert(res.code === 401, 'comment-webhook rejects bad secret');

// 2. 정상 INSERT → 텔레그램 알림 전송, #c_ 마커 포함
calls.length = 0;
res = mockRes();
await commentHook({
  method: 'POST', headers: { 'x-webhook-secret': 'testsecret' },
  body: { type: 'INSERT', table: 'comments', record: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', post_slug: 'my-post', source: 'mg', nickname: '홍길동', content: '<b>질문</b>요', is_admin: false, parent_id: null } },
}, res);
const sent = calls.find(c => c.url.includes('sendMessage'));
assert(res.code === 200 && res.body.ok === true, 'comment-webhook 200 ok');
assert(sent && sent.body.chat_id === '11111', 'notification goes to admin chat');
assert(sent.body.text.includes('#c_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), 'notification contains #c_ marker');
assert(sent.body.text.includes('&lt;b&gt;질문&lt;/b&gt;요'), 'content is HTML-escaped');
// 뭉게는 WordPress 라 /blog/ 프리픽스가 없다 — 붙이면 404 로 보낸다
assert(sent.body.text.includes('https://mungge.com/my-post/'), 'notification links to the mungge post');

// 3. 관리자 답변 INSERT → 알림 스킵
calls.length = 0;
res = mockRes();
await commentHook({ method: 'POST', headers: { 'x-webhook-secret': 'testsecret' }, body: { type: 'INSERT', table: 'comments', record: { id: 'x', is_admin: true } } }, res);
assert(res.body.skipped && calls.length === 0, 'admin reply insert is skipped (no loop)');

// 4. 알림에 답장 → getComment 조회 + admin_reply RPC 호출
calls.length = 0;
res = mockRes();
await tgHook({
  method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'testsecret' },
  body: { message: { message_id: 5, chat: { id: 11111 }, text: '  안녕하세요, 답변드립니다  ', reply_to_message: { text: '💬 새 댓글\n...\n#c_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\n답장하면...' } } },
}, res);
const rpc = calls.find(c => c.url.includes('/rpc/admin_reply'));
assert(rpc, 'reply-to-notification calls admin_reply');
assert(rpc && rpc.body.p_parent_id === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' && rpc.body.p_slug === 'my-post' && rpc.body.p_source === 'mg' && rpc.body.p_admin_key === 'testadminkey', 'admin_reply params correct');
assert(rpc.body.p_content === '안녕하세요, 답변드립니다', 'reply content trimmed');
assert(calls.some(c => c.url.includes('sendMessage') && c.body.text.includes('✅')), 'success confirmation sent');

// 5. /reply 명령
calls.length = 0;
res = mockRes();
await tgHook({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'testsecret' }, body: { message: { message_id: 6, chat: { id: 11111 }, text: '/reply aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee 명령으로 답변' } } }, res);
assert(calls.some(c => c.url.includes('/rpc/admin_reply') && c.body.p_content === '명령으로 답변'), '/reply command works');

// 6. /delete 명령
calls.length = 0;
res = mockRes();
await tgHook({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'testsecret' }, body: { message: { message_id: 7, chat: { id: 11111 }, text: '/delete #c_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' } } }, res);
assert(calls.some(c => c.url.includes('/rpc/admin_delete_comment')), '/delete command works');
assert(calls.some(c => c.url.includes('sendMessage') && c.body.text.includes('2개')), 'delete count reported');

// 7. 비관리자 채팅 → 거부
calls.length = 0;
res = mockRes();
await tgHook({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'testsecret' }, body: { message: { message_id: 8, chat: { id: 99999 }, text: '/reply aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee 해킹' } } }, res);
assert(!calls.some(c => c.url.includes('/rpc/')), 'non-admin chat cannot trigger RPC');

// 8. 텔레그램 시크릿 불일치 → 401
res = mockRes();
await tgHook({ method: 'POST', headers: {}, body: {} }, res);
assert(res.code === 401, 'telegram-webhook rejects missing secret');

// ── 대시보드 실시간 조회 명령 ──
const tgMsg = (text) => ({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'testsecret' }, body: { message: { message_id: 10, chat: { id: 11111 }, text } } });
const sentTexts = () => calls.filter(c => c.url.includes('sendMessage')).map(c => c.body.text);

// 9. /stats → 전체 요약 (트래픽 + 댓글 통계)
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/stats'), res);
let out = sentTexts().join('\n');
assert(out.includes('전체 요약') && out.includes('뭉게'), '/stats is mungge-first');
assert(out.includes('321'), '/stats shows cumulative coupang clicks');
assert(out.includes('57'), '/stats includes comment stats');
assert(!/TechFlow|LifeFlow|레거시/.test(out), '/stats has no TF/LF legacy block');

// 10. /mg → 뭉게 상세 (GA4 + WP REST)
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/mg'), res);
out = sentTexts().join('\n');
assert(out.includes('뭉게') && out.includes('유입 경로'), '/mg shows mungge detail with referrers');
assert(out.includes('196'), '/mg shows WP total post count');

// 11. /top → 뭉게 인기 페이지 (GA4 page_all)
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/top 5'), res);
out = sentTexts().join('\n');
assert(out.includes('인기 페이지') && out.includes('뭉게'), '/top is mungge-based');
assert(!/\[TF\]|\[LF\]/.test(out), '/top has no TF/LF badges');

// 12. /coupang → 어떤 글에서 어떤 링크 상세 (affiliate_click 레거시 포함)
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/coupang'), res);
out = sentTexts().join('\n');
assert(out.includes('노트북 거치대') && out.includes('무선 청소기'), '/coupang includes both event types');
assert(out.includes('link.coupang.com/a/x') && out.includes('내글'), '/coupang shows link + post detail');

// 13. /comments 2 → 헤더 + 댓글별 개별 메시지 (각자 #c_ → 답장 타깃 분리)
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/comments 2'), res);
const cm = sentTexts();
assert(cm.length === 3, '/comments sends header + one message per comment');
assert(cm[1].includes('#c_11111111') && cm[2].includes('#c_66666666'), 'each comment message has its own #c_ id');
assert(cm[2].includes('신고 1'), 'reported comment is flagged');

// 14. /trend /cstats /likes /recent → 에러 없이 응답
for (const c of ['/trend', '/cstats', '/likes', '/recent']) {
  calls.length = 0; res = mockRes();
  await tgHook(tgMsg(c), res);
  const t = sentTexts();
  assert(res.code === 200 && t.length === 1 && !t[0].includes('❌'), `${c} responds without error`);
}

// 15. 비관리자 채팅에서 /stats → 조회 차단
calls.length = 0; res = mockRes();
await tgHook({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'testsecret' }, body: { message: { message_id: 11, chat: { id: 99999 }, text: '/stats' } } }, res);
assert(!calls.some(c => c.url.includes('/rpc/get_traffic_summary')), 'non-admin cannot query dashboard');

// ── 블로그 제어 ──

// 16. /blogs → 뭉게 + Playcast 두 개 (TF/LF 삭제됨)
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/blogs'), res);
out = sentTexts().join('\n');
assert(out.includes('Mungge') && out.includes('Playcast'), '/blogs lists mungge and playcast');
assert(!/TechFlow|LifeFlow/.test(out), '/blogs no longer lists TF/LF');
assert(out.includes('WordPress 직접 운영'), '/blogs marks mungge as WordPress-managed');

// 16b. 뭉게는 repo 기반 글 명령을 거부해야 한다 — 허용하면 이관 전 Astro 마크다운을 만진다
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/posts mg'), res);
out = sentTexts().join('\n');
assert(/WordPress|없습니다/.test(out), '/posts mg is refused (no content repo)');

// 17. /posts pc → 발행/숨김 표시 + slug
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/posts pc'), res);
out = sentTexts().join('\n');
assert(out.includes('테스트 글') && out.includes('2026-07-12-new-post'), '/posts lists posts with titles and slugs');
assert(out.includes('✅'), '/posts marks published state');

// 18. /draft pc <slug> → PUT 커밋 (draft: true)
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/draft pc 2026-07-12-new-post'), res);
const put = calls.find(c => c.url.includes('/contents/') && c.body?.content);
assert(put, '/draft commits via contents API');
assert(Buffer.from(put.body.content, 'base64').toString('utf8').includes('draft: true'), '/draft sets draft: true in frontmatter');

// 19. /publish 는 이미 발행 상태면 커밋하지 않음
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/publish pc 2026-07-12-new-post'), res);
assert(!calls.some(c => c.body?.content), '/publish skips commit when already published');
assert(sentTexts()[0].includes('이미'), '/publish reports already-published');

// 20. /newpost 흐름: 제목 → 본문 → 커밋
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/newpost pc'), res);
assert(botState?.flow === 'newpost' && botState.step === 'title', '/newpost starts title step');
calls.length = 0; res = mockRes();
await tgHook(tgMsg('봇으로 쓴 글'), res);
assert(botState?.step === 'body', 'newpost advances to body step');
calls.length = 0; res = mockRes();
await tgHook(tgMsg('## 본문\n내용입니다.'), res);
const newPut = calls.find(c => c.url.includes('/contents/') && c.body?.content);
assert(newPut, 'newpost commits the file');
const newMd = Buffer.from(newPut.body.content, 'base64').toString('utf8');
assert(newMd.includes('title: "봇으로 쓴 글"') && newMd.includes('내용입니다.'), 'newpost writes frontmatter + body');
assert(newMd.includes('draft: false'), 'newpost publishes by default');
assert(botState === null, 'newpost clears state after commit');

// 21. /delpost → 확인 전에는 삭제 안 함, '확인' 후 DELETE
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/delpost pc 2026-07-12-new-post'), res);
assert(botState?.flow === 'delete', '/delpost sets confirm state');
assert(!calls.some(c => c.opts?.method === 'DELETE'), '/delpost does not delete before confirm');
calls.length = 0; res = mockRes();
await tgHook(tgMsg('아니오'), res);
assert(botState === null && sentTexts()[0].includes('취소'), 'non-확인 cancels delete');
await tgHook(tgMsg('/delpost pc 2026-07-12-new-post'), mockRes());
calls.length = 0; res = mockRes();
await tgHook(tgMsg('확인'), res);
assert(sentTexts()[0].includes('삭제 완료'), '확인 performs delete');

// 22. /generate tf <카테고리> <주제> → 즉시 workflow_dispatch (인자 직접 지정 경로)
//     첫 dispatch 는 목에서 "disabled workflow" 422 → 자동 enable 후 재시도해야 성공
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/generate mg AI 인디게임 수익화'), res);
assert(calls.some(c => c.url.includes('/enable')), 'disabled workflow is auto-enabled on 422');
const disp = calls.filter(c => c.url.includes('/dispatches')).pop();
assert(disp, '/generate with args dispatches the workflow');
assert(disp.body.inputs.category === 'AI' && disp.body.inputs.topic === '인디게임 수익화', '/generate passes category and topic');
assert(!sentTexts().join('').includes('❌'), 'no error surfaced after auto-enable retry');

// 22b. /generate (인자 없음) → 블로그 선택 버튼
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/generate'), res);
const startMsg = calls.find(c => c.url.includes('sendMessage'));
assert(startMsg?.body.reply_markup, '/generate shows inline keyboard');
const blogBtns = startMsg.body.reply_markup.inline_keyboard[0];
assert(blogBtns.some(b => b.callback_data === 'g:blog:mg'), 'mungge blog button offered');
assert(!JSON.stringify(startMsg.body.reply_markup).includes('g:blog:pc'), 'playcast excluded (no generator workflow)');
assert(!/g:blog:tf|g:blog:lf/.test(JSON.stringify(startMsg.body.reply_markup)), 'TF/LF buttons gone');

// 22c. 블로그 선택 콜백 → 주제 결정 방식 버튼
const cbUpdate = (data) => ({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'testsecret' }, body: { callback_query: { id: 'cb1', data, message: { message_id: 50, chat: { id: 11111 } } } } });
calls.length = 0; res = mockRes();
await tgHook(cbUpdate('g:blog:mg'), res);
let edited = calls.find(c => c.url.includes('editMessageText'));
assert(calls.some(c => c.url.includes('answerCallbackQuery')), 'callback spinner is cleared');
assert(edited && JSON.stringify(edited.body.reply_markup).includes('g:hot'), 'blog pick offers hot/manual/auto');
assert(botState?.flow === 'generate' && botState.blog === 'mg', 'blog stored in state');

// 22d. 핫 키워드 → 시드/트렌드/인기글 후보 버튼
calls.length = 0; res = mockRes();
await tgHook(cbUpdate('g:hot'), res);
edited = calls.find(c => c.url.includes('editMessageText'));
assert(edited && edited.body.text.includes('핫 키워드'), 'hot keyword list shown');
const kwBtns = JSON.stringify(edited.body.reply_markup);
assert(kwBtns.includes('g:kw:0'), 'keyword buttons present');
assert(botState?.cands?.length > 0, 'candidates saved in state (callback data stays under 64B)');
assert(botState.cands.some(c => c.src === 'seed'), 'seeds included as candidates');
// 이미 쓴 글(RSS 제목 "ChatGPT 활용법…")과 겹치는 시드는 후보에서 제외돼야 함
assert(!botState.cands.some(c => c.src === 'seed' && c.topic === 'ChatGPT 활용법'), 'already-covered seed is filtered out');
assert(botState.cands.some(c => c.src === 'seed' && c.topic === '인디게임 마케팅'), 'unused seed is kept');
// 뉴스는 매체명 접미사(중복 포함)가 제거된 상태
const newsCand = botState.cands.find(c => c.src === 'news');
assert(newsCand && !newsCand.label.includes('AI타임스'), 'news headline strips repeated media suffix');
// 여러 엔진(구글·빙) 사용
assert(calls.some(c => c.url.includes('news.google.com')) && calls.some(c => c.url.includes('bing.com/news')), 'both news engines queried');
// 검색어는 고정값이 아니라 커뮤니티 실시간 화제에서 생성
const newsUrls = calls.filter(c => c.url.includes('news.google.com')).map(c => decodeURIComponent(c.url));
assert(calls.some(c => c.url.includes('news.hada.io')), 'community source is queried');
assert(newsUrls.some(u => /llm 추론/i.test(u)), 'news query comes from community hot keyword (not hardcoded)');
assert(!newsUrls.some(u => /q=(kg|ml|of|an)\b/i.test(u)), 'units and stopwords never become search queries');
// 커뮤니티 화제글이 후보로 제시됨 (정치 글은 제외)
assert(botState.cands.some(c => c.src === 'community' && c.label.includes('LLM 추론')), 'community hot post offered as candidate');
assert(!botState.cands.some(c => c.label.includes('정청래')), 'political community post filtered out');
// 같은 사건이 두 엔진에서 오면 한 번만 (동일 제목이 중복 등장하지 않아야 함)
const newsLabels = botState.cands.filter(c => c.src === 'news').map(c => c.label);
assert(new Set(newsLabels).size === newsLabels.length, 'same story from two engines is deduped');
// 잡음/옛기사/무관 기사 제외
assert(!botState.cands.some(c => c.label.includes('refactor')), 'commit-style title filtered out');
assert(!botState.cands.some(c => c.label.includes('5년 전 회고')), 'stale article (pubDate) filtered out');
assert(!botState.cands.some(c => c.label.includes('무관한 지역 행사')), 'headline unrelated to the query filtered out');
// Hacker News 는 기술 블로그(tf)만, 그중 관련 글만
assert(botState.cands.some(c => c.src === 'hn' && c.label.includes('LLM')), 'relevant HN story included for tech blog');
assert(!botState.cands.some(c => c.label.includes('Sourdough')), 'irrelevant HN story filtered out');

// 22e. 키워드 선택 → 해당 주제로 dispatch
calls.length = 0; res = mockRes();
const picked = botState.cands[0];
await tgHook(cbUpdate('g:kw:0'), res);
const disp2 = calls.find(c => c.url.includes('/dispatches'));
assert(disp2 && disp2.body.inputs.topic === picked.topic, 'picked keyword is dispatched as topic');
assert(botState === null, 'state cleared after dispatch');

// 22f. 직접 입력 → 다음 메시지가 주제로 사용됨
await tgHook(cbUpdate('g:blog:mg'), mockRes());
calls.length = 0; res = mockRes();
await tgHook(cbUpdate('g:manual'), res);
assert(botState?.step === 'await_topic', 'manual step waits for topic');
calls.length = 0; res = mockRes();
await tgHook(tgMsg('여름 휴가 가성비 여행지'), res);
const disp3 = calls.find(c => c.url.includes('/dispatches'));
assert(disp3 && disp3.body.inputs.topic === '여름 휴가 가성비 여행지', 'manual topic dispatched');
// 뭉게는 콘텐츠 repo 가 없고 생성 워크플로만 ai-revenue-blog 에 있다(generatorRepo)
 assert(disp3.url.includes('ai-revenue-blog'), 'dispatched to the generator repo');

// 22g. 자동 선택 → 빈 주제로 dispatch
await tgHook(cbUpdate('g:blog:mg'), mockRes());
calls.length = 0; res = mockRes();
await tgHook(cbUpdate('g:auto'), res);
const disp4 = calls.find(c => c.url.includes('/dispatches'));
assert(disp4 && disp4.body.inputs.topic === '' && disp4.body.inputs.category === 'auto', 'auto dispatch uses empty topic');

// 22h. 비관리자 콜백 차단
calls.length = 0; res = mockRes();
await tgHook({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'testsecret' }, body: { callback_query: { id: 'cb2', data: 'g:blog:tf', message: { message_id: 1, chat: { id: 99999 } } } } }, res);
assert(!calls.some(c => c.url.includes('editMessageText')), 'non-admin callback rejected');

// 23. /deploy (VERCEL_TOKEN 없음) → 빈 커밋 폴백
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/deploy pc'), res);
assert(calls.some(c => c.url.includes('/git/refs/heads/master')), '/deploy falls back to empty commit when no VERCEL_TOKEN');

// 24. /status pc → Vercel 토큰 없이도 GitHub 배포 기록으로 상태 표시
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/status pc'), res);
out = sentTexts().join('\n');
assert(calls.some(c => /\/deployments/.test(c.url)), '/status reads deployment state from GitHub (no Vercel token needed)');
assert(out.includes('success') && out.includes('abc1234'), '/status shows deploy state and commit');

// 24b. /status mg → 배포 개념이 없다는 걸 밝히고, 생성 워크플로 상태는 보여준다.
//      /repos/null/... 을 찔러 "⚠️ 404" 로 찍히면 장애처럼 읽힌다.
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/status mg'), res);
out = sentTexts().join('\n');
assert(out.includes('WordPress 직접 운영'), '/status mg explains there is no deploy step');
assert(!/⚠️/.test(out), '/status mg does not surface a fake error');
assert(out.includes('자동생성'), '/status mg shows generator workflow run');

// 25. 알 수 없는 블로그 → 안내
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/posts nosuch'), res);
assert(sentTexts()[0].includes('❌'), 'unknown blog reports error');

// 26. /index pc → IndexNow 제출 (키·keyLocation·URL 목록)
//     뭉게는 indexNowKey 가 없어(WordPress 플러그인 소관) 이 경로 대상이 아니다.
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/index pc'), res);
const idx = calls.find(c => c.url.includes('api.indexnow.org'));
assert(idx, '/index submits to IndexNow');
assert(idx.body.host === 'virtual-in-playing.vercel.app' && idx.body.key && idx.body.keyLocation.endsWith('.txt'), 'IndexNow payload has host/key/keyLocation');
assert(idx.body.urlList.some(u => u.includes('/blog/2026-07-12-new-post/')), 'recent posts included in submission');
assert(sentTexts()[0].includes('색인 요청 완료'), '/index reports success');

// 26b. /index pc <slug> → 해당 글만
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/index pc 2026-07-12-new-post'), res);
const idx2 = calls.find(c => c.url.includes('api.indexnow.org'));
assert(idx2.body.urlList.length === 1 && idx2.body.urlList[0].includes('2026-07-12-new-post'), '/index with slug submits only that URL');

// 27. /money → 링크 없는 인기글 탐지. 뭉게 기준(GA4 인기글 × WP 본문)으로 재작성됨.
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/money'), res);
out = sentTexts().join('\n');
assert(out.includes('수익화 커버리지') && out.includes('뭉게'), '/money reports mungge coverage');
assert(!/life-revenue|ai-revenue-blog\.vercel/.test(out), '/money no longer points at dead TF/LF sites');

// ── 일일 리포트 ──
const { default: reportHook } = await import('../api/daily-report.js');

// 26. cron secret 불일치 → 401
res = mockRes();
await reportHook({ method: 'POST', headers: { authorization: 'Bearer wrong' } }, res);
assert(res.code === 401, 'daily-report rejects bad cron secret');

// 27. 정상 cron → 전날 종합 리포트 발송 (조회/방문자/댓글/좋아요/쿠팡)
calls.length = 0; res = mockRes();
await reportHook({ method: 'POST', headers: { authorization: 'Bearer croncron' } }, res);
out = sentTexts().join('\n');
assert(res.code === 200, 'daily-report returns 200');
assert(out.includes('일일 리포트') && out.includes('뭉게') && out.includes('조회수') && out.includes('방문자'), 'report covers mungge traffic');
assert(out.includes('상호작용') && out.includes('좋아요') && out.includes('쿠팡클릭') && out.includes('댓글'), 'report covers interactions');
assert(out.includes('뭉게독자') && out.includes('노트북 거치대'), 'report includes mungge WP comments and coupang products');
assert(!/레거시|TechFlow|LifeFlow/.test(out), 'report has no TF/LF legacy block');
// 유입 경로 (검색 유입 강조 — 네이버는 GA4 가 Referral 로 넣으므로 재분류돼야 한다)
assert(out.includes('유입 경로') && out.includes('네이버 검색') && out.includes('구글 검색') && out.includes('직접/북마크'), 'report breaks down referrers');
assert(out.includes('전체 글') && out.includes('196'), 'report shows WP post count');
// 오늘의 추천 주제 (커뮤니티 화제 → /generate 연결)
assert(out.includes('오늘의 추천 주제') && out.includes('/generate'), 'report suggests topics from community');

// 28. /report 명령도 같은 리포트
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/report'), res);
assert(sentTexts()[0].includes('일일 리포트'), '/report command works');

// ── 29. 사이트 피드백 목록/삭제 ──
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/feedback'), res);
let fbTexts = sentTexts();
assert(fbTexts[0].includes('사이트 피드백') && fbTexts[0].includes('전체 2건'), '/feedback shows header with total');
assert(fbTexts.length === 3, '/feedback sends one card per item');
assert(fbTexts[1].includes('#7') && fbTexts[1].includes('데이터오류') && fbTexts[1].includes('인덕대학교 — 웹툰만화학과'), 'card shows id, category, target');
assert(fbTexts[1].includes('&lt;b&gt;작년&lt;/b&gt;'), 'feedback message is HTML-escaped');
assert(fbTexts[1].includes('카드 뷰') && fbTexts[1].includes('표시 40개') && fbTexts[1].includes('검색 "인덕"') && fbTexts[1].includes('만화·웹툰'), 'card shows capture context');
assert(fbTexts[1].includes('📱 모바일'), 'card shows device from user agent');
let fbCards = calls.filter(c => c.url.includes('sendMessage') && c.body.reply_markup);
assert(fbCards.length === 2 && fbCards[0].body.reply_markup.inline_keyboard[0][0].callback_data === 'fb:del:7', 'each card has a delete button');

// 사이트 필터 + 개수 인자
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/feedback ipsi-archive 1'), res);
assert(sentTexts().length === 2, '/feedback <site> <n> limits results');

// 삭제는 확인 한 단계를 거친다 (즉시 지우지 않음)
calls.length = 0; res = mockRes();
await tgHook(cbUpdate('fb:del:7'), res);
let edit = calls.find(c => c.url.includes('editMessageText'));
assert(edit && edit.body.text.includes('정말 삭제할까요'), 'delete button asks for confirmation');
assert(edit.body.reply_markup.inline_keyboard[0].map(b => b.callback_data).join(',') === 'fb:ok:7,fb:no:7', 'confirm offers ok/cancel');
assert(feedbackRows.length === 2, 'nothing is deleted before confirming');

// 취소 → 원래 카드로 복귀
calls.length = 0; res = mockRes();
await tgHook(cbUpdate('fb:no:7'), res);
edit = calls.find(c => c.url.includes('editMessageText'));
assert(edit && !edit.body.text.includes('정말 삭제할까요') && edit.body.reply_markup.inline_keyboard[0][0].callback_data === 'fb:del:7', 'cancel restores the card');
assert(feedbackRows.length === 2, 'cancel keeps the row');

// 확정 삭제
calls.length = 0; res = mockRes();
await tgHook(cbUpdate('fb:ok:7'), res);
edit = calls.find(c => c.url.includes('editMessageText'));
assert(edit && edit.body.text.includes('삭제 완료'), 'confirmed delete reports success');
assert(feedbackRows.length === 1 && feedbackRows[0].id === 8, 'row is actually deleted');
assert(calls.some(c => c.url.includes('/rest/v1/site_feedback') && c.url.includes('id=eq.7')), 'delete hits supabase with the right id');

// 이미 지운 건 재삭제해도 안전
calls.length = 0; res = mockRes();
await tgHook(cbUpdate('fb:ok:7'), res);
edit = calls.find(c => c.url.includes('editMessageText'));
assert(edit && edit.body.text.includes('이미 삭제된'), 'deleting a gone row is handled');

// 빈 목록
calls.length = 0; res = mockRes();
feedbackRows = [];
await tgHook(tgMsg('/feedback'), res);
assert(sentTexts()[0].includes('등록된 피드백이 없습니다'), 'empty list is handled');

console.log('\nDONE');
