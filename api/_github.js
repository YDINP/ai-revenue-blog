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
export async function listPosts(blog, limit = 10) {
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
export async function getFileJson(blog, path) {
  const f = await gh(`/repos/${blog.repo}/contents/${encodeURI(path)}?ref=${blog.branch}`);
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
export async function dispatchGenerator(blog, inputs = {}) {
  if (!blog.generator) throw new Error(`${blog.label} 은 자동 포스팅 워크플로가 없습니다`);
  await gh(`/repos/${blog.repo}/actions/workflows/${blog.generator}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: blog.branch, inputs }),
  });
  return true;
}

export async function latestRun(blog) {
  if (!blog.generator) return null;
  const d = await gh(
    `/repos/${blog.repo}/actions/workflows/${blog.generator}/runs?per_page=1`
  );
  const run = d?.workflow_runs?.[0];
  return run
    ? { status: run.status, conclusion: run.conclusion, url: run.html_url, at: run.created_at }
    : null;
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
