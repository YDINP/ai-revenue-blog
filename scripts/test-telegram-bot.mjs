// 스모크 테스트: fetch 모킹 후 두 핸들러의 주요 플로우 검증. 실행: node scripts/test-telegram-bot.mjs
process.env.WEBHOOK_SECRET = 'testsecret';
process.env.TELEGRAM_BOT_TOKEN = 'TESTTOKEN';
process.env.TELEGRAM_ADMIN_CHAT_ID = '11111';
process.env.COMMENT_ADMIN_KEY = 'testadminkey';

const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
  if (url.includes('api.telegram.org')) return { json: async () => ({ ok: true }) };
  if (url.includes('/rest/v1/comments?')) {
    return { json: async () => [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', post_slug: 'my-post', source: 'blog', nickname: '홍길동', content: '질문요' }] };
  }
  if (url.includes('/rpc/admin_reply')) return { status: 200, json: async () => ({ success: true, id: 'new-id' }) };
  if (url.includes('/rpc/admin_delete_comment')) return { status: 200, json: async () => ({ success: true, deleted: 2 }) };
  // ── 대시보드 조회 RPC 모킹 ──
  if (url.includes('/rpc/get_traffic_summary')) return { status: 200, json: async () => ({ today_views: 123, yesterday_views: 98, today_clicks: 5, total_clicks: 321, today_likes: 2, total_likes: 45, total_subscribers: 12, today_subscribers: 1, total_views: 12345, tf_today_views: 80, lf_today_views: 43, tf_today_clicks: 3, lf_today_clicks: 2, tf_total_views: 8000, lf_total_views: 4345, tf_total_clicks: 200, lf_total_clicks: 121 }) };
  if (url.includes('/rpc/get_comment_stats')) return { status: 200, json: async () => ({ total: 57, today: 3, reports: 1, blog_count: 40, lifeflow_count: 17 }) };
  if (url.includes('/rpc/get_top_pages')) return { status: 200, json: async () => [{ path: '/blog/hot-post/', slug: 'hot-post', title: '인기글 | TechFlow - AI', source: 'blog', views: 99 }, { path: '/blog/lf-post/', slug: 'lf-post', title: 'LF글 | LifeFlow', source: 'lifeflow', views: 55 }] };
  if (url.includes('/rpc/get_all_comments')) return { status: 200, json: async () => [
    { id: '11111111-2222-3333-4444-555555555555', post_slug: 'p1', source: 'blog', nickname: 'A', content: 'c1', parent_id: null, is_admin: false, created_at: new Date().toISOString(), report_count: 0 },
    { id: '66666666-7777-8888-9999-000000000000', post_slug: 'p2', source: 'lifeflow', nickname: 'B', content: 'c2', parent_id: null, is_admin: false, created_at: new Date().toISOString(), report_count: 1 },
  ] };
  if (url.includes('/rpc/get_daily_trend')) return { status: 200, json: async () => [{ day: '2026-07-10', views: 10 }, { day: '2026-07-11', views: 20 }] };
  if (url.includes('/rpc/get_comment_trend')) return { status: 200, json: async () => [{ day: '2026-07-11', count: 3, blog_count: 2, lf_count: 1 }] };
  if (url.includes('/rpc/get_top_liked_posts')) return { status: 200, json: async () => [{ title: '좋아요글 | TechFlow', slug: 'liked', like_count: 7 }] };
  if (url.includes('/rpc/get_recent_events')) return { status: 200, json: async () => [{ event_type: 'pageview', source: 'blog', created_at: new Date().toISOString(), metadata: { title: '이벤트글 | TechFlow', slug: 'ev' } }] };
  if (url.includes('/rest/v1/analytics?')) return { ok: true, json: async () => [
    { event_type: 'coupang_click', source: 'blog', created_at: new Date().toISOString(), metadata: { product: '노트북 거치대', url: 'https://link.coupang.com/a/x', slug: 'my-post', title: '내글 | TechFlow' } },
    { event_type: 'affiliate_click', source: 'lifeflow', created_at: new Date().toISOString(), metadata: { target: 'coupang', label: '무선 청소기', href: 'https://link.coupang.com/a/y', slug: 'lf-post' } },
  ] };
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
  body: { type: 'INSERT', table: 'comments', record: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', post_slug: 'my-post', source: 'blog', nickname: '홍길동', content: '<b>질문</b>요', is_admin: false, parent_id: null } },
}, res);
const sent = calls.find(c => c.url.includes('sendMessage'));
assert(res.code === 200 && res.body.ok === true, 'comment-webhook 200 ok');
assert(sent && sent.body.chat_id === '11111', 'notification goes to admin chat');
assert(sent.body.text.includes('#c_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), 'notification contains #c_ marker');
assert(sent.body.text.includes('&lt;b&gt;질문&lt;/b&gt;요'), 'content is HTML-escaped');
assert(sent.body.text.includes('https://ai-revenue-blog.vercel.app/blog/my-post/'), 'notification links to post');

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
assert(rpc && rpc.body.p_parent_id === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' && rpc.body.p_slug === 'my-post' && rpc.body.p_source === 'blog' && rpc.body.p_admin_key === 'testadminkey', 'admin_reply params correct');
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
assert(out.includes('전체 요약') && out.includes('123') && out.includes('321'), '/stats shows traffic summary');
assert(out.includes('57'), '/stats includes comment stats');

// 10. /tf → 소스별 요약, 해당 소스 인기 페이지만
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/tf'), res);
out = sentTexts().join('\n');
assert(out.includes('TechFlow') && out.includes('인기글'), '/tf shows TF summary with top pages');
assert(!out.includes('LF글'), '/tf excludes lifeflow pages');

// 11. /top 5 → 소스 배지 + 사이트명 제거된 제목
calls.length = 0; res = mockRes();
await tgHook(tgMsg('/top 5'), res);
out = sentTexts().join('\n');
assert(out.includes('인기 페이지') && out.includes('[TF] 인기글') && out.includes('[LF] LF글'), '/top lists pages with source badge');

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

console.log('\nDONE');
