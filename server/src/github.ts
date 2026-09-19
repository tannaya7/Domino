import { execSync } from 'node:child_process'

const GITHUB_API = 'https://api.github.com'

let cachedToken: string | null | undefined
let ssmFetchPromise: Promise<string | null> | undefined

function getRegion(): string {
  return process.env.AWS_REGION ?? 'us-east-1'
}

/** Fetches a SecureString from SSM Parameter Store. Returns null (never throws) on any failure —
 * missing param, no IAM permission, network — so callers can fall through to another source. */
async function fetchFromSsm(paramName: string): Promise<string | null> {
  try {
    const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm')
    const client = new SSMClient({ region: getRegion() })
    const result = await client.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }))
    return result.Parameter?.Value ?? null
  } catch {
    return null
  }
}

/**
 * Resolves the GitHub token once per cold start and caches it for the process's lifetime: an SSM
 * SecureString (GITHUB_TOKEN_SSM_PARAM) first when configured — the deployed path, never a plain
 * env var — then GITHUB_TOKEN, then the local `gh` CLI's token. Returns undefined if none of these
 * resolve, which falls back to unauthenticated (lower-rate-limit) GitHub API calls.
 */
async function getGithubToken(): Promise<string | undefined> {
  if (cachedToken !== undefined) return cachedToken ?? undefined

  const ssmParam = process.env.GITHUB_TOKEN_SSM_PARAM
  if (ssmParam) {
    if (!ssmFetchPromise) ssmFetchPromise = fetchFromSsm(ssmParam)
    const fromSsm = await ssmFetchPromise
    if (fromSsm) {
      cachedToken = fromSsm
      return cachedToken
    }
  }

  if (process.env.GITHUB_TOKEN) {
    cachedToken = process.env.GITHUB_TOKEN
    return cachedToken
  }
  try {
    cachedToken = execSync('gh auth token', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    cachedToken = null
  }
  return cachedToken ?? undefined
}

export class GithubApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GithubApiError'
    this.status = status
  }
}

async function githubFetch(path: string): Promise<Response> {
  const token = await getGithubToken()
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'blast-radius-mapper',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })

  if (!res.ok) {
    if (res.status === 404) {
      throw new GithubApiError('Repository or resource not found (it may be private or the URL is wrong).', 404)
    }
    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining')
      if (remaining === '0') {
        throw new GithubApiError('GitHub API rate limit exceeded. Try again later or set GITHUB_TOKEN.', 403)
      }
      throw new GithubApiError('Access to this GitHub resource was forbidden.', 403)
    }
    throw new GithubApiError(`GitHub API request failed with status ${res.status}.`, res.status)
  }

  return res
}

export interface ParsedRepoUrl {
  owner: string
  repo: string
}

/**
 * Accepts the shapes people actually paste: a bare `.git` clone URL, a trailing slash, a
 * `/tree/<branch>` (or `/blob/<branch>/...`) suffix, and stray query/hash fragments. Only the
 * owner/repo is extracted here — a `/tree/<branch>` suffix is normalized away, not resolved to
 * that specific branch (analyzeRepo still uses the repo's default branch).
 */
export function parseRepoUrl(url: string): ParsedRepoUrl {
  const match = url
    .trim()
    .match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?\/?(?:(?:tree|blob)\/[^?#]*)?(?:[?#].*)?$/)
  if (!match) {
    throw new Error('That does not look like a GitHub repo URL (expected github.com/owner/repo).')
  }
  return { owner: match[1], repo: match[2] }
}

export interface ParsedPrUrl extends ParsedRepoUrl {
  prNumber: number
}

export function parsePrUrl(url: string): ParsedPrUrl {
  const match = url.trim().match(/github\.com[/:]([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!match) {
    throw new Error('That does not look like a GitHub PR URL (expected github.com/owner/repo/pull/123).')
  }
  return { owner: match[1], repo: match[2], prNumber: Number(match[3]) }
}

// Strict: PR Resilience Gate accepts one shape only — https, github.com exactly (not a lookalike
// host, not an SSH remote, no query/hash/extra path segments). This is deliberately narrower than
// parsePrUrl above (which stays lenient for the existing manual "Pull Request" tab) — a gate meant
// to run unattended in CI is a more sensitive place to be permissive about what counts as "GitHub".
const STRICT_GITHUB_PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)\/?$/

export function parseStrictPrUrl(url: string): ParsedPrUrl {
  const match = STRICT_GITHUB_PR_URL.exec(url.trim())
  if (!match) {
    throw new Error(
      'Expected exactly https://github.com/{owner}/{repo}/pull/{n} — no other host, scheme, query string, or path is accepted.',
    )
  }
  return { owner: match[1], repo: match[2], prNumber: Number(match[3]) }
}

export async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await githubFetch(`/repos/${owner}/${repo}`)
  const data = (await res.json()) as { default_branch: string }
  return data.default_branch
}

/** The commit SHA a branch currently points at — pinned into demo snapshots so "snapshot @ <sha>" is real. */
export async function getBranchSha(owner: string, repo: string, branch: string): Promise<string> {
  const res = await githubFetch(`/repos/${owner}/${repo}/branches/${branch}`)
  const data = (await res.json()) as { commit: { sha: string } }
  return data.commit.sha
}

export interface RepoTreeEntry {
  path: string
  type: 'blob' | 'tree'
}

export async function getRepoTree(owner: string, repo: string, branch: string): Promise<RepoTreeEntry[]> {
  const res = await githubFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`)
  const data = (await res.json()) as { tree: RepoTreeEntry[]; truncated: boolean }
  return data.tree
}

/** Raw file content is fetched from raw.githubusercontent.com — not subject to the core API rate limit. */
export async function getRawFileContent(
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Promise<string> {
  const res = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`,
  )
  if (!res.ok) {
    throw new GithubApiError(`Could not fetch raw content for ${path}.`, res.status)
  }
  return res.text()
}

export interface PullRequestMeta {
  base: { ref: string; sha: string; owner: string; repo: string }
}

export async function getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestMeta> {
  const res = await githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`)
  const data = (await res.json()) as {
    base: { ref: string; sha: string; repo: { owner: { login: string }; name: string } }
  }
  return {
    base: {
      ref: data.base.ref,
      sha: data.base.sha,
      owner: data.base.repo.owner.login,
      repo: data.base.repo.name,
    },
  }
}

export interface FullPullRequestMeta {
  number: number
  title: string
  base: { ref: string; sha: string; owner: string; repo: string }
  /** null when the source fork/branch has been deleted since the PR was opened — GitHub itself
   * returns head.repo: null in that case; there is no content left to fetch for it. */
  head: { ref: string; sha: string; owner: string; repo: string } | null
}

/** Fuller PR metadata for the resilience gate — includes head (which may be a fork, hence its own
 * owner/repo, not assumed to equal base's) needed to fetch raw content on both sides of the diff. */
export async function getFullPullRequest(owner: string, repo: string, prNumber: number): Promise<FullPullRequestMeta> {
  const res = await githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`)
  const data = (await res.json()) as {
    number: number
    title: string
    base: { ref: string; sha: string; repo: { owner: { login: string }; name: string } }
    head: { ref: string; sha: string; repo: { owner: { login: string }; name: string } | null }
  }
  return {
    number: data.number,
    title: data.title,
    base: {
      ref: data.base.ref,
      sha: data.base.sha,
      owner: data.base.repo.owner.login,
      repo: data.base.repo.name,
    },
    head: data.head.repo
      ? { ref: data.head.ref, sha: data.head.sha, owner: data.head.repo.owner.login, repo: data.head.repo.name }
      : null,
  }
}

export interface PullRequestFile {
  filename: string
  status: string
}

export async function getPullRequestFiles(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestFile[]> {
  const files: PullRequestFile[] = []
  let page = 1
  while (true) {
    const res = await githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`)
    const batch = (await res.json()) as PullRequestFile[]
    files.push(...batch)
    if (batch.length < 100) break
    page += 1
  }
  return files
}
