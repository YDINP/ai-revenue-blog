// 관리자/자동화 통합 트리거 (CRON_SECRET). Hobby 함수 12개 한도 절약용 통합.
//  ?action=post          body{text,topic?,linkUrl?}  → 즉석 발행
//  ?action=queue         body{text,topic?,linkUrl?,imageUrl?}  → draft 큐 저장
//  ?action=queue-update  body{id,text?,linkUrl?,imageUrl?}  → draft 내용 수정(제자리)
//  ?action=set-mode      body{mode:'auto'|'review',topic?}  → 계정 발행모드 전환(auto=크론 1일1개 자동발행)
//  ?action=find&q=&topic= → keyword_search 후보 카드 발송
//  ?action=reply-delete[&rid=N|&media=id]  → 대댓글 삭제(목록/삭제)
//  ?action=reply-list[&nodraft=1&limit=N]  → pending 댓글 조회 (로컬 러너 입력)
//  ?action=reply-draft   body{id,draft}    → 초안 저장
//  ?action=reply-send    body{id,text?,auto?} → 대댓글 발행(text 없으면 저장된 draft)
//  ?action=set-reply-mode body{mode:'auto'|'review',topic?,cap?} → 대댓글 자동화 전환
import { sb, publish, publishReply, insertPost, insertQueue, updateQueue, getAccounts, updateAccount, deleteMedia, updateReply, getReply, llmConfigured } from './_threads.js';
import { findAndQueue, sendReply } from './_threads-bot.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const b = req.body || {};
  const action = req.query?.action || b.action;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  try {
    if (action === 'post') {
      const topic = b.topic || req.query?.topic || 'life';
      const text = (b.text || req.query?.text || '').trim();
      const linkUrl = b.linkUrl || req.query?.linkUrl || '';
      if (!text) return res.status(400).json({ error: 'no text' });
      const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
      if (!acct?.access_token) return res.status(400).json({ error: `no token for ${topic}` });
      const mediaId = await publish(acct, { text });
      if (linkUrl) await publishReply(acct, { text: `전문 👇\n${linkUrl}`, replyToId: mediaId }).catch(() => {});
      await insertPost({ account_id: acct.id, threads_media_id: mediaId }).catch(() => {});
      await sb(`threads_accounts?id=eq.${acct.id}`, { method: 'PATCH', body: { hottime_started_at: null } }).catch(() => {});
      return res.status(200).json({ ok: true, mediaId });
    }

    if (action === 'queue') {
      const topic = b.topic || req.query?.topic || 'life';
      const text = (b.text || '').trim();
      if (!text) return res.status(400).json({ error: 'no text' });
      const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
      if (!acct) return res.status(400).json({ error: `no account for ${topic}` });
      const row = await insertQueue({
        account_id: acct.id, text,
        image_url: b.imageUrl || null,
        link_url: b.linkUrl || null,
        link_kind: b.linkUrl ? 'blog' : 'none',
        status: 'draft',
      });
      return res.status(200).json({ ok: true, id: row.id });
    }

    if (action === 'queue-update') {
      const id = b.id || req.query?.id;
      if (!id) return res.status(400).json({ error: 'no id' });
      const patch = {};
      if (typeof b.text === 'string') patch.text = b.text;
      if (typeof b.imageUrl === 'string') patch.image_url = b.imageUrl;
      if (typeof b.linkUrl === 'string') { patch.link_url = b.linkUrl; patch.link_kind = 'blog'; }
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to update' });
      const row = await updateQueue(Number(id), patch);
      return res.status(200).json({ ok: true, id: row?.id, status: row?.status });
    }

    if (action === 'set-mode') {
      const topic = b.topic || req.query?.topic || 'life';
      const mode = b.mode || req.query?.mode;
      if (!['auto', 'review'].includes(mode)) return res.status(400).json({ error: 'mode must be auto|review' });
      const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
      if (!acct) return res.status(400).json({ error: `no account for ${topic}` });
      await updateAccount(acct.id, { publish_mode: mode });
      return res.status(200).json({ ok: true, account: acct.id, topic, publish_mode: mode });
    }

    if (action === 'find') {
      const q = req.query?.q || b.q || '';
      const topic = req.query?.topic || b.topic || 'life';
      const summary = await findAndQueue(q, chatId, topic);
      return res.status(200).json({ ok: true, summary });
    }

    if (action === 'reply-delete') {
      const rid = req.query?.rid;
      const media = req.query?.media;
      const topic = req.query?.topic || 'life';
      if (!rid && !media) {
        const rows = await sb('threads_replies?status=eq.sent&select=id,reply_media_id,comment_user,comment_text,created_at&order=id.desc&limit=20');
        return res.status(200).json({ sent: rows });
      }
      const accounts = await getAccounts(false);
      let account, mediaId, row;
      if (rid) {
        row = (await sb(`threads_replies?id=eq.${Number(rid)}&select=*`))[0];
        if (!row) return res.status(404).json({ error: 'reply row not found' });
        mediaId = row.reply_media_id;
        account = accounts.find((a) => a.id === row.account_id);
      } else {
        mediaId = media;
        account = accounts.find((a) => a.topic === topic) || accounts[0];
      }
      if (!mediaId) return res.status(400).json({ error: 'no reply_media_id' });
      if (!account?.access_token) return res.status(400).json({ error: 'no token' });
      const out = await deleteMedia(account, mediaId);
      if (row) await sb(`threads_replies?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'deleted' } });
      return res.status(200).json({ ok: true, deleted: mediaId, result: out });
    }

    // ── 자동 대댓글: 로컬 러너(automation/threads-reply-run.mjs)용 3종 ──
    // 서버에 LLM 크레덴셜이 없는 동안 초안을 채우는 경로. 키가 생기면 크론이 직접 채우므로
    // 이 액션들은 수동 점검·재시도용으로 남는다.
    if (action === 'reply-list') {
      const limit = Math.min(Number(req.query?.limit || b.limit || 20), 100);
      const nodraft = req.query?.nodraft === '1' || b.nodraft === true;
      const rows = await sb(
        `threads_replies?status=eq.pending${nodraft ? '&draft=is.null' : ''}` +
        `&select=id,account_id,root_media_id,comment_id,comment_text,comment_user,draft,created_at` +
        `&order=id.asc&limit=${limit}`
      );
      const accounts = await getAccounts(false);
      const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
      // 내가 쓴 댓글(발행 시 자동으로 다는 "전문 👇" 링크 첫 댓글 포함)은 초안 대상이 아니다.
      // 2026-07-29 실측: pending 25건 중 17건이 내 링크 댓글이었다.
      const out = rows.filter((r) => {
        const h = String(byId[r.account_id]?.handle || '').replace(/^@/, '').toLowerCase();
        return !(h && String(r.comment_user || '').toLowerCase() === h);
      });
      return res.status(200).json({
        ok: true, llm: llmConfigured(), count: out.length, skippedSelf: rows.length - out.length,
        pending: out.map((r) => ({
          ...r, topic: byId[r.account_id]?.topic, reply_mode: byId[r.account_id]?.reply_mode || 'review',
        })),
      });
    }

    if (action === 'reply-draft') {
      const id = Number(b.id || req.query?.id);
      const draft = String(b.draft || '').trim();
      if (!id || !draft) return res.status(400).json({ error: 'need id + draft' });
      const row = await getReply(id);
      if (!row) return res.status(404).json({ error: 'reply row not found' });
      if (row.status !== 'pending') return res.status(409).json({ error: `already ${row.status}` });
      await updateReply(id, { draft });
      return res.status(200).json({ ok: true, id, draft });
    }

    if (action === 'reply-send') {
      const id = Number(b.id || req.query?.id);
      if (!id) return res.status(400).json({ error: 'need id' });
      const row = await getReply(id);
      if (!row) return res.status(404).json({ error: 'reply row not found' });
      if (row.status !== 'pending') return res.status(409).json({ error: `already ${row.status}` });
      const text = String(b.text || row.draft || '').trim();
      if (!text) return res.status(400).json({ error: 'no text and no draft' });
      const auto = b.auto === true || req.query?.auto === '1';
      const r = await sendReply(id, text, { auto });
      return res.status(r.ok ? 200 : 500).json({ ok: !!r.ok, id, mediaId: r.mediaId, message: r.text, error: r.error });
    }

    if (action === 'set-reply-mode') {
      const topic = b.topic || req.query?.topic || 'life';
      const mode = b.mode || req.query?.mode;
      if (!['auto', 'review'].includes(mode)) return res.status(400).json({ error: 'mode must be auto|review' });
      const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
      if (!acct) return res.status(400).json({ error: `no account for ${topic}` });
      const patch = { reply_mode: mode };
      const cap = Number(b.cap || req.query?.cap || 0);
      if (cap > 0) patch.reply_daily_cap = cap;
      const out = await updateAccount(acct.id, patch);
      // auto인데 서버에 LLM이 없으면 초안이 안 생겨 승인카드로 폴백된다 → 오해 방지용 경고.
      return res.status(200).json({
        ok: true, account: acct.id, topic, reply_mode: out?.reply_mode, reply_daily_cap: out?.reply_daily_cap,
        warning: mode === 'auto' && !llmConfigured()
          ? '서버에 LLM 크레덴셜 없음 → 크론은 초안을 못 만들고 승인카드로 폴백된다. 초안은 로컬 러너(automation/threads-reply-run.mjs)가 채워야 자동발행된다.'
          : undefined,
      });
    }

    return res.status(400).json({
      error: 'unknown action — post | queue | queue-update | set-mode | find | reply-delete | reply-list | reply-draft | reply-send | set-reply-mode',
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
