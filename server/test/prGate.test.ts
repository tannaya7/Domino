import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCache, setCachedGraph } from '../src/cache'
import { GATE_COMMENT_MARKER } from '../src/gateMarkdown'
import { GithubApiError } from '../src/github'
import type { Vendor } from '../../src/lib/types'

const mockGraph = {
  nodes: [
    { id: 'src/index.ts', label: 'src/index.ts', type: 'file' },
    { id: 'src/lib/payments.ts', label: 'src/lib/payments.ts', type: 'file' },
  ],
  edges: [{ from: 'src/index.ts', to: 'src/lib/payments.ts' }],
}

function baselineWith(vendors: Vendor[]) {
  return {
    graph: mockGraph,
    truncated: false,
    filesScanned: 2,
    vendors,
    iacSubstrates: [],
    entrypoints: ['src/index.ts'],
    importResolution: { total: 0, resolved: 0 },
    skippedOversizedFiles: 0,
    owner: 'acme',
    repo: 'widget',
    branch: 'main',
  }
}

const { getFullPullRequestMock, getPullRequestFilesMock, getRawFileContentMock, getDefaultBranchMock } = vi.hoisted(() => ({
  getFullPullRequestMock: vi.fn(),
  getPullRequestFilesMock: vi.fn(),
  getRawFileContentMock: vi.fn(),
  getDefaultBranchMock: vi.fn(async () => 'main'),
}))

vi.mock('../src/github', async () => {
  const actual = await vi.importActual<typeof import('../src/github')>('../src/github')
  return {
    ...actual,
    getFullPullRequest: getFullPullRequestMock,
    getPullRequestFiles: getPullRequestFilesMock,
    getRawFileContent: getRawFileContentMock,
    getDefaultBranch: getDefaultBranchMock,
  }
})

beforeEach(async () => {
  clearCache()
  const { clearGateCache } = await import('../src/prGate')
  clearGateCache()
  getFullPullRequestMock.mockReset()
  getPullRequestFilesMock.mockReset()
  getRawFileContentMock.mockReset()
  getDefaultBranchMock.mockClear()

  getFullPullRequestMock.mockResolvedValue({
    number: 7,
    title: 'Add payments',
    base: { ref: 'main', sha: 'base-sha', owner: 'acme', repo: 'widget' },
    head: { ref: 'feature/payments', sha: 'head-sha', owner: 'acme', repo: 'widget' },
  })
})

describe('runPrGate — vendor delta (mocked GitHub)', () => {
  it('flags a vendor introduced at head that is absent from the cached baseline', async () => {
    await setCachedGraph('acme/widget', baselineWith([]))
    getPullRequestFilesMock.mockResolvedValue([{ filename: 'src/lib/payments.ts', status: 'added' }])
    getRawFileContentMock.mockImplementation(async (_owner: string, _repo: string, ref: string) => {
      if (ref === 'base-sha') throw new GithubApiError('not found', 404)
      return "import Stripe from 'stripe'\n"
    })

    const { runPrGate } = await import('../src/prGate')
    const result = await runPrGate({ prUrl: 'https://github.com/acme/widget/pull/7' })

    expect(result.newVendors.map((v) => v.key)).toEqual(['stripe'])
    expect(result.newVendors[0].substrate).toEqual(['aws'])
    expect(result.newVendors[0].files).toEqual(['src/lib/payments.ts'])
    expect(result.markdown.startsWith(GATE_COMMENT_MARKER)).toBe(true)
    expect(result.markdown).toContain('Stripe')
    expect(result.policy).toEqual({ status: 'info', violations: [] })
  })

  it('does not flag a vendor that already exists in the cached baseline', async () => {
    await setCachedGraph(
      'acme/widget',
      baselineWith([
        {
          key: 'stripe',
          vendor: 'Stripe',
          tier: 'payments',
          substrate: ['aws'],
          sla: 0.9999,
          detectedVia: ['import:stripe'],
          detectedInFiles: ['src/old-payments.ts'],
        },
      ]),
    )
    getPullRequestFilesMock.mockResolvedValue([{ filename: 'src/lib/payments.ts', status: 'added' }])
    getRawFileContentMock.mockImplementation(async (_owner: string, _repo: string, ref: string) => {
      if (ref === 'base-sha') throw new GithubApiError('not found', 404)
      return "import Stripe from 'stripe'\n"
    })

    const { runPrGate } = await import('../src/prGate')
    const result = await runPrGate({ prUrl: 'https://github.com/acme/widget/pull/7' })

    expect(result.newVendors).toEqual([])
  })

  it('does not flag a vendor that already existed in this exact changed file at base', async () => {
    await setCachedGraph('acme/widget', baselineWith([]))
    getPullRequestFilesMock.mockResolvedValue([{ filename: 'src/lib/payments.ts', status: 'modified' }])
    // Same vendor import present on BOTH sides — a refactor, not a new vendor.
    getRawFileContentMock.mockResolvedValue("import Stripe from 'stripe'\n")

    const { runPrGate } = await import('../src/prGate')
    const result = await runPrGate({ prUrl: 'https://github.com/acme/widget/pull/7' })

    expect(result.newVendors).toEqual([])
  })

  it('detects a new vendor from a manifest file (package.json)', async () => {
    await setCachedGraph('acme/widget', baselineWith([]))
    getPullRequestFilesMock.mockResolvedValue([{ filename: 'package.json', status: 'modified' }])
    getRawFileContentMock.mockImplementation(async (_owner: string, _repo: string, ref: string) => {
      if (ref === 'base-sha') return JSON.stringify({ dependencies: {} })
      return JSON.stringify({ dependencies: { stripe: '^14.0.0' } })
    })

    const { runPrGate } = await import('../src/prGate')
    const result = await runPrGate({ prUrl: 'https://github.com/acme/widget/pull/7' })

    expect(result.newVendors.map((v) => v.key)).toEqual(['stripe'])
  })

  it('reuses blast-radius logic for entrypointsAffected', async () => {
    await setCachedGraph('acme/widget', baselineWith([]))
    getPullRequestFilesMock.mockResolvedValue([{ filename: 'src/lib/payments.ts', status: 'modified' }])
    getRawFileContentMock.mockResolvedValue('export const x = 1\n')

    const { runPrGate } = await import('../src/prGate')
    const result = await runPrGate({ prUrl: 'https://github.com/acme/widget/pull/7' })

    // payments.ts is upstream of index.ts, which is the repo's only entrypoint.
    expect(result.entrypointsAffected).toEqual(['src/index.ts'])
  })

  it('rejects a PR whose fork has been deleted (head.repo is null)', async () => {
    await setCachedGraph('acme/widget', baselineWith([]))
    getFullPullRequestMock.mockResolvedValue({
      number: 7,
      title: 'Add payments',
      base: { ref: 'main', sha: 'base-sha', owner: 'acme', repo: 'widget' },
      head: null,
    })

    const { runPrGate } = await import('../src/prGate')
    await expect(runPrGate({ prUrl: 'https://github.com/acme/widget/pull/7' })).rejects.toThrow(/fork/i)
  })

  it('rejects a non-strict PR URL before ever calling GitHub', async () => {
    const { runPrGate } = await import('../src/prGate')
    await expect(runPrGate({ prUrl: 'https://gitlab.com/acme/widget/pull/7' })).rejects.toThrow()
    expect(getFullPullRequestMock).not.toHaveBeenCalled()
  })

  it('applies a supplied policy and fails when it is violated', async () => {
    await setCachedGraph('acme/widget', baselineWith([]))
    getPullRequestFilesMock.mockResolvedValue([{ filename: 'src/lib/payments.ts', status: 'added' }])
    getRawFileContentMock.mockImplementation(async (_owner: string, _repo: string, ref: string) => {
      if (ref === 'base-sha') throw new GithubApiError('not found', 404)
      return "import Stripe from 'stripe'\n"
    })

    const { runPrGate } = await import('../src/prGate')
    const result = await runPrGate({
      prUrl: 'https://github.com/acme/widget/pull/7',
      policy: { maxNewVendorsPerPr: 0, failOn: 'fail' },
    })

    expect(result.policy.status).toBe('fail')
    expect(result.policy.violations[0].rule).toBe('maxNewVendorsPerPr')
  })

  it('caches by (repo, headSha): a second call for the same PR does not re-fetch changed files', async () => {
    await setCachedGraph('acme/widget', baselineWith([]))
    getPullRequestFilesMock.mockResolvedValue([{ filename: 'src/lib/payments.ts', status: 'added' }])
    getRawFileContentMock.mockImplementation(async (_owner: string, _repo: string, ref: string) => {
      if (ref === 'base-sha') throw new GithubApiError('not found', 404)
      return "import Stripe from 'stripe'\n"
    })

    const { runPrGate } = await import('../src/prGate')
    await runPrGate({ prUrl: 'https://github.com/acme/widget/pull/7' })
    await runPrGate({ prUrl: 'https://github.com/acme/widget/pull/7' })

    expect(getPullRequestFilesMock).toHaveBeenCalledTimes(1)
  })

  it('re-evaluates policy on a cache hit instead of serving a stale verdict for a different policy', async () => {
    await setCachedGraph('acme/widget', baselineWith([]))
    getPullRequestFilesMock.mockResolvedValue([{ filename: 'src/lib/payments.ts', status: 'added' }])
    getRawFileContentMock.mockImplementation(async (_owner: string, _repo: string, ref: string) => {
      if (ref === 'base-sha') throw new GithubApiError('not found', 404)
      return "import Stripe from 'stripe'\n"
    })

    const { runPrGate } = await import('../src/prGate')
    const first = await runPrGate({ prUrl: 'https://github.com/acme/widget/pull/7' })
    expect(first.policy.status).toBe('info')

    const second = await runPrGate({
      prUrl: 'https://github.com/acme/widget/pull/7',
      policy: { maxNewVendorsPerPr: 0, failOn: 'fail' },
    })
    expect(second.policy.status).toBe('fail')
    expect(getPullRequestFilesMock).toHaveBeenCalledTimes(1) // still cached — only policy re-evaluated
  })
})
