const TOKEN_KEY = 'github-pat';
const REPO_KEY = 'github-repo'; // format: "owner/repo"
const FILE_PATH = 'queued-data.json';

export function saveToken(token: string) { localStorage.setItem(TOKEN_KEY, token); }
export function loadToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

export function saveRepo(repo: string) { localStorage.setItem(REPO_KEY, repo); }
export function loadRepo(): string | null { return localStorage.getItem(REPO_KEY); }
export function clearRepo() { localStorage.removeItem(REPO_KEY); }

async function ghFetch(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  });
  return res;
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await ghFetch(token, '/user');
    return res.ok;
  } catch {
    return false;
  }
}

export async function validateRepo(token: string, repo: string): Promise<boolean> {
  try {
    const res = await ghFetch(token, `/repos/${repo}`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadFromRepo(token: string, repo: string): Promise<Record<string, unknown> | null> {
  const res = await ghFetch(token, `/repos/${repo}/contents/${FILE_PATH}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = await res.json();
  // Content is base64-encoded
  const content = atob(data.content.replace(/\n/g, ''));
  if (!content || content === '{}') return null;
  return JSON.parse(content);
}

export async function saveToRepo(token: string, repo: string, state: unknown): Promise<void> {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(state))));

  // Get current SHA (needed for updates)
  const getRes = await ghFetch(token, `/repos/${repo}/contents/${FILE_PATH}`);
  let sha: string | undefined;
  if (getRes.ok) {
    const existing = await getRes.json();
    sha = existing.sha;
  } else if (getRes.status !== 404) {
    throw new Error(`GitHub ${getRes.status}`);
  }

  const body: Record<string, unknown> = {
    message: 'Update Queued data',
    content,
  };
  if (sha) body.sha = sha;

  const putRes = await ghFetch(token, `/repos/${repo}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(`GitHub ${putRes.status}: ${(err as { message?: string }).message ?? ''}`);
  }
}
