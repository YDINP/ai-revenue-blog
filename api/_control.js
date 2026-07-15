// 봇 블로그 제어 명령 처리 — 목록/발행·숨김/작성/수정/삭제/자동생성/배포/상태
// GitHub 커밋 → Vercel 자동배포 가 기본 경로. 배포 상태만 Vercel API 사용.

import { blogList, resolveBlog } from './_blogs.js';
import {
  deletePost,
  dispatchGenerator,
  emptyCommitDeploy,
  fmValue,
  getPost,
  isDraft,
  latestGithubDeployment,
  latestRun,
  listPosts,
  putPost,
  setDraft,
  splitFrontmatter,
} from './_github.js';
import { escapeHtml } from './_shared.js';
import { clearState, getState, setState } from './_state.js';
import { hotKeywords } from './_trends.js';
import { hasVercelToken, latestDeployment, redeploy } from './_vercel.js';

const cut = (s, n) => (s = String(s || ''), s.length > n ? s.slice(0, n) + '…' : s);

function needBlog(arg) {
  const b = resolveBlog(arg);
  if (!b) {
    throw new Error(
      `블로그를 지정하세요: ${blogList().map((x) => `<code>${x.key}</code>`).join(' / ')}`
    );
  }
  return b;
}

// 제목 → 파일 slug (URL=파일명이므로 날짜 prefix 금지 — BLOG_GUIDELINES §3.6)
// 정렬·표시 날짜는 frontmatter pubDate가 담당하며, 파일명은 날짜를 포함하지 않는다.
function makeSlug(title) {
  const base = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return base || 'post';
}

// ── /blogs ──
export function blogsMessage() {
  const lines = ['📚 <b>제어 가능한 블로그</b>', ''];
  blogList().forEach((b) => {
    lines.push(
      `<code>${b.key}</code> — <b>${escapeHtml(b.label)}</b>`,
      `    ${b.repo} (${b.branch}) · <a href="${b.site}">사이트</a>`,
      `    자동생성 ${b.generator ? '가능' : '없음'} · 통계 ${b.source ? '연동' : '미연동'}`
    );
  });
  lines.push('', '예) <code>/posts tf</code> · <code>/deploy lf</code>');
  return lines.join('\n');
}

// ── /posts <blog> [n] ──
export async function postsMessage(blogArg, n = 10) {
  const blog = needBlog(blogArg);
  const files = await listPosts(blog, Math.min(Math.max(n, 1), 20));
  if (!files.length) return `${blog.label}: 글이 없습니다.`;
  // draft 여부는 파일을 열어야 알 수 있어 최근 것만 확인 (API 호출 절약)
  const detailed = await Promise.all(
    files.slice(0, 10).map(async (f) => {
      try {
        const p = await getPost(blog, f.slug);
        const { fm } = splitFrontmatter(p.content);
        return { ...f, title: fmValue(fm, 'title') || f.slug, draft: isDraft(p.content) };
      } catch {
        return { ...f, title: f.slug, draft: false };
      }
    })
  );
  const lines = [`📝 <b>${escapeHtml(blog.label)}</b> 최근 글 ${detailed.length}개`, ''];
  detailed.forEach((p, i) => {
    lines.push(
      `${i + 1}. ${p.draft ? '🚫 ' : '✅ '}${escapeHtml(cut(p.title, 40))}`,
      `    <code>${p.slug}</code>`
    );
  });
  lines.push(
    '',
    `✅발행 / 🚫숨김 · <code>/draft ${blog.key} &lt;slug&gt;</code> · <code>/publish ${blog.key} &lt;slug&gt;</code>`
  );
  return lines.join('\n');
}

// ── /publish, /draft ──
export async function toggleDraftMessage(blogArg, slug, draft) {
  const blog = needBlog(blogArg);
  if (!slug) throw new Error('slug 를 지정하세요 (<code>/posts</code> 목록의 코드값)');
  const p = await getPost(blog, slug);
  if (isDraft(p.content) === draft) {
    return `이미 ${draft ? '숨김' : '발행'} 상태입니다: <code>${escapeHtml(slug)}</code>`;
  }
  const next = setDraft(p.content, draft);
  await putPost(
    blog,
    p.path,
    next,
    p.sha,
    `chore: ${slug} ${draft ? '숨김(draft)' : '발행'} — 텔레그램 봇`
  );
  return (
    `${draft ? '🚫 숨김' : '✅ 발행'} 처리 완료 — <code>${escapeHtml(slug)}</code>\n` +
    `커밋 완료. Vercel 자동 재배포 후 반영됩니다 (~1분).`
  );
}

// ── /delpost <blog> <slug> — 확인 단계 포함 ──
export async function deleteRequestMessage(chatId, blogArg, slug) {
  const blog = needBlog(blogArg);
  if (!slug) throw new Error('slug 를 지정하세요');
  const p = await getPost(blog, slug);
  const title = fmValue(splitFrontmatter(p.content).fm, 'title') || slug;
  await setState(chatId, { flow: 'delete', blog: blog.key, slug });
  return (
    `⚠️ <b>삭제 확인</b>\n\n${escapeHtml(blog.label)}\n📄 ${escapeHtml(cut(title, 50))}\n<code>${escapeHtml(slug)}</code>\n\n` +
    `정말 삭제하려면 <code>확인</code> 이라고 답하세요. 다른 말을 보내면 취소됩니다.`
  );
}

export async function deleteConfirm(chatId, state) {
  const blog = needBlog(state.blog);
  const p = await getPost(blog, state.slug);
  await deletePost(blog, p.path, p.sha, `chore: ${state.slug} 삭제 — 텔레그램 봇`);
  await clearState(chatId);
  return `🗑 삭제 완료 — <code>${escapeHtml(state.slug)}</code>\n재배포 후 사이트에서 사라집니다.`;
}

// ── /newpost <blog> — 제목 → 본문 다단계 ──
export async function newPostStart(chatId, blogArg) {
  const blog = needBlog(blogArg);
  await setState(chatId, { flow: 'newpost', blog: blog.key, step: 'title' });
  return (
    `✍️ <b>${escapeHtml(blog.label)}</b> 새 글 작성\n\n` +
    `1) <b>제목</b>을 보내주세요.\n취소하려면 <code>/cancel</code>`
  );
}

export async function newPostStep(chatId, state, text) {
  const blog = needBlog(state.blog);
  if (state.step === 'title') {
    await setState(chatId, { ...state, step: 'body', title: text });
    return (
      `제목: <b>${escapeHtml(cut(text, 60))}</b>\n\n` +
      `2) <b>본문</b>을 마크다운으로 보내주세요. 그대로 발행됩니다.\n` +
      `(초안으로 올리려면 본문 첫 줄에 <code>[draft]</code>)`
    );
  }
  // body 단계 → 커밋
  let body = text;
  let draft = false;
  if (/^\s*\[draft\]\s*/i.test(body)) {
    draft = true;
    body = body.replace(/^\s*\[draft\]\s*/i, '');
  }
  const slug = makeSlug(state.title);
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00');
  const desc = body.replace(/[#*`>\-\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const fm = [
    '---',
    `title: ${JSON.stringify(state.title)}`,
    `description: ${JSON.stringify(desc || state.title)}`,
    `pubDate: ${nowKst}`,
    `category: ${JSON.stringify(blog.key === 'lf' ? 'lifestyle' : 'AI')}`,
    'tags: []',
    `author: ${JSON.stringify(blog.key === 'lf' ? 'LifeFlow' : 'TechFlow')}`,
    `draft: ${draft}`,
    '---',
    '',
  ].join('\n');
  const path = `${blog.contentDir}/${slug}.md`;
  await putPost(blog, path, fm + body + '\n', null, `feat: ${state.title} — 텔레그램 봇 작성`);
  await clearState(chatId);
  return (
    `${draft ? '🚫 초안' : '✅ 발행'} 등록 완료\n\n` +
    `📄 <b>${escapeHtml(cut(state.title, 50))}</b>\n<code>${slug}</code>\n\n` +
    (draft ? '' : `<a href="${blog.site}/blog/${slug}/">글 보기</a> (배포 후 ~1분)`)
  );
}

// ── /edit <blog> <slug> — 본문 교체 ──
export async function editStart(chatId, blogArg, slug) {
  const blog = needBlog(blogArg);
  if (!slug) throw new Error('slug 를 지정하세요');
  const p = await getPost(blog, slug);
  const { fm, body } = splitFrontmatter(p.content);
  const title = fmValue(fm, 'title') || slug;
  await setState(chatId, { flow: 'edit', blog: blog.key, slug });
  return (
    `✏️ <b>본문 교체</b>\n\n📄 ${escapeHtml(cut(title, 50))}\n<code>${escapeHtml(slug)}</code>\n` +
    `현재 본문 ${body.length.toLocaleString()}자\n\n` +
    `새 본문(마크다운)을 보내주세요. frontmatter(제목·날짜 등)는 유지됩니다.\n취소: <code>/cancel</code>`
  );
}

export async function editApply(chatId, state, text) {
  const blog = needBlog(state.blog);
  const p = await getPost(blog, state.slug);
  const { fm } = splitFrontmatter(p.content);
  const next = `---\n${fm}\n---\n\n${text}\n`;
  await putPost(blog, p.path, next, p.sha, `docs: ${state.slug} 본문 수정 — 텔레그램 봇`);
  await clearState(chatId);
  return `✏️ 수정 완료 — <code>${escapeHtml(state.slug)}</code>\n재배포 후 반영됩니다.`;
}

// ── /generate — 대화형 자동 포스팅 (블로그 선택 → 핫 키워드/직접 입력 → 실행) ──
// 인자를 직접 준 경우(/generate tf AI 주제)는 즉시 실행

export async function generateDispatch(blog, category, topic) {
  const inputs = { category: category || 'auto', topic: topic || '', count: '1' };
  await dispatchGenerator(blog, inputs);
  return (
    `🤖 <b>${escapeHtml(blog.label)}</b> 자동 포스팅 시작\n\n` +
    `📌 주제: <b>${escapeHtml(inputs.topic || '(자동 선택)')}</b>\n` +
    `🗂 카테고리: ${escapeHtml(inputs.category)}\n\n` +
    `Claude가 글을 생성하고 커밋 → 자동 배포합니다 (2~4분).\n` +
    `<code>/status ${blog.key}</code> 로 진행 확인.`
  );
}

export async function generateMessage(blogArg, category, topic) {
  const blog = needBlog(blogArg);
  return generateDispatch(blog, category, topic);
}

// 1단계: 블로그 선택 버튼
export function generateStart() {
  const blogs = blogList().filter((b) => b.generator);
  return {
    text:
      '🤖 <b>AI 자동 포스팅</b>\n\n어느 블로그에 쓸까요?',
    reply_markup: {
      inline_keyboard: [
        blogs.map((b) => ({ text: b.label.split(' (')[0], callback_data: `g:blog:${b.key}` })),
        [{ text: '✖ 취소', callback_data: 'g:cancel' }],
      ],
    },
  };
}

// 2단계: 주제 결정 방식
export async function generateSourceStep(chatId, blogKey) {
  const blog = needBlog(blogKey);
  await setState(chatId, { flow: 'generate', blog: blog.key });
  return {
    text: `🤖 <b>${escapeHtml(blog.label)}</b>\n\n주제를 어떻게 정할까요?`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔥 현재 핫 키워드 보기', callback_data: 'g:hot' }],
        [{ text: '✍️ 키워드 직접 입력', callback_data: 'g:manual' }],
        [{ text: '🎲 알아서 (자동 선택)', callback_data: 'g:auto' }],
        [{ text: '✖ 취소', callback_data: 'g:cancel' }],
      ],
    },
  };
}

// 3단계-A: 핫 키워드 목록 (후보를 상태에 저장하고 인덱스로 콜백 — 콜백 데이터 64B 제한 회피)
export async function generateHotStep(chatId, state) {
  const blog = needBlog(state.blog);
  const cands = await hotKeywords(blog);
  if (!cands.length) {
    return {
      text: '키워드를 가져오지 못했습니다. 직접 입력하거나 자동 선택을 쓰세요.',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✍️ 직접 입력', callback_data: 'g:manual' }],
          [{ text: '🎲 자동 선택', callback_data: 'g:auto' }],
        ],
      },
    };
  }
  await setState(chatId, { ...state, cands });
  return {
    text:
      `🔥 <b>현재 핫 키워드</b> — ${escapeHtml(blog.label)}\n\n` +
      `🌱 미사용 시드 · 🔥 구글 실시간 급상승 · 📈 내 블로그 인기글 후속편\n\n` +
      `쓸 키워드를 고르세요.`,
    reply_markup: {
      inline_keyboard: [
        ...cands.map((c, i) => [{ text: cut(c.label, 55), callback_data: `g:kw:${i}` }]),
        [
          { text: '🔄 새로고침', callback_data: 'g:hot' },
          { text: '✍️ 직접 입력', callback_data: 'g:manual' },
        ],
        [{ text: '✖ 취소', callback_data: 'g:cancel' }],
      ],
    },
  };
}

// 3단계-B: 직접 입력 대기
export async function generateManualStep(chatId, state) {
  const blog = needBlog(state.blog);
  await setState(chatId, { ...state, step: 'await_topic' });
  return {
    text:
      `✍️ <b>${escapeHtml(blog.label)}</b>\n\n쓸 <b>키워드/주제</b>를 보내주세요.\n` +
      `예) <code>2026 인디게임 수익화 전략</code>\n\n취소: <code>/cancel</code>`,
  };
}

// 4단계: 키워드 확정 → 워크플로 실행
export async function generatePickKeyword(chatId, state, index) {
  const blog = needBlog(state.blog);
  const c = (state.cands || [])[index];
  if (!c) throw new Error('키워드가 만료됐습니다. <code>/generate</code> 로 다시 시작하세요.');
  await clearState(chatId);
  return generateDispatch(blog, c.category, c.topic);
}

export async function generateManualTopic(chatId, state, topic) {
  const blog = needBlog(state.blog);
  await clearState(chatId);
  return generateDispatch(blog, 'auto', topic);
}

// ── /deploy <blog> ──
export async function deployMessage(blogArg) {
  const blog = needBlog(blogArg);
  if (hasVercelToken()) {
    const d = await redeploy(blog);
    return `🚀 <b>${escapeHtml(blog.label)}</b> 재배포 시작\n${d.url}\n\n<code>/status ${blog.key}</code> 로 확인`;
  }
  const sha = await emptyCommitDeploy(blog, 'chore: 재배포 트리거 — 텔레그램 봇');
  return (
    `🚀 <b>${escapeHtml(blog.label)}</b> 재배포 트리거 (커밋 <code>${sha}</code>)\n` +
    `Vercel 자동배포가 시작됩니다 (~1분).\n\n` +
    `<i>VERCEL_TOKEN 을 설정하면 배포 상태까지 조회됩니다.</i>`
  );
}

// ── /status [blog] ──
// Vercel 토큰이 있으면 Vercel API, 없으면 GitHub Deployments(=Vercel 이 기록) 로 조회
const GH_STATE_ICON = {
  success: '✅', failure: '❌', error: '❌', in_progress: '🔨', queued: '⏳', pending: '⏳', inactive: '💤',
};

export async function statusMessage(blogArg) {
  const targets = blogArg ? [needBlog(blogArg)] : blogList();
  const lines = ['🩺 <b>배포 상태</b>', ''];
  for (const blog of targets) {
    lines.push(`<b>${escapeHtml(blog.label)}</b>`);
    try {
      if (hasVercelToken()) {
        const d = await latestDeployment(blog);
        if (d) {
          const icon =
            d.state === 'READY' ? '✅' : d.state === 'ERROR' ? '❌' : d.state === 'BUILDING' ? '🔨' : '⏳';
          lines.push(`  ${icon} ${d.state}${d.sha ? ` · <code>${d.sha}</code>` : ''}`);
          if (d.commit) lines.push(`  💬 ${escapeHtml(cut(d.commit, 40))}`);
        } else lines.push('  배포 이력 없음');
      } else {
        const d = await latestGithubDeployment(blog);
        if (d) {
          lines.push(
            `  ${GH_STATE_ICON[d.state] || '⏳'} ${d.state}${d.sha ? ` · <code>${d.sha}</code>` : ''}`
          );
          if (d.message) lines.push(`  💬 ${escapeHtml(cut(d.message, 40))}`);
        } else lines.push('  배포 이력 없음');
      }
    } catch (e) {
      lines.push(`  ⚠️ ${escapeHtml(e.message)}`);
    }
    if (blog.generator) {
      try {
        const r = await latestRun(blog);
        if (r) {
          const icon =
            r.status !== 'completed' ? '🔄' : r.conclusion === 'success' ? '✅' : '❌';
          lines.push(`  🤖 자동생성: ${icon} ${r.conclusion || r.status}`);
        }
      } catch { /* 무시 */ }
    }
    lines.push(`  <a href="${blog.site}">${blog.site.replace('https://', '')}</a>`, '');
  }
  return lines.join('\n');
}

// ── 다단계 흐름 진입점: 명령이 아닌 일반 메시지 처리 ──
// 처리했으면 응답 문자열, 상태가 없으면 null
export async function handleFlow(chatId, text) {
  const state = await getState(chatId);
  if (!state) return null;

  if (text === '/cancel') {
    await clearState(chatId);
    return '취소했습니다.';
  }
  if (state.flow === 'delete') {
    if (text.trim() !== '확인') {
      await clearState(chatId);
      return '삭제를 취소했습니다.';
    }
    return deleteConfirm(chatId, state);
  }
  if (state.flow === 'newpost') return newPostStep(chatId, state, text);
  if (state.flow === 'edit') return editApply(chatId, state, text);
  if (state.flow === 'generate' && state.step === 'await_topic') {
    return generateManualTopic(chatId, state, text);
  }
  return null;   // generate 대기 중(버튼 단계) 등은 상태를 지우지 않고 통과
}

// 콜백 버튼(g:*) 처리 — { text, reply_markup? } 반환
export async function handleGenerateCallback(chatId, data) {
  if (data === 'g:cancel') {
    await clearState(chatId);
    return { text: '자동 포스팅을 취소했습니다.' };
  }
  const blogPick = data.match(/^g:blog:(\w+)$/);
  if (blogPick) return generateSourceStep(chatId, blogPick[1]);

  const state = await getState(chatId);
  if (!state || state.flow !== 'generate') {
    return { text: '세션이 만료됐습니다. <code>/generate</code> 로 다시 시작하세요.' };
  }
  if (data === 'g:hot') return generateHotStep(chatId, state);
  if (data === 'g:manual') return generateManualStep(chatId, state);
  if (data === 'g:auto') {
    const blog = needBlog(state.blog);
    await clearState(chatId);
    return { text: await generateDispatch(blog, 'auto', '') };
  }
  const kw = data.match(/^g:kw:(\d+)$/);
  if (kw) return { text: await generatePickKeyword(chatId, state, parseInt(kw[1], 10)) };
  return { text: '알 수 없는 동작입니다.' };
}
