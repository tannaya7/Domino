import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
