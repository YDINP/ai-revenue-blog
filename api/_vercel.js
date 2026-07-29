// Vercel 배포 상태 조회 / 재배포 (VERCEL_TOKEN 있을 때만)
// 토큰이 없으면 호출부가 GitHub 빈 커밋 폴백으로 대체한다.

const API = 'https://api.vercel.com';

export function hasVercelToken() {
  return !!process.env.VERCEL_TOKEN;
}

async function vc(path, opts = {}) {
  const t = process.env.VERCEL_TOKEN;
  if (!t) throw new Error('VERCEL_TOKEN 미설정');
  const team = process.env.VERCEL_TEAM_ID;
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API}${path}${team ? `${sep}teamId=${team}` : ''}`;
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Vercel ${r.status}: ${data?.error?.message || 'unknown'}`);
  return data;
}

// 최근 배포 1건 상태
export async function latestDeployment(blog) {
  const d = await vc(`/v6/deployments?app=${blog.vercel}&limit=1&target=production`);
  const dep = d?.deployments?.[0];
  if (!dep) return null;
  return {
    state: dep.state || dep.readyState,   // READY | BUILDING | ERROR | QUEUED | CANCELED
    url: `https://${dep.url}`,
    createdAt: dep.created || dep.createdAt,
    commit: dep.meta?.githubCommitMessage?.split('\n')[0] || '',
    sha: (dep.meta?.githubCommitSha || '').slice(0, 7),
  };
}

// 최신 프로덕션 배포를 그대로 다시 배포 (rebuild)
export async function redeploy(blog) {
  const d = await vc(`/v6/deployments?app=${blog.vercel}&limit=1&target=production`);
  const dep = d?.deployments?.[0];
  if (!dep) throw new Error('이전 배포 없음');
  const created = await vc(`/v13/deployments`, {
    method: 'POST',
    body: JSON.stringify({
      name: blog.vercel,
      deploymentId: dep.uid || dep.id,
      target: 'production',
      meta: { triggeredBy: 'telegram-bot' },
    }),
  });
  return { url: `https://${created.url}`, id: created.id };
}
