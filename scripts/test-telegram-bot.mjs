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

console.log('\nDONE');
