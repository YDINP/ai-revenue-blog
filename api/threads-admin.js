// 관리자/자동화 통합 트리거 (CRON_SECRET). Hobby 함수 12개 한도 절약용 통합.
//  ?action=post          body{text,topic?,linkUrl?}  → 즉석 발행
//  ?action=queue         body{text,topic?,linkUrl?,imageUrl?}  → draft 큐 저장
//  ?action=queue-update  body{id,text?,linkUrl?,imageUrl?}  → draft 내용 수정(제자리)
//  ?action=queue-schedule body{id,at?}  → 예약 시각 지정/변경(at 없으면 다음 골든슬롯 KST 08:00/23:00)
//  ?action=set-mode      body{mode:'auto'|'review',topic?}  → 계정 발행모드 전환(auto=크론 1일1개 자동발행)
//  ?action=find&q=&topic= → keyword_search 후보 카드 발송
//  ?action=reply-delete[&rid=N|&media=id]  → 대댓글 삭제(목록/삭제)
//  ?action=reply-list[&nodraft=1&limit=N]  → pending 댓글 조회 (로컬 러너 입력)
//  ?action=reply-reconcile → 앱에서 이미 답장한 pending 정리(중복 답글 방지)
//  ?action=reply-draft   body{id,draft}    → 초안 저장
//  ?action=reply-preview body{id,auto?}  → 발행 없이 텔레그램 카드만 미리보기
//  ?action=reply-send    body{id,text?,auto?} → 대댓글 발행(text 없으면 저장된 draft)
//  ?action=set-reply-mode body{mode:'auto'|'review',topic?,cap?} → 대댓글 자동화 전환
import { tgThreads as tg } from './_shared.js';
import { getPermalink, sb, publish, publishReply, insertPost, insertQueue, updateQueue, getAccounts, updateAccount, deleteMedia, updateReply, getReply, llmConfigured, getMyUsername, myAnsweredCommentIds } from './_threads.js';
import { findAndQueue, sendReply, threadsReplyCard, threadsAutoReplyCard, nextGoldenSlotUtc } from './_threads-bot.js';

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

    /* 예약 시각 재지정. 지금까지 예약은 텔레그램 인라인 버튼(thr:sched)으로만 가능했는데,
       그건 "다음 골든슬롯"으로만 잡히고 **이미 예약된 글을 옮길 방법이 없었다.**
       2026-08-03 밤 GitHub Actions 가 threads-cron 예약 실행을 두 번 연속 건너뛰어
       #20(8/3 22:00 KST)이 발행되지 못한 채 지나갔고, 그때 손으로 옮길 수단이 없었다.
       at 을 안 주면 다음 골든슬롯(KST 08:00/23:00)으로 잡는다. */
    if (action === 'queue-schedule') {
      const id = b.id || req.query?.id;
      if (!id) return res.status(400).json({ error: 'no id' });
      const row = (await sb(`threads_queue?id=eq.${id}&limit=1`))[0];
      if (!row) return res.status(404).json({ error: `queue #${id} not found` });
      if (row.status === 'published') return res.status(400).json({ error: 'already published' });
      const at = b.at || req.query?.at || nextGoldenSlotUtc();
      if (Number.isNaN(new Date(at).getTime())) return res.status(400).json({ error: 'bad at (ISO8601 필요)' });
      await sb(`threads_queue?id=eq.${id}`, { method: 'PATCH', body: { status: 'scheduled', scheduled_at: at, error: null } });
      const kst = new Date(new Date(at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
      return res.status(200).json({ ok: true, id: Number(id), scheduled_at: at, kst: kst + ' KST' });
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

      // ⚠️ 같은 글에 이미 내가 단 답글을 조회하는 경로(2026-07-31 추가).
      //   초안을 댓글 하나만 보고 쓰다 보니 같은 글 댓글창에서 페르소나가 자기모순을 냈다:
      //   한 댓글엔 "나도 27도 딱 그 세팅", 다른 댓글엔 "우리집도 그래(26/25도)".
      //   한 사람이 쓴 게 아니라는 티가 바로 난다 → 드래프터에게 자기 발언 이력을 준다.
      //   Threads API 엔 수정 엔드포인트가 없어 발행 후엔 못 고치므로, 나가기 전에 막아야 한다.
      //   신규 함수는 못 만든다(Hobby 12/12 만석) → 기존 액션에 파라미터로 얹는다.
      const sentRoot = String(req.query?.sentRoot || b.sentRoot || '').trim();
      if (sentRoot) {
        // ⚠️ 발송 표시는 status='sent' 다. sent_at 은 auto 발행 캡 계산용이라 항상 채워지지는 않아,
        //    sent_at 으로 거르면 방금 보낸 답글도 0건으로 나온다(실측).
        const prior = await sb(
          `threads_replies?root_media_id=eq.${encodeURIComponent(sentRoot)}&status=eq.sent` +
          `&select=id,comment_user,comment_text,draft,sent_at&order=id.desc&limit=20`
        );
        return res.status(200).json({ ok: true, count: prior.length, sent: prior });
      }

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

    // 앱에서 손으로 답장한 댓글이 pending으로 남아 있는 것을 정리한다(중복 답글 방지).
    // 크론이 수집 단계에서 막지만, 그 가드 이전에 쌓인 잔여분은 이걸로 청소한다.
    if (action === 'reply-reconcile') {
      const rows = await sb('threads_replies?status=eq.pending&select=id,account_id,root_media_id,comment_id,comment_user&order=id.asc&limit=200');
      const accounts = await getAccounts(false);
      const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
      const cache = new Map(); // account:root → Set(answered comment_id)
      const cleaned = [];
      for (const r of rows) {
        const acct = byId[r.account_id];
        if (!acct?.access_token) continue;
        const handle = await getMyUsername(acct).catch(() => '');
        if (!handle) continue;
        const key = `${r.account_id}:${r.root_media_id}`;
        if (!cache.has(key)) cache.set(key, await myAnsweredCommentIds(acct, r.root_media_id, handle).catch(() => new Set()));
        if (cache.get(key).has(r.comment_id)) {
          await updateReply(r.id, { status: 'ignored', error: 'already answered in app' });
          cleaned.push({ id: r.id, user: r.comment_user });
        }
      }
      return res.status(200).json({ ok: true, checked: rows.length, cleaned: cleaned.length, rows: cleaned });
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

    // 발행 없이 텔레그램 카드만 보내본다 — 카드 문구/버튼/링크 확인용.
    // ⚠️ Threads 에는 아무것도 쓰지 않는다. 실제 발행은 reply-send 다.
    // Graph API 읽기 전용 진단 — "이 엔드포인트/필드가 되나?" 확인용.
    // ?action=probe&path=<id 또는 id/replies>&fields=a,b&topic=life
    // ⚠️ GET 만 한다. 남의 글에 접근 가능한지 등을 실측으로 판정하는 데 쓴다.
    if (action === 'probe') {
      const path = String(req.query?.path || b.path || '').replace(/^\/+/, '');
      if (!path) return res.status(400).json({ error: 'need path' });
      const topic = req.query?.topic || b.topic || 'life';
      const acct = (await sb(`threads_accounts?topic=eq.${encodeURIComponent(topic)}&active=eq.true&limit=1`))[0];
      if (!acct?.access_token) return res.status(400).json({ error: `no token for ${topic}` });
      const url = new URL(`https://graph.threads.net/v1.0/${path}`);
      const fields = req.query?.fields || b.fields;
      if (fields) url.searchParams.set('fields', String(fields));
      url.searchParams.set('access_token', acct.access_token);
      const r = await fetch(url);
      const j = await r.json().catch(() => null);
      return res.status(200).json({ ok: r.ok, status: r.status, data: j });
    }

    if (action === 'reply-preview') {
      const id = Number(b.id || req.query?.id);
      if (!id) return res.status(400).json({ error: 'need id' });
      const row = await getReply(id);
      if (!row) return res.status(404).json({ error: 'reply row not found' });
      const asAuto = b.auto === true || req.query?.auto === '1';
      const account = (await sb(`threads_accounts?id=eq.${row.account_id}&limit=1`))[0];
      const permalink = await getPermalink(account, row.root_media_id).catch(() => '');
      const card = asAuto
        ? threadsAutoReplyCard(row, { permalink })
        : threadsReplyCard({ ...row, permalink });
      const r = await tg('sendMessage', {
        chat_id: chatId, text: card.text,
        parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: card.reply_markup,
      });
      return res.status(200).json({ ok: !!r?.ok, id, kind: asAuto ? 'auto' : 'notify', hasLink: !!permalink });
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
      error: 'unknown action — post | queue | queue-update | set-mode | find | reply-delete | reply-list | reply-reconcile | reply-draft | reply-preview | reply-send | set-reply-mode',
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
