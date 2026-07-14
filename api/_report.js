// 전날(또는 지정일) 종합 리포트 — 조회수/방문자/신규 댓글/좋아요/쿠팡클릭
// cron(daily-report.js) 과 봇 /report 명령이 공유

import { blogList } from './_blogs.js';
import { communityHot } from './_community.js';
import { getFileJson } from './_github.js';
import { gscReportLines } from './_gsc-view.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, escapeHtml, postUrl } from './_shared.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const cut = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n) + '…' : s);

// RSS 제목의 엔티티를 먼저 풀어야 한다 (안 풀면 escapeHtml 을 거쳐 &amp;amp; 로 이중 인코딩)
const decodeEntities = (s) =>
  String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&');

// 홈페이지 조회는 사이트 제목으로 기록된다 → '홈' 으로 표시
const postTitle = (t) => (/^(TechFlow|LifeFlow)/.test(t) ? '홈' : t);

// KST 기준 날짜 문자열 (offset일 전)
function kstDay(offsetDays = 0) {
  const t = Date.now() + 9 * 3600 * 1000 - offsetDays * 86400000;
  return new Date(t).toISOString().split('T')[0];
}

// KST 날짜 [00:00, 24:00) 을 UTC ISO 범위로
function kstRange(day) {
  const start = new Date(`${day}T00:00:00+09:00`).toISOString();
  const end = new Date(new Date(`${day}T00:00:00+09:00`).getTime() + 86400000).toISOString();
  return { start, end };
}

async function rest(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}

// 유입 경로 분류 — 수익형 블로그에선 검색 유입이 핵심 지표
const REF_RULES = [
  [/google\./i, '구글 검색'],
  [/naver\./i, '네이버 검색'],
  [/daum\.|search\.daum/i, '다음 검색'],
  [/bing\.|duckduckgo|yahoo/i, '기타 검색'],
  [/facebook|instagram|threads|twitter|x\.com|t\.co|linkedin|reddit/i, 'SNS'],
  [/kakao|band\.us/i, '카카오/밴드'],
];

// 빈 referrer 를 user_agent 로 재분류 — 메신저/SNS 인앱브라우저는 referrer 를 안 넘겨
// 전부 '직접'으로 뭉치므로 UA 시그니처로 인앱 채널을 분리한다.
function classifyInAppRef(ua) {
  const u = String(ua || '');
  if (/KAKAOTALK/i.test(u)) return '카카오톡 인앱';
  if (/Instagram/i.test(u)) return 'Instagram 인앱';
  if (/FBAN|FBAV|FB_IAB/i.test(u)) return 'Facebook 인앱';
  if (/Line\//i.test(u)) return 'LINE 인앱';
  if (/NAVER\(inapp/i.test(u)) return 'Naver 앱';
  if (/DaumApps|DaumDevice/i.test(u)) return 'Daum 앱';
  if (/BAND\//i.test(u)) return 'Band 인앱';
  if (/Threads/i.test(u)) return 'Threads 인앱';
  // 참조 없음 + 알려진 인앱 아님 → WebView 시그니처면 '앱 내(무참조)', 아니면 '직접/북마크'
  if (/;\s?wv\)/.test(u) || (/(iPhone|iPad)/.test(u) && /Mobile\//.test(u) && !/Safari/.test(u))) return '앱 내(무참조)';
  return '직접/북마크';
}

// 분류 우선순위: UTM > referrer 호스트 > (빈 referrer)UA 인앱감지 > 직접
function classifyRef(referrer, ua, utm) {
  if (utm) {
    const s = String(utm).toLowerCase();
    if (/google/.test(s)) return '구글 검색';
    if (/naver/.test(s)) return '네이버 검색';
    if (/daum/.test(s)) return '다음 검색';
    if (/bing|yahoo|duckduckgo/.test(s)) return '기타 검색';
    if (/kakao|band/.test(s)) return '카카오/밴드';
    if (/facebook|instagram|threads|twitter|line|linkedin|reddit/.test(s)) return 'SNS';
    return `기타(${utm})`;
  }
  const r = String(referrer || '').trim();
  if (!r || r === 'direct') return classifyInAppRef(ua);
  for (const [re, label] of REF_RULES) if (re.test(r)) return label;
  try {
    const host = new URL(r).hostname.replace(/^www\./, '');
    if (/(ai-revenue-blog|life-revenue-blog)\.vercel\.app/.test(host)) return '사이트 내 이동';
    return `기타(${host})`;
  } catch {
    return '기타';
  }
}

const isSearch = (label) => /검색$/.test(label);

function delta(cur, prev) {
  const c = Number(cur || 0), p = Number(prev || 0);
  if (p === 0) return c > 0 ? ` (<b>+${fmt(c)}</b>)` : '';
  const pct = Math.round(((c - p) / p) * 100);
  if (pct === 0) return ' (전일 대비 ±0%)';
  return pct > 0 ? ` (전일 대비 ▲${pct}%)` : ` (전일 대비 ▼${Math.abs(pct)}%)`;
}

// 하루치 원자료 → 집계
async function collect(day) {
  const { start, end } = kstRange(day);
  const range = `created_at=gte.${start}&created_at=lt.${end}`;

  const [pv, comments, likes, clicks] = await Promise.all([
    rest(`analytics?event_type=eq.pageview&${range}&select=source,metadata`),
    rest(`comments?${range}&select=source,nickname,content,post_slug,is_admin`),
    rest(`card_likes?${range}&select=slug`),
    rest(
      `analytics?or=(event_type.eq.coupang_click,event_type.eq.affiliate_click)&${range}&select=source,metadata`
    ),
  ]);

  const uas = new Set();
  const byPost = {};
  const refs = {};        // 유입 경로별 조회수
  let tf = 0, lf = 0;
  (pv || []).forEach((r) => {
    const m = r.metadata || {};
    if (m.user_agent) uas.add(m.user_agent);
    if (r.source === 'lifeflow') lf++; else tf++;
    const title = m.title && m.title !== 'null'
      ? String(m.title).split(' | ')[0].split(' - ')[0]
      : decodeURIComponent(m.slug || m.path || '홈');
    const key = `${r.source === 'lifeflow' ? 'LF' : 'TF'}|${title}`;
    byPost[key] = (byPost[key] || 0) + 1;
    const c = classifyRef(m.referrer, m.user_agent, m.utm_source);
    refs[c] = (refs[c] || 0) + 1;
  });

  return {
    day,
    views: (pv || []).length,
    tfViews: tf,
    lfViews: lf,
    visitors: uas.size,
    refs,
    byPostMap: byPost,
    comments: (comments || []).filter((c) => !c.is_admin),
    likes: (likes || []).length,
    clicks: (clicks || []).filter((c) => {
      const m = c.metadata || {};
      return m.target === undefined || m.target === 'coupang';
    }),
    topPosts: Object.entries(byPost).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

// ── 어제 발행된 글 (블로그 RSS 의 pubDate 기준) ──
async function newPosts(day) {
  const jobs = blogList()
    .filter((b) => b.source)
    .map(async (b) => {
      try {
        const r = await fetch(`${b.site}/rss.xml`, { signal: AbortSignal.timeout(6000) });
        if (!r.ok) return [];
        const xml = await r.text();
        return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
          .map((m) => {
            const t = m[1].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
            const d = m[1].match(/<pubDate>([^<]+)<\/pubDate>/);
            if (!t || !d) return null;
            const at = new Date(d[1]);
            if (isNaN(at)) return null;
            // KST 날짜로 환산해 비교
            const kst = new Date(at.getTime() + 9 * 3600 * 1000).toISOString().split('T')[0];
            return kst === day
              ? { src: b.source === 'lifeflow' ? 'LF' : 'TF', title: decodeEntities(t[1].trim()) }
              : null;
          })
          .filter(Boolean);
      } catch {
        return [];
      }
    });
  return (await Promise.all(jobs)).flat();
}

// ── 전일 대비 급상승/급락 글 ──
function movers(cur, prev, minViews = 3) {
  const keys = new Set([...Object.keys(cur.byPostMap), ...Object.keys(prev.byPostMap)]);
  const rows = [];
  for (const k of keys) {
    const c = cur.byPostMap[k] || 0;
    const p = prev.byPostMap[k] || 0;
    if (Math.max(c, p) < minViews) continue;      // 표본이 너무 작으면 노이즈
    rows.push({ key: k, cur: c, prev: p, diff: c - p });
  }
  const up = rows.filter((r) => r.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 2);
  const down = rows.filter((r) => r.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 2);
  return { up, down };
}

// ── 오늘 쓸 만한 소재 (커뮤니티 실시간 화제) ──
async function todaysTopics() {
  const jobs = blogList()
    .filter((b) => b.generator && b.communities?.length)
    .map(async (b) => {
      try {
        const seeds = await getFileJson(b, 'scripts/category-seeds.json').catch(() => null);
        const { posts } = await communityHot(b, seeds, 3);
        return posts.slice(0, 2).map((p) => ({ key: b.key, label: b.label.split(' (')[0], post: p }));
      } catch {
        return [];
      }
    });
  return (await Promise.all(jobs)).flat().slice(0, 4);
}

export async function reportMessage(dayArg) {
  const day = dayArg || kstDay(1);                      // 기본 = 어제(KST)
  const prevDay = new Date(new Date(`${day}T00:00:00+09:00`).getTime() - 86400000)
    .toISOString()
    .split('T')[0];

  const [cur, prev, fresh, topics, gscLines] = await Promise.all([
    collect(day),
    collect(prevDay),
    newPosts(day),
    todaysTopics().catch(() => []),
    gscReportLines().catch(() => []),   // Search Console 미연동이면 빈 배열
  ]);

  // day 는 이미 KST 달력 날짜(YYYY-MM-DD)이므로 UTC 자정으로 파싱해 getUTCDay 로 요일을 뽑는다.
  // getDay()/+09:00 조합은 서버 로컬 TZ(UTC 러너)에서 하루 밀림 → 07-13(월)이 일요일로 표기됐음.
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(`${day}T00:00:00Z`).getUTCDay()];
  const lines = [
    `📊 <b>일일 리포트</b> — ${day} (${wd})`,
    '',
    `👁 조회수 <b>${fmt(cur.views)}</b>${delta(cur.views, prev.views)}`,
    `    TF ${fmt(cur.tfViews)} · LF ${fmt(cur.lfViews)}`,
    `🧑 방문자 <b>${fmt(cur.visitors)}</b>${delta(cur.visitors, prev.visitors)}`,
    `💬 신규 댓글 <b>${fmt(cur.comments.length)}</b>${delta(cur.comments.length, prev.comments.length)}`,
    `❤️ 신규 좋아요 <b>${fmt(cur.likes)}</b>${delta(cur.likes, prev.likes)}`,
    `🛒 쿠팡 클릭 <b>${fmt(cur.clicks.length)}</b>${delta(cur.clicks.length, prev.clicks.length)}`,
  ];

  // ── 유입 경로 (검색 유입이 핵심) ──
  const refEntries = Object.entries(cur.refs || {}).sort((a, b) => b[1] - a[1]);
  if (refEntries.length) {
    const searchCur = refEntries.filter(([l]) => isSearch(l)).reduce((s, [, n]) => s + n, 0);
    const searchPrev = Object.entries(prev.refs || {})
      .filter(([l]) => isSearch(l))
      .reduce((s, [, n]) => s + n, 0);
    const pct = (n) => (cur.views ? Math.round((n / cur.views) * 100) : 0);
    lines.push(
      '',
      `<b>유입 경로</b> — 검색 <b>${fmt(searchCur)}</b> (${pct(searchCur)}%)${delta(searchCur, searchPrev)}`
    );
    refEntries.slice(0, 5).forEach(([label, n]) =>
      lines.push(`· ${escapeHtml(label)} ${fmt(n)} (${pct(n)}%)`)
    );
  }

  // ── 검색 유입 (Search Console) ──
  lines.push(...gscLines);

  if (cur.topPosts.length) {
    lines.push('', '<b>인기 글 TOP</b>');
    cur.topPosts.forEach(([key, n], i) => {
      const [src, title] = key.split('|');
      lines.push(`${i + 1}. [${src}] ${escapeHtml(cut(postTitle(title), 32))} — ${fmt(n)}`);
    });
  }

  // ── 어제 발행한 글 + 초기 성과 (조회 많은 순, 많으면 접어서) ──
  if (fresh.length) {
    const withViews = fresh
      .map((p) => ({
        ...p,
        views: cur.byPostMap[`${p.src}|${p.title.split(' | ')[0].split(' - ')[0]}`] || 0,
      }))
      .sort((a, b) => b.views - a.views);
    lines.push('', `<b>새로 발행한 글</b> ${withViews.length}개`);
    withViews.slice(0, 5).forEach((p) =>
      lines.push(`· [${p.src}] ${escapeHtml(cut(p.title, 34))} — 조회 ${fmt(p.views)}`)
    );
    if (withViews.length > 5) lines.push(`  …외 ${withViews.length - 5}개`);
  }

  // ── 급상승 / 급락 ──
  const mv = movers(cur, prev);
  if (mv.up.length || mv.down.length) {
    lines.push('', '<b>전일 대비 변화</b>');
    mv.up.forEach((r) => {
      const [src, title] = r.key.split('|');
      lines.push(`▲ [${src}] ${escapeHtml(cut(postTitle(title), 28))} ${fmt(r.prev)}→<b>${fmt(r.cur)}</b>`);
    });
    mv.down.forEach((r) => {
      const [src, title] = r.key.split('|');
      lines.push(`▼ [${src}] ${escapeHtml(cut(postTitle(title), 28))} ${fmt(r.prev)}→<b>${fmt(r.cur)}</b>`);
    });
  }

  if (cur.comments.length) {
    lines.push('', '<b>새 댓글</b>');
    cur.comments.slice(0, 5).forEach((c) => {
      const src = c.source === 'lifeflow' ? 'LF' : 'TF';
      lines.push(`· [${src}] <b>${escapeHtml(c.nickname)}</b>: ${escapeHtml(cut(c.content, 40))}`);
    });
    if (cur.comments.length > 5) lines.push(`  …외 ${cur.comments.length - 5}개 (<code>/comments</code>)`);
  }

  if (cur.clicks.length) {
    lines.push('', '<b>쿠팡 클릭 상품</b>');
    const by = {};
    cur.clicks.forEach((c) => {
      const m = c.metadata || {};
      const p = m.product || m.label || '(상품 미상)';
      by[p] = (by[p] || 0) + 1;
    });
    Object.entries(by)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([p, n]) => lines.push(`· ${escapeHtml(cut(p, 34))} — ${fmt(n)}`));
  }

  if (!cur.views && !cur.comments.length && !cur.clicks.length) {
    lines.push('', '<i>해당 날짜의 활동 데이터가 없습니다.</i>');
  }

  // ── 오늘 쓸 만한 소재 (커뮤니티 실시간 화제) ──
  if (topics.length) {
    lines.push('', '<b>오늘의 추천 주제</b> — 커뮤니티 화제');
    topics.forEach((t) => lines.push(`· [${t.key.toUpperCase()}] ${escapeHtml(cut(t.post, 40))}`));
    lines.push('<code>/generate</code> 로 바로 쓸 수 있습니다.');
  }

  return lines.join('\n');
}

export { kstDay };
