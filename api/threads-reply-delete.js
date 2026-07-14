// Threads 글/대댓글 삭제 (관리자용). CRON_SECRET 보호.
//  GET  ?               → 최근 발행 대댓글(status=sent) 목록 (id·media·내용)
//  GET  ?rid=N          → threads_replies #N 의 대댓글 삭제 + 행 status=deleted
//  GET  ?media=<id>[&topic=life] → media id 직접 삭제
import { sb, getAccounts, deleteMedia } from './_threads.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const rid = req.query?.rid;
  const media = req.query?.media;
  const topic = req.query?.topic || 'life';

  // 목록 모드
  if (!rid && !media) {
    const rows = await sb(
      'threads_replies?status=eq.sent&select=id,reply_media_id,comment_user,comment_text,created_at&order=id.desc&limit=20'
    );
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
  if (!mediaId) return res.status(400).json({ error: 'no reply_media_id on row' });
  if (!account?.access_token) return res.status(400).json({ error: 'no account token' });

  try {
    const out = await deleteMedia(account, mediaId);
    if (row) await sb(`threads_replies?id=eq.${row.id}`, { method: 'PATCH', body: { status: 'deleted' } });
    return res.status(200).json({ ok: true, deleted: mediaId, result: out });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
