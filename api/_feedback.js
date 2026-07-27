// 사이트 피드백(site_feedback) 조회·삭제 — 텔레그램 봇용
// `_` 프리픽스 → Vercel 엔드포인트로 노출 안 됨.
// site_feedback은 RLS로 anon INSERT만 허용하고 SELECT/DELETE는 전면 차단이므로
// 반드시 service_role 키(_threads.js의 sb 헬퍼)로 접근한다.

import { escapeHtml } from './_shared.js';
import { sb } from './_threads.js';

// 사이트 코드 → 표시명·주소. 새 사이트가 피드백을 보내면 여기에 추가.
const SITE_META = {
  'ipsi-archive': { label: '입시 아카이브', url: 'https://ipsi-archive-site.vercel.app' },
};
const siteLabel = (s) => SITE_META[s]?.label || s || '(미상)';

const CAT_ICON = { 데이터오류: '🐞', 기능제안: '💡', 기타: '💬' };

const FIELDS = 'id,site,category,target,message,context,page_url,user_agent,created_at';

export async function listFeedback({ limit = 10, site = null } = {}) {
  const q = [
    `select=${FIELDS}`,
    'order=created_at.desc',
    `limit=${Math.min(Math.max(limit, 1), 30)}`,
    ...(site ? [`site=eq.${encodeURIComponent(site)}`] : []),
  ].join('&');
  return sb(`site_feedback?${q}`);
}

export async function countFeedback() {
  const rows = await sb('site_feedback?select=id');
  return Array.isArray(rows) ? rows.length : 0;
}

export async function getFeedback(id) {
  const rows = await sb(`site_feedback?id=eq.${encodeURIComponent(id)}&select=${FIELDS}`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function deleteFeedback(id) {
  await sb(`site_feedback?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    prefer: 'return=representation',
  });
  return true;
}

function kst(ts) {
  if (!ts) return '';
  const d = new Date(ts.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(ts).slice(0, 16);
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// 작성 시점 화면 상태 — 어떤 조건에서 남긴 피드백인지 재현용
function contextLine(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const VIEW = { card: '카드', table: '표', timeline: '일정', calendar: '달력' };
  const bits = [];
  if (ctx.view) bits.push(`${VIEW[ctx.view] || ctx.view} 뷰`);
  if (ctx.shown != null) bits.push(`표시 ${ctx.shown}개`);
  if (ctx.q) bits.push(`검색 "${ctx.q}"`);
  const filters = ['fields', 'types', 'regions', 'admits', 'practs']
    .flatMap((k) => (Array.isArray(ctx[k]) ? ctx[k] : []));
  if (filters.length) bits.push(`필터 ${filters.join(', ')}`);
  if (ctx.screen) bits.push(ctx.screen);
  return bits.length ? `<i>🖥 ${escapeHtml(bits.join(' · '))}</i>` : '';
}

const isMobile = (ua) => /Android|iPhone|iPad|Mobile/i.test(ua || '');

// 피드백 1건 → 메시지 + 삭제 버튼
export function feedbackCard(f) {
  const icon = CAT_ICON[f.category] || '💬';
  const lines = [
    `${icon} <b>${escapeHtml(f.category)}</b> · ${escapeHtml(siteLabel(f.site))} · <code>#${f.id}</code>`,
    `🕘 ${kst(f.created_at)} · ${isMobile(f.user_agent) ? '📱 모바일' : '🖥 데스크톱'}`,
  ];
  if (f.target) lines.push(`🎯 <b>${escapeHtml(String(f.target).replace('|', ' — '))}</b>`);
  lines.push('', escapeHtml(f.message));
  const ctx = contextLine(f.context);
  if (ctx) lines.push('', ctx);

  return {
    text: lines.join('\n'),
    reply_markup: {
      inline_keyboard: [[{ text: '🗑 삭제', callback_data: `fb:del:${f.id}` }]],
    },
  };
}

export async function feedbackCards({ limit = 10, site = null } = {}) {
  const rows = await listFeedback({ limit, site });
  if (!rows.length) {
    return { header: '📭 등록된 피드백이 없습니다.', cards: [] };
  }
  const total = await countFeedback();
  const header =
    `💬 <b>사이트 피드백</b> — 최근 ${rows.length}건 (전체 ${total}건)\n` +
    `각 카드의 <b>🗑 삭제</b> 버튼으로 지울 수 있습니다.`;
  return { header, cards: rows.map(feedbackCard) };
}

// 인라인 버튼 처리 — fb:del:<id>(확인 요청) / fb:ok:<id>(확정 삭제) / fb:no:<id>(취소)
export async function handleFeedbackCallback(data) {
  const [, action, rawId] = data.split(':');
  const id = String(rawId || '').replace(/\D/g, '');
  if (!id) return { text: '❌ 피드백 ID를 인식하지 못했습니다.' };

  if (action === 'del') {
    const f = await getFeedback(id);
    if (!f) return { text: `🗑 <code>#${id}</code> — 이미 삭제된 피드백입니다.` };
    const card = feedbackCard(f);
    return {
      text: `${card.text}\n\n⚠️ <b>정말 삭제할까요?</b> (되돌릴 수 없습니다)`,
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ 삭제', callback_data: `fb:ok:${id}` },
          { text: '취소', callback_data: `fb:no:${id}` },
        ]],
      },
    };
  }

  if (action === 'ok') {
    const f = await getFeedback(id);
    if (!f) return { text: `🗑 <code>#${id}</code> — 이미 삭제된 피드백입니다.` };
    await deleteFeedback(id);
    const preview = String(f.message).slice(0, 60);
    return {
      text:
        `🗑 <b>삭제 완료</b> · <code>#${id}</code>\n` +
        `<s>${escapeHtml(preview)}${f.message.length > 60 ? '…' : ''}</s>`,
    };
  }

  if (action === 'no') {
    const f = await getFeedback(id);
    if (!f) return { text: `<code>#${id}</code> — 이미 삭제된 피드백입니다.` };
    const card = feedbackCard(f);
    return { text: card.text, reply_markup: card.reply_markup };
  }

  return { text: `❌ 알 수 없는 동작: ${escapeHtml(action || '')}` };
}
