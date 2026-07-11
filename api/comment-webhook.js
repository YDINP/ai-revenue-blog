// Supabase Database Webhook 수신 → 텔레그램 새 댓글 알림
// 트리거: supabase/telegram-comment-webhook.sql (comments INSERT)

import { escapeHtml, postUrl, sendToAdmin, sourceLabel } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || req.headers['x-webhook-secret'] !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Supabase Database Webhook payload: { type, table, record, old_record, schema }
  const { type, table, record } = req.body || {};
  if (type !== 'INSERT' || table !== 'comments' || !record) {
    return res.status(200).json({ skipped: true, reason: 'not_comment_insert' });
  }

  // 관리자 답변(봇/대시보드에서 단 대댓글)은 알림 제외 — 알림 루프 방지
  if (record.is_admin) {
    return res.status(200).json({ skipped: true, reason: 'admin_reply' });
  }

  const url = postUrl(record.source, record.post_slug);
  const kind = record.parent_id ? '↪️ 새 대댓글' : '💬 새 댓글';
  const lines = [
    `${kind} — <b>${escapeHtml(sourceLabel(record.source))}</b>`,
    url
      ? `📄 <a href="${url}#comments">${escapeHtml(record.post_slug)}</a>`
      : `📄 ${escapeHtml(record.post_slug)}`,
    `👤 ${escapeHtml(record.nickname)}`,
    '',
    escapeHtml(record.content),
    '',
    `#c_${record.id}`,
    '↩️ 이 메시지에 <b>답장</b>하면 관리자 대댓글로 등록됩니다',
  ];

  const result = await sendToAdmin(lines.join('\n'));
  return res.status(200).json({ ok: !!result.ok });
}
