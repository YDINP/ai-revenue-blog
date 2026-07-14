// Threads Cron — 예약/자동 발행 + 토큰 갱신 + 인사이트 동기화
// Vercel Cron이 Authorization: Bearer CRON_SECRET 로 호출. (GH Actions cron으로 더 자주 핑도 가능)
import { sendToAdmin, tg } from './_shared.js';
import {
  sb, getAccounts, publishDraft, refreshLongLived, updateAccount,
  getInsights, publishedCount24h,
  getReplies, insertReply, replyExists, draftReply,
} from './_threads.js';
import { threadsReplyCard } from './_threads-bot.js';

const AUTO_DAILY_CAP = 3; // 자동모드 계정당 24h 최대 발행(스팸 방지)

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const log = { scheduled: 0, auto: 0, refreshed: 0, insights: 0, errors: [] };
  const now = new Date().toISOString();

  // ── 1) 예약 발행 (scheduled_at 도래) ──
  try {
    const due = await sb(`threads_queue?status=eq.scheduled&scheduled_at=lte.${now}&select=*&order=scheduled_at&limit=20`);
    for (const row of due) {
      const acct = (await sb(`threads_accounts?id=eq.${row.account_id}&limit=1`))[0];
      if (!acct?.access_token) continue;
      try { await publishDraft(acct, row); log.scheduled++; }
      catch (e) { await sb(`threads_queue?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'failed', error: e.message } }); log.errors.push(`sched#${row.id}:${e.message}`); }
    }
  } catch (e) { log.errors.push(`scheduled:${e.message}`); }

  // ── 2) 자동 모드: 계정당 오래된 draft 1개 발행 (24h 캡 준수) ──
  try {
    const autos = (await getAccounts(true)).filter((a) => a.publish_mode === 'auto');
    for (const a of autos) {
      if ((await publishedCount24h(a.id)) >= AUTO_DAILY_CAP) continue;
      const drafts = await sb(`threads_queue?status=eq.draft&account_id=eq.${a.id}&select=*&order=id&limit=1`);
      if (!drafts.length) continue;
      try { await publishDraft(a, drafts[0]); log.auto++; }
      catch (e) { await sb(`threads_queue?id=eq.${drafts[0].id}`, { method: 'PATCH', body: { status: 'failed', error: e.message } }); log.errors.push(`auto#${drafts[0].id}:${e.message}`); }
    }
  } catch (e) { log.errors.push(`auto:${e.message}`); }

  // ── 3) 토큰 갱신 (만료 7일 이내) ──
  try {
    const soon = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const expiring = await sb(`threads_accounts?active=eq.true&token_expires_at=lte.${soon}&select=id,access_token`);
    for (const a of expiring) {
      try {
        const r = await refreshLongLived(a.access_token);
        await updateAccount(a.id, {
          access_token: r.access_token,
          token_expires_at: new Date(Date.now() + (r.expires_in || 5184000) * 1000).toISOString(),
        });
        log.refreshed++;
      } catch (e) { log.errors.push(`refresh#${a.id}:${e.message}`); }
    }
  } catch (e) { log.errors.push(`refresh:${e.message}`); }

  // ── 4) 인사이트 동기화 (최근 7일 발행분) ──
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const posts = await sb(`threads_posts?published_at=gte.${since}&threads_media_id=not.is.null&select=id,account_id,threads_media_id&limit=50`);
    const tokenById = {};
    for (const a of await getAccounts(false)) tokenById[a.id] = a.access_token;
    for (const p of posts) {
      const token = tokenById[p.account_id];
      if (!token) continue;
      const ins = await getInsights(p.threads_media_id, token);
      if (ins) {
        await sb(`threads_posts?id=eq.${p.id}`, {
          method: 'PATCH',
          body: {
            views: ins.views || 0, likes: ins.likes || 0, replies: ins.replies || 0,
            reposts: ins.reposts || 0, shares: ins.shares || 0, insights_synced_at: now,
          },
        });
        log.insights++;
      }
    }
  } catch (e) { log.errors.push(`insights:${e.message}`); }

  // ── 5) 댓글 반자동: 최근 48h 내 글의 새 댓글 → AI 초안 → 텔레그램 승인카드 ──
  log.replies = 0;
  try {
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const rSince = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const myPosts = await sb(`threads_posts?published_at=gte.${rSince}&threads_media_id=not.is.null&select=account_id,threads_media_id&limit=30`);
    const acctById = {};
    for (const a of await getAccounts(false)) acctById[a.id] = a;
    const CAP = 10; // 런당 새 댓글 처리 상한(폭주 방지)
    outer: for (const p of myPosts) {
      const acct = acctById[p.account_id];
      if (!acct?.access_token) continue;
      let replies = [];
      try { replies = await getReplies(acct, p.threads_media_id); }
      catch (e) { log.errors.push(`replies#${p.threads_media_id}:${e.message}`); continue; }
      for (const c of replies) {
        if (!c.id) continue;
        if (acct.username && c.username === acct.username) continue; // 내 답글 제외
        if (await replyExists(c.id)) continue;                       // 이미 수집됨
        const draft = await draftReply(c.text, { postText: p.text }).catch(() => '');
        let row;
        try {
          row = await insertReply({
            account_id: acct.id, root_media_id: p.threads_media_id, comment_id: c.id,
            comment_text: c.text || '', comment_user: c.username || '', draft: draft || null,
          });
        } catch { continue; } // comment_id unique 충돌 = 동시성으로 이미 삽입됨
        if (chatId && row) {
          const card = threadsReplyCard(row);
          await tg('sendMessage', {
            chat_id: chatId, text: card.text, parse_mode: 'HTML',
            disable_web_page_preview: true, reply_markup: card.reply_markup,
          }).catch(() => {});
        }
        log.replies++;
        if (log.replies >= CAP) break outer;
      }
    }
  } catch (e) { log.errors.push(`replies:${e.message}`); }

  if (log.scheduled || log.auto || log.replies || log.errors.length) {
    await sendToAdmin(
      `🧵 Threads Cron\n예약발행 ${log.scheduled} · 자동발행 ${log.auto} · 토큰갱신 ${log.refreshed} · 인사이트 ${log.insights} · 새댓글 ${log.replies}` +
        (log.errors.length ? `\n⚠️ ${log.errors.slice(0, 5).join(' / ')}` : '')
    ).catch(() => {});
  }
  return res.status(200).json({ ok: true, ...log });
}
