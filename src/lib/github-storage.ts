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
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers ?? {}),
    },
  });
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
  // application/vnd.github.raw returns the raw file content directly — no base64, no size limit
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${FILE_PATH}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (!text || text.trim() === '') return null;
  return JSON.parse(text);
}

export async function saveToRepo(token: string, repo: string, state: unknown): Promise<void> {
  const json = JSON.stringify(state);
  // Use UTF-8 safe base64 encoding
  const content = btoa(unescape(encodeURIComponent(json)));

  // Step 1: create a blob (no size limit)
  const blobRes = await ghFetch(token, `/repos/${repo}/git/blobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, encoding: 'base64' }),
  });
  if (!blobRes.ok) {
    const e = await blobRes.json().catch(() => ({}));
    throw new Error(`GitHub blob ${blobRes.status}: ${(e as { message?: string }).message ?? ''}`);
  }
  const { sha: blobSha } = await blobRes.json();

  // Step 2: get current branch tip
  const refRes = await ghFetch(token, `/repos/${repo}/git/ref/heads/main`);
  if (!refRes.ok) throw new Error(`GitHub ref ${refRes.status}`);
  const { object: { sha: commitSha } } = await refRes.json();

  // Step 3: get current tree SHA
  const commitRes = await ghFetch(token, `/repos/${repo}/git/commits/${commitSha}`);
  if (!commitRes.ok) throw new Error(`GitHub commit ${commitRes.status}`);
  const { tree: { sha: treeSha } } = await commitRes.json();

  // Step 4: create new tree with our file
  const treeRes = await ghFetch(token, `/repos/${repo}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: treeSha,
      tree: [{ path: FILE_PATH, mode: '100644', type: 'blob', sha: blobSha }],
    }),
  });
  if (!treeRes.ok) throw new Error(`GitHub tree ${treeRes.status}`);
  const { sha: newTreeSha } = await treeRes.json();

  // Step 5: create commit
  const newCommitRes = await ghFetch(token, `/repos/${repo}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Update Queued data', tree: newTreeSha, parents: [commitSha] }),
  });
  if (!newCommitRes.ok) throw new Error(`GitHub newcommit ${newCommitRes.status}`);
  const { sha: newCommitSha } = await newCommitRes.json();

  // Step 6: update branch ref
  const updateRes = await ghFetch(token, `/repos/${repo}/git/refs/heads/main`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: newCommitSha }),
  });
  if (!updateRes.ok) {
    const e = await updateRes.json().catch(() => ({}));
    throw new Error(`GitHub ref update ${updateRes.status}: ${(e as { message?: string }).message ?? ''}`);
  }
}
