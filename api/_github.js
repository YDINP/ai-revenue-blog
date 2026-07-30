// GitHub Contents/Actions API — 봇의 글 조회·발행·수정·삭제·자동생성 트리거
// 커밋이 push 되면 Vercel 이 자동 재배포하므로 별도 배포 호출이 필요 없다.

const API = 'https://api.github.com';

function token() {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new Error('GITHUB_TOKEN 미설정');
  return t;
}

async function gh(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'blog-telegram-bot',
      ...(opts.headers || {}),
    },
  });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(`GitHub ${r.status}: ${data?.message || 'unknown'}`);
  }
  return data;
}

const b64encode = (s) => Buffer.from(s, 'utf8').toString('base64');
const b64decode = (s) => Buffer.from(s, 'base64').toString('utf8');

// ── frontmatter 파싱/수정 (전체 YAML 파서 없이 필요한 필드만) ──
export function splitFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: '', body: md, hasFm: false };
  return { fm: m[1], body: m[2], hasFm: true };
}

export function fmValue(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, '');
}

export function isDraft(md) {
  const { fm } = splitFrontmatter(md);
  return /^draft:\s*true\s*$/m.test(fm);
}

// draft 값을 설정 (없으면 frontmatter 끝에 추가)
export function setDraft(md, value) {
  const { fm, body, hasFm } = splitFrontmatter(md);
  if (!hasFm) throw new Error('frontmatter 없는 파일');
  const line = `draft: ${value}`;
  const nextFm = /^draft:\s*.*$/m.test(fm)
    ? fm.replace(/^draft:\s*.*$/m, line)
    : `${fm}\n${line}`;
  return `---\n${nextFm}\n---\n${body}`;
}

// ── Contents API ──
// 글 목록 — 콘텐츠 repo 전용이다. 뭉게(WordPress)는 repo 가 없으므로 명시적으로 거부한다.
// generatorRepo 로 폴백하면 이관 전 Astro 마크다운(정지된 자료)을 현재 글로 보여 준다.
export async function listPosts(blog, limit = 10) {
  if (!blog.repo) throw new Error(`${blog.label} 은 GitHub 글 목록이 없습니다 (WordPress 직접 운영)`);
  const files = await gh(
    `/repos/${blog.repo}/contents/${blog.contentDir}?ref=${blog.branch}`
  );
  return (Array.isArray(files) ? files : [])
    .filter((f) => f.type === 'file' && f.name.endsWith('.md') && !f.name.startsWith('_'))
    .sort((a, b) => (a.name < b.name ? 1 : -1))   // 파일명이 날짜 프리픽스라 최신순
    .slice(0, limit)
    .map((f) => ({ slug: f.name.replace(/\.md$/, ''), path: f.path, sha: f.sha }));
}

export async function getPost(blog, slug) {
  const path = `${blog.contentDir}/${slug}.md`;
  const f = await gh(`/repos/${blog.repo}/contents/${encodeURI(path)}?ref=${blog.branch}`);
  if (!f || !f.content) throw new Error('파일 없음');
  return { path, sha: f.sha, content: b64decode(f.content.replace(/\n/g, '')) };
}

// 레포의 임의 JSON 파일 읽기 (category-seeds.json 등)
// 설정 파일(scripts/category-seeds.json 등) 읽기.
// ⚠️ 콘텐츠(글)와 달리 이건 파이프라인 설정이므로 generatorRepo 를 폴백으로 허용한다 —
// 뭉게는 콘텐츠 repo 가 없지만(WordPress) 시드 파일은 생성 워크플로 레포에 있다.
export async function getFileJson(blog, path) {
  const repo = blog.repo || blog.generatorRepo;
  const ref = blog.repo ? blog.branch : (blog.generatorRef || 'master');
  if (!repo) throw new Error(`${blog.label} 은 연결된 GitHub 레포가 없습니다`);
  const f = await gh(`/repos/${repo}/contents/${encodeURI(path)}?ref=${ref}`);
  if (!f?.content) throw new Error('파일 없음: ' + path);
  return JSON.parse(b64decode(f.content.replace(/\n/g, '')));
}

export async function putPost(blog, path, content, sha, message) {
  return gh(`/repos/${blog.repo}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: b64encode(content),
      branch: blog.branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

export async function deletePost(blog, path, sha, message) {
  return gh(`/repos/${blog.repo}/contents/${encodeURI(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: blog.branch }),
  });
}

// ── Actions: 자동 포스팅 워크플로 트리거 ──
// GitHub 은 60일간 레포 활동이 없으면 스케줄 워크플로를 자동 비활성(disabled_inactivity)
// 시킨다 → dispatch 가 422 로 실패. 이때는 자동으로 다시 켜고 한 번 재시도한다.
export async function dispatchGenerator(blog, inputs = {}) {
  if (!blog.generator) throw new Error(`${blog.label} 은 자동 포스팅 워크플로가 없습니다`);
  // 워크플로가 사는 레포는 콘텐츠 레포와 다를 수 있다 — 뭉게는 콘텐츠가 WordPress 라
  // repo=null 이지만 생성 워크플로는 ai-revenue-blog 에 있다(_blogs.js generatorRepo).
  const repo = blog.generatorRepo || blog.repo;
  const ref = blog.generatorRef || blog.branch;
  const path = `/repos/${repo}/actions/workflows/${blog.generator}`;
  const send = () =>
    gh(`${path}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref, inputs }),
    });
  try {
    await send();
  } catch (e) {
    if (!/disabled workflow/i.test(e.message)) throw e;
    await gh(`${path}/enable`, { method: 'PUT' });
    await send();
  }
  return true;
}

// 임의 워크플로 dispatch (Threads 초안 생성기 등) — 비활성 시 자동 재활성 후 재시도
export async function dispatchWorkflow(repo, workflow, ref, inputs = {}) {
  const path = `/repos/${repo}/actions/workflows/${workflow}`;
  const send = () => gh(`${path}/dispatches`, { method: 'POST', body: JSON.stringify({ ref, inputs }) });
  try {
    await send();
  } catch (e) {
    if (!/disabled workflow/i.test(e.message)) throw e;
    await gh(`${path}/enable`, { method: 'PUT' });
    await send();
  }
  return true;
}

export async function latestRun(blog) {
  if (!blog.generator) return null;
  const d = await gh(
    `/repos/${blog.generatorRepo || blog.repo}/actions/workflows/${blog.generator}/runs?per_page=1`
  );
  const run = d?.workflow_runs?.[0];
  return run
    ? { status: run.status, conclusion: run.conclusion, url: run.html_url, at: run.created_at }
    : null;
}

// ── 배포 상태 (Vercel 이 GitHub Deployments 에 기록한다 → Vercel 토큰 없이 조회 가능) ──
export async function latestGithubDeployment(blog) {
  const deps = await gh(
    `/repos/${blog.repo}/deployments?environment=Production&per_page=1`
  );
  const dep = deps?.[0];
  if (!dep) return null;
  const statuses = await gh(`/repos/${blog.repo}/deployments/${dep.id}/statuses?per_page=1`);
  const st = statuses?.[0];
  return {
    state: st?.state || 'pending',        // success | failure | in_progress | queued | error
    url: st?.target_url || null,
    at: st?.created_at || dep.created_at,
    sha: (dep.sha || '').slice(0, 7),
    message: dep.payload?.githubCommitMessage || dep.description || '',
  };
}

// ── 빈 커밋으로 재배포 (VERCEL_TOKEN 없을 때의 폴백) ──
export async function emptyCommitDeploy(blog, message) {
  const ref = await gh(`/repos/${blog.repo}/git/ref/heads/${blog.branch}`);
  const headSha = ref.object.sha;
  const head = await gh(`/repos/${blog.repo}/git/commits/${headSha}`);
  const commit = await gh(`/repos/${blog.repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: head.tree.sha, parents: [headSha] }),
  });
  await gh(`/repos/${blog.repo}/git/refs/heads/${blog.branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha.slice(0, 7);
}
