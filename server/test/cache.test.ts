import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCache, getCachedGraph, setCachedGraph } from '../src/cache'
import type { AnalyzeRepoResult } from '../src/repoParser'

const sampleResult: AnalyzeRepoResult = {
  graph: { nodes: [{ id: 'a', label: 'a', type: 'file' }], edges: [] },
  truncated: false,
  filesScanned: 1,
  owner: 'octocat',
  repo: 'hello',
  branch: 'main',
}

beforeEach(() => {
  clearCache()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('graph cache', () => {
  it('returns null for a repo that has never been cached', () => {
    expect(getCachedGraph('octocat/hello')).toBeNull()
  })

  it('returns the cached graph before it expires', () => {
    setCachedGraph('octocat/hello', sampleResult, 1000)
    expect(getCachedGraph('octocat/hello')).toEqual(sampleResult)
  })

  it('expires an entry after its TTL elapses', () => {
    vi.useFakeTimers()
    setCachedGraph('octocat/hello', sampleResult, 1000)
    vi.advanceTimersByTime(1001)
    expect(getCachedGraph('octocat/hello')).toBeNull()
  })
})
