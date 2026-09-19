import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseRepoUrl, parseStrictPrUrl } from '../src/github'

const ssmSendMock = vi.fn()

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn().mockImplementation(function SSMClient() {
    return { send: ssmSendMock }
  }),
  GetParameterCommand: vi.fn().mockImplementation(function GetParameterCommand(input: unknown) {
    return { input }
  }),
}))

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => {
    throw new Error('gh CLI not available in this test environment')
  }),
}))

const originalFetch = global.fetch

function mockGithubApiOnce() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ default_branch: 'main' }),
    headers: new Headers(),
  }) as unknown as typeof fetch
}

function authHeaderSent(): string | null {
  const mockedFetch = global.fetch as ReturnType<typeof vi.fn>
  const [, init] = mockedFetch.mock.calls[0]
  return (init?.headers as Record<string, string>)?.Authorization ?? null
}

async function importFreshGithub() {
  vi.resetModules()
  return import('../src/github')
}

describe('getGithubToken (via getDefaultBranch)', () => {
  beforeEach(() => {
    ssmSendMock.mockReset()
    delete process.env.GITHUB_TOKEN_SSM_PARAM
    delete process.env.GITHUB_TOKEN
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.GITHUB_TOKEN_SSM_PARAM
    delete process.env.GITHUB_TOKEN
  })

  it('uses the SSM SecureString when GITHUB_TOKEN_SSM_PARAM is configured', async () => {
    process.env.GITHUB_TOKEN_SSM_PARAM = '/blast-radius/github-token'
    ssmSendMock.mockResolvedValueOnce({ Parameter: { Value: 'ssm-token-123' } })
    mockGithubApiOnce()

    const { getDefaultBranch } = await importFreshGithub()
    await getDefaultBranch('octocat', 'hello')

    expect(authHeaderSent()).toBe('Bearer ssm-token-123')
    const sentParam = ssmSendMock.mock.calls[0][0].input
    expect(sentParam).toEqual({ Name: '/blast-radius/github-token', WithDecryption: true })
  })

  it('falls back to GITHUB_TOKEN when SSM is not configured', async () => {
    process.env.GITHUB_TOKEN = 'env-token-456'
    mockGithubApiOnce()

    const { getDefaultBranch } = await importFreshGithub()
    await getDefaultBranch('octocat', 'hello')

    expect(authHeaderSent()).toBe('Bearer env-token-456')
    expect(ssmSendMock).not.toHaveBeenCalled()
  })

  it('falls back to GITHUB_TOKEN when the SSM lookup fails', async () => {
    process.env.GITHUB_TOKEN_SSM_PARAM = '/blast-radius/github-token'
    process.env.GITHUB_TOKEN = 'env-token-fallback'
    ssmSendMock.mockRejectedValueOnce(new Error('AccessDeniedException'))
    mockGithubApiOnce()

    const { getDefaultBranch } = await importFreshGithub()
    await getDefaultBranch('octocat', 'hello')

    expect(authHeaderSent()).toBe('Bearer env-token-fallback')
  })

  it('makes an unauthenticated request when no token source resolves', async () => {
    mockGithubApiOnce()

    const { getDefaultBranch } = await importFreshGithub()
    await getDefaultBranch('octocat', 'hello')

    expect(authHeaderSent()).toBeNull()
  })

  it('caches the resolved token — a second call does not hit SSM again', async () => {
    process.env.GITHUB_TOKEN_SSM_PARAM = '/blast-radius/github-token'
    ssmSendMock.mockResolvedValueOnce({ Parameter: { Value: 'ssm-token-once' } })
    mockGithubApiOnce()

    const { getDefaultBranch } = await importFreshGithub()
    await getDefaultBranch('octocat', 'hello')
    await getDefaultBranch('octocat', 'other-repo')

    expect(ssmSendMock).toHaveBeenCalledTimes(1)
  })
})

describe('parseRepoUrl', () => {
  it('parses a plain repo URL', () => {
    expect(parseRepoUrl('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('normalizes a trailing slash', () => {
    expect(parseRepoUrl('https://github.com/owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('normalizes a .git suffix', () => {
    expect(parseRepoUrl('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('normalizes an SSH clone URL', () => {
    expect(parseRepoUrl('git@github.com:owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('normalizes a /tree/<branch> suffix', () => {
    expect(parseRepoUrl('https://github.com/owner/repo/tree/main')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('normalizes a /tree/<branch>/<path> suffix', () => {
    expect(parseRepoUrl('https://github.com/owner/repo/tree/main/src/lib')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('normalizes a /blob/<branch>/<file> suffix', () => {
    expect(parseRepoUrl('https://github.com/owner/repo/blob/main/README.md')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('normalizes a query string', () => {
    expect(parseRepoUrl('https://github.com/owner/repo?tab=readme-ov-file')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('rejects a non-GitHub URL', () => {
    expect(() => parseRepoUrl('https://gitlab.com/owner/repo')).toThrow(/does not look like a github repo url/i)
  })
})

describe('parseStrictPrUrl (PR Resilience Gate)', () => {
  it('parses a canonical PR URL', () => {
    expect(parseStrictPrUrl('https://github.com/owner/repo/pull/42')).toEqual({
      owner: 'owner',
      repo: 'repo',
      prNumber: 42,
    })
  })

  it('accepts a trailing slash', () => {
    expect(parseStrictPrUrl('https://github.com/owner/repo/pull/42/')).toEqual({
      owner: 'owner',
      repo: 'repo',
      prNumber: 42,
    })
  })

  it('rejects a non-GitHub host, even one that contains github.com', () => {
    expect(() => parseStrictPrUrl('https://github.com.evil.example/owner/repo/pull/42')).toThrow()
    expect(() => parseStrictPrUrl('https://evil-github.com/owner/repo/pull/42')).toThrow()
    expect(() => parseStrictPrUrl('https://gitlab.com/owner/repo/pull/42')).toThrow()
  })

  it('rejects a non-https scheme', () => {
    expect(() => parseStrictPrUrl('http://github.com/owner/repo/pull/42')).toThrow()
  })

  it('rejects an SSH-style remote (accepted by the lenient parseRepoUrl, not here)', () => {
    expect(() => parseStrictPrUrl('git@github.com:owner/repo/pull/42')).toThrow()
  })

  it('rejects extra path segments, query strings, and fragments', () => {
    expect(() => parseStrictPrUrl('https://github.com/owner/repo/pull/42/files')).toThrow()
    expect(() => parseStrictPrUrl('https://github.com/owner/repo/pull/42?tab=files')).toThrow()
    expect(() => parseStrictPrUrl('https://github.com/owner/repo/pull/42#discussion')).toThrow()
  })

  it('rejects a repo URL with no PR number', () => {
    expect(() => parseStrictPrUrl('https://github.com/owner/repo')).toThrow()
  })
})

describe('getBranchSha', () => {
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns the branch head commit sha', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ commit: { sha: 'abc123def' } }),
      headers: new Headers(),
    }) as unknown as typeof fetch

    const { getBranchSha } = await importFreshGithub()
    expect(await getBranchSha('octocat', 'hello', 'main')).toBe('abc123def')
  })
})
