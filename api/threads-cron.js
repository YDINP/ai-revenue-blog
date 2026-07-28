// Threads Cron — 예약/자동 발행 + 토큰 갱신 + 인사이트 동기화 + 댓글 수집/자동 대댓글
// Vercel Cron이 Authorization: Bearer CRON_SECRET 로 호출. (GH Actions cron으로 더 자주 핑도 가능)
//
// ?only=replies → 댓글 섹션만 (15분 주기 threads-replies.yml 용)
// ?only=posts   → 발행·토큰·인사이트만
// 없으면 전체 (기존 동작)
// Hobby 서버리스 함수 12/12 만석이라 답글 전용 엔드포인트를 새로 못 만든다 → 쿼리 파라미터로 분기.
import { sendToAdmin, tg, escapeHtml } from './_shared.js';
import {
  sb, getAccounts, publishDraft, refreshLongLived, updateAccount,
  getInsights, publishedCount24h,
  getReplies, insertReply, replyExists, draftReply, getMyRecentMedia,
  autoRepliesSent24h, pendingRepliesForRoot, getMyUsername,
} from './_threads.js';
import { threadsReplyCard, sendReply } from './_threads-bot.js';

const AUTO_DAILY_CAP = 3;      // 자동모드 계정당 24h 최대 발행(스팸 방지)
const UNANSWERED_CAP = 20;     // 원글 1개당 pending 상한 — 바이럴 글에서 수집 폭주 방지
const REPLY_DAILY_CAP = 20;    // 계정 reply_daily_cap 미설정 시 기본값

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const only = String(req.query?.only || '');
  const doPosts = only !== 'replies';
  const doReplies = only !== 'posts';

  const log = { only: only || 'all', scheduled: 0, auto: 0, refreshed: 0, insights: 0, errors: [] };
  const now = new Date().toISOString();
  // 무엇이 나갔는지 남긴다 — 건수만 알리면 "뭐가 발행됐지?" 를 확인하러 앱을 열어야 한다.
  const posted = [];
  const note = (row) => posted.push({ id: row.id, text: String(row.text || '').split('\n')[0], link: row.link_url || '' });

  // ── 1) 예약 발행 (scheduled_at 도래) ──
  if (doPosts) try {
    const due = await sb(`threads_queue?status=eq.scheduled&scheduled_at=lte.${now}&select=*&order=scheduled_at&limit=20`);
    for (const row of due) {
      const acct = (await sb(`threads_accounts?id=eq.${row.account_id}&limit=1`))[0];
      if (!acct?.access_token) continue;
      try { await publishDraft(acct, row); log.scheduled++; note(row); }
      catch (e) { await sb(`threads_queue?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'failed', error: e.message } }); log.errors.push(`sched#${row.id}:${e.message}`); }
    }
  } catch (e) { log.errors.push(`scheduled:${e.message}`); }

  // ── 2) 자동 모드: 계정당 오래된 draft 1개 발행 (24h 캡 준수) ──
  if (doPosts) try {
    const autos = (await getAccounts(true)).filter((a) => a.publish_mode === 'auto');
    for (const a of autos) {
      if ((await publishedCount24h(a.id)) >= AUTO_DAILY_CAP) continue;
      const drafts = await sb(`threads_queue?status=eq.draft&account_id=eq.${a.id}&select=*&order=id&limit=1`);
      if (!drafts.length) continue;
      try { await publishDraft(a, drafts[0]); log.auto++; note(drafts[0]); }
      catch (e) { await sb(`threads_queue?id=eq.${drafts[0].id}`, { method: 'PATCH', body: { status: 'failed', error: e.message } }); log.errors.push(`auto#${drafts[0].id}:${e.message}`); }
    }
  } catch (e) { log.errors.push(`auto:${e.message}`); }

  // ── 3) 토큰 갱신 (만료 7일 이내) ──
  if (doPosts) try {
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
  if (doPosts) try {
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

  // ── 5) 댓글: 내 계정 최근 글(48h, 수동 발행 포함) 새 댓글 수집 → AI 초안 →
  //         reply_mode='auto' + 초안 있음 → 즉시 발행 / 그 외 → 텔레그램 승인카드 ──
  //
  // ⚠️ 초안이 없으면 auto라도 절대 발행하지 않는다. 서버에 LLM 크레덴셜이 없으면 draftReply()가
  //    ''를 반환하므로, 그 상태에서 auto를 켜도 "빈 답글 발행"이 아니라 승인카드로 폴백된다.
  log.replies = 0;
  log.autoReplies = 0;
  const autoSent = [];
  if (doReplies) try {
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const cutoff = Date.now() - 48 * 3600 * 1000;
    const CAP = 10; // 런당 새 댓글 처리 상한(폭주 방지)
    outer: for (const acct of await getAccounts(true)) {
      if (!acct.access_token || !acct.threads_user_id) continue;
      // 자동발행 예산 — 24h 캡에서 이미 나간 자동답글을 뺀 나머지. review 모드면 0.
      let autoBudget = 0;
      if (acct.reply_mode === 'auto') {
        const cap = acct.reply_daily_cap ?? REPLY_DAILY_CAP;
        autoBudget = Math.max(0, cap - (await autoRepliesSent24h(acct.id).catch(() => cap)));
      }
      const myHandle = await getMyUsername(acct).catch(() => '');
      let media = [];
      try { media = await getMyRecentMedia(acct, 25); }
      catch (e) { log.errors.push(`media#${acct.id}:${e.message}`); continue; }
      for (const p of media) {
        if (p.timestamp && new Date(p.timestamp).getTime() < cutoff) continue; // 48h 지난 글 skip
        // 이 글에 미답변이 이미 쌓여 있으면 더 수집하지 않는다(autoTHREADS의 20 룰).
        if ((await pendingRepliesForRoot(p.id).catch(() => 0)) >= UNANSWERED_CAP) continue;
        let replies = [];
        try { replies = await getReplies(acct, p.id); }
        catch (e) { log.errors.push(`replies#${p.id}:${e.message}`); continue; }
        for (const c of replies) {
          if (!c.id) continue;
          // 내가 쓴 댓글에 내가 답하는 루프 차단 (reply_media_id 체크와 이중 방어)
          if (myHandle && String(c.username || '').toLowerCase() === myHandle) continue;
          if (await replyExists(c.id)) continue; // 이미 수집됐거나 내가 보낸 대댓글
          const draft = await draftReply(c.text, {}).catch(() => '');
          let row;
          try {
            row = await insertReply({
              account_id: acct.id, root_media_id: p.id, comment_id: c.id,
              comment_text: c.text || '', comment_user: c.username || '', draft: draft || null,
            });
          } catch { continue; } // comment_id unique 충돌 = 동시성으로 이미 삽입됨
          log.replies++;

          // 자동 발행 경로
          if (row && draft && autoBudget > 0) {
            const r = await sendReply(row.id, draft, { auto: true }).catch((e) => ({ ok: false, error: e.message }));
            if (r?.ok) {
              autoBudget--;
              log.autoReplies++;
              autoSent.push({ id: row.id, user: c.username || '?', comment: c.text || '', reply: draft });
              if (log.replies >= CAP) break outer;
              continue;
            }
            log.errors.push(`autoreply#${row.id}:${r?.error || 'failed'}`);
            // 실패분은 아래 승인카드로 흘려보낸다 — 조용히 사라지는 게 제일 나쁘다.
          }

          if (chatId && row) {
            const card = threadsReplyCard(row);
            await tg('sendMessage', {
              chat_id: chatId, text: card.text, parse_mode: 'HTML',
              disable_web_page_preview: true, reply_markup: card.reply_markup,
            }).catch(() => {});
          }
          if (log.replies >= CAP) break outer;
        }
      }
    }
  } catch (e) { log.errors.push(`replies:${e.message}`); }

  // 다음 예정 1건 — 핫타임 알림을 껐으니 "다음에 뭐가 나가는지"를 알려줄 창구가 여기뿐이다.
  let next = null;
  if (doPosts) try {
    const p = await sb(`threads_queue?status=eq.scheduled&select=id,text,scheduled_at&order=scheduled_at.asc&limit=1`);
    if (p.length) next = p[0];
  } catch (e) { log.errors.push(`next:${e.message}`); }
  log.posted = posted.map((p) => p.id);
  log.next = next ? { id: next.id, at: next.scheduled_at } : null;

  const kst = (iso) =>
    new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

  // 15분 주기(only=replies)는 대부분 "새 댓글 0"이다 → 그때는 조용히 넘긴다.
  // 자동발행분은 승인카드가 안 가므로 여기서 사후 보고하지 않으면 뭐가 나갔는지 알 방법이 없다.
  if (log.scheduled || log.auto || log.replies || log.autoReplies || log.errors.length) {
    const lines = [
      `🧵 Threads Cron${only ? ` (${only})` : ''}`,
      doPosts
        ? `예약발행 ${log.scheduled} · 자동발행 ${log.auto} · 토큰갱신 ${log.refreshed} · 인사이트 ${log.insights} · 새댓글 ${log.replies} · 자동답글 ${log.autoReplies}`
        : `새댓글 ${log.replies} · 자동답글 ${log.autoReplies}`,
    ];
    for (const p of posted) {
      lines.push(`\n📤 <b>#${p.id}</b> ${escapeHtml(cut(p.text, 60))}`);
      if (p.link) lines.push(`   ${escapeHtml(p.link.split('?')[0])}`);
    }
    for (const a of autoSent) {
      lines.push(`\n🤖 <b>자동답글 #${a.id}</b> @${escapeHtml(a.user)}`);
      lines.push(`   💬 ${escapeHtml(cut(a.comment, 70))}`);
      lines.push(`   ↳ ${escapeHtml(cut(a.reply, 70))}`);
    }
    if (next) lines.push(`\n🗓 다음: <b>#${next.id}</b> ${escapeHtml(kst(next.scheduled_at))}\n   ${escapeHtml(cut(String(next.text || '').split('\n')[0], 60))}`);
    if (log.errors.length) lines.push(`\n⚠️ ${escapeHtml(log.errors.slice(0, 5).join(' / '))}`);
    await sendToAdmin(lines.join('\n')).catch(() => {});
  }
  return res.status(200).json({ ok: true, ...log });
}
