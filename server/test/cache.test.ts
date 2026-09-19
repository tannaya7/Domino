import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyzeRepoResult } from '../src/repoParser'

const sendMock = vi.fn()

// Real function/class syntax, not arrow functions — cache.ts calls these with `new`, and an
// arrow-function mock silently fails to construct (vitest warns; the mock never wires up).
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(function DynamoDBClient() {
    return {}
  }),
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn().mockImplementation(() => ({ send: sendMock })) },
  GetCommand: vi.fn().mockImplementation(function GetCommand(input: unknown) {
    return { input, kind: 'Get' }
  }),
  PutCommand: vi.fn().mockImplementation(function PutCommand(input: unknown) {
    return { input, kind: 'Put' }
  }),
}))

const sampleResult: AnalyzeRepoResult = {
  graph: { nodes: [{ id: 'a', label: 'a', type: 'file' }], edges: [] },
  truncated: false,
  filesScanned: 1,
  vendors: [],
  iacSubstrates: [],
  entrypoints: [],
  importResolution: { total: 0, resolved: 0 },
  skippedOversizedFiles: 0,
  owner: 'octocat',
  repo: 'hello',
  branch: 'main',
}

async function importFreshCache() {
  vi.resetModules()
  return import('../src/cache')
}

describe('graph cache — in-memory fallback (DynamoDB not configured)', () => {
  beforeEach(() => {
    delete process.env.DYNAMODB_GRAPH_CACHE_TABLE
    sendMock.mockReset()
  })

  it('returns null for a repo that has never been cached', async () => {
    const { getCachedGraph } = await importFreshCache()
    expect(await getCachedGraph('octocat/hello')).toBeNull()
  })

  it('returns the cached graph before it expires', async () => {
    const { getCachedGraph, setCachedGraph } = await importFreshCache()
    await setCachedGraph('octocat/hello', sampleResult, 1000)
    expect(await getCachedGraph('octocat/hello')).toEqual(sampleResult)
  })

  it('expires an entry after its TTL elapses', async () => {
    vi.useFakeTimers()
    const { getCachedGraph, setCachedGraph } = await importFreshCache()
    await setCachedGraph('octocat/hello', sampleResult, 1000)
    vi.advanceTimersByTime(1001)
    expect(await getCachedGraph('octocat/hello')).toBeNull()
    vi.useRealTimers()
  })

  it('never calls DynamoDB when unconfigured', async () => {
    const { getCachedGraph, setCachedGraph } = await importFreshCache()
    await setCachedGraph('octocat/hello', sampleResult)
    await getCachedGraph('octocat/hello')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('clearCache only clears the in-memory store and never touches DynamoDB', async () => {
    const { clearCache, getCachedGraph, setCachedGraph } = await importFreshCache()
    await setCachedGraph('octocat/hello', sampleResult)
    clearCache()
    expect(await getCachedGraph('octocat/hello')).toBeNull()
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('graph cache — DynamoDB configured', () => {
  beforeEach(() => {
    process.env.DYNAMODB_GRAPH_CACHE_TABLE = 'graph-cache-test'
    sendMock.mockReset()
  })

  afterEach(() => {
    delete process.env.DYNAMODB_GRAPH_CACHE_TABLE
  })

  it('writes through to DynamoDB on set', async () => {
    sendMock.mockResolvedValueOnce({})
    const { setCachedGraph } = await importFreshCache()
    await setCachedGraph('octocat/hello', sampleResult)

    expect(sendMock).toHaveBeenCalledTimes(1)
    const call = sendMock.mock.calls[0][0]
    expect(call.kind).toBe('Put')
    expect(call.input.TableName).toBe('graph-cache-test')
    expect(call.input.Item.repo_url).toBe('octocat/hello')
  })

  it('serves a fresh in-memory hit without calling DynamoDB again', async () => {
    sendMock.mockResolvedValue({})
    const { getCachedGraph, setCachedGraph } = await importFreshCache()
    await setCachedGraph('octocat/hello', sampleResult)
    sendMock.mockClear()

    expect(await getCachedGraph('octocat/hello')).toEqual(sampleResult)
    expect(sendMock).not.toHaveBeenCalled() // in-memory fast path served it, no Get needed
  })

  it('falls through to DynamoDB when the in-memory entry has expired', async () => {
    vi.useFakeTimers()
    const { getCachedGraph, setCachedGraph } = await importFreshCache()
    sendMock.mockResolvedValueOnce({}) // the Put
    await setCachedGraph('octocat/hello', sampleResult, 1000)
    vi.advanceTimersByTime(1001)

    sendMock.mockResolvedValueOnce({
      Item: {
        repo_url: 'octocat/hello',
        graph_data: JSON.stringify(sampleResult),
        created_at: Date.now(),
        ttl_ms: 60_000,
      },
    })
    const result = await getCachedGraph('octocat/hello')
    expect(result).toEqual(sampleResult)
    vi.useRealTimers()
  })

  it('treats a DynamoDB failure as a cache miss instead of throwing', async () => {
    sendMock.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'))
    const { getCachedGraph } = await importFreshCache()
    await expect(getCachedGraph('octocat/hello')).resolves.toBeNull()
  })

  it('does not throw when a DynamoDB write fails — the in-memory store still has the value', async () => {
    sendMock.mockRejectedValueOnce(new Error('AccessDeniedException'))
    const { getCachedGraph, setCachedGraph } = await importFreshCache()
    await expect(setCachedGraph('octocat/hello', sampleResult)).resolves.toBeUndefined()
    expect(await getCachedGraph('octocat/hello')).toEqual(sampleResult)
  })

  it('ignores a DynamoDB item that is past its stored TTL even before native TTL sweeps it', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        repo_url: 'octocat/hello',
        graph_data: JSON.stringify(sampleResult),
        created_at: Date.now() - 120_000,
        ttl_ms: 60_000,
      },
    })
    const { getCachedGraph } = await importFreshCache()
    expect(await getCachedGraph('octocat/hello')).toBeNull()
  })
})
