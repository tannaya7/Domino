import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCache } from '../src/cache'

const mockGraph = {
  nodes: [
    { id: 'src/a.ts', label: 'src/a.ts', type: 'file' },
    { id: 'src/b.ts', label: 'src/b.ts', type: 'file' },
    { id: 'src/c.ts', label: 'src/c.ts', type: 'file' },
    { id: 'src/d.ts', label: 'src/d.ts', type: 'file' },
  ],
  // a -> b -> c ; d -> b   (b breaking affects a and d; b depends on c)
  edges: [
    { from: 'src/a.ts', to: 'src/b.ts' },
    { from: 'src/b.ts', to: 'src/c.ts' },
    { from: 'src/d.ts', to: 'src/b.ts' },
  ],
}

vi.mock('../src/github', () => ({
  parsePrUrl: vi.fn(() => ({ owner: 'octocat', repo: 'hello', prNumber: 7 })),
  getPullRequest: vi.fn(async () => ({ base: { ref: 'main', owner: 'octocat', repo: 'hello' } })),
  getPullRequestFiles: vi.fn(async () => [
    { filename: 'src/b.ts', status: 'modified' },
    { filename: 'README.md', status: 'modified' },
  ]),
}))

vi.mock('../src/repoParser', () => ({
  analyzeRepo: vi.fn(async () => ({
    graph: mockGraph,
    truncated: false,
    filesScanned: 4,
    owner: 'octocat',
    repo: 'hello',
    branch: 'main',
  })),
}))

beforeEach(() => {
  clearCache()
})

describe('analyzePr', () => {
  it('maps changed files to graph nodes and computes combined blast radius', async () => {
    const { analyzePr } = await import('../src/prAnalyzer')
    const result = await analyzePr('https://github.com/octocat/hello/pull/7')

    expect(result.changedNodes).toEqual([
      { id: 'src/b.ts', label: 'src/b.ts', type: 'file', blastRadiusCount: 3 },
    ])
    expect(result.unmatchedFiles).toEqual(['README.md'])

    // b's downstream = {a, d}, upstream = {c}
    expect(new Set(result.combinedBlastRadius.downstream)).toEqual(new Set(['src/a.ts', 'src/d.ts']))
    expect(new Set(result.combinedBlastRadius.upstream)).toEqual(new Set(['src/c.ts']))
    expect(result.combinedBlastRadius.totalCount).toBe(3)

    expect(result.highestRisk).toEqual({
      nodeId: 'src/b.ts',
      label: 'src/b.ts',
      count: 3,
      risk: 'Medium',
    })
  })

  it('excludes changed nodes from their own combined blast radius when multiple change together', async () => {
    const github = await import('../src/github')
    vi.mocked(github.getPullRequestFiles).mockResolvedValueOnce([
      { filename: 'src/a.ts', status: 'modified' },
      { filename: 'src/b.ts', status: 'modified' },
    ])

    const { analyzePr } = await import('../src/prAnalyzer')
    const result = await analyzePr('https://github.com/octocat/hello/pull/7')

    // a and b are both changed; a is b's downstream, so it must not appear in combined downstream
    expect(result.combinedBlastRadius.downstream).not.toContain('src/a.ts')
    expect(result.combinedBlastRadius.downstream).toContain('src/d.ts')
    expect(new Set(result.combinedBlastRadius.upstream)).toEqual(new Set(['src/c.ts']))
  })
})
