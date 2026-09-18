import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyzeRepoResult } from '../src/repoParser'

const fixtureResult: AnalyzeRepoResult = {
  graph: { nodes: [{ id: 'a', label: 'a', type: 'file' }], edges: [] },
  truncated: false,
  filesScanned: 1,
  vendors: [],
  iacSubstrates: [],
  owner: 'octocat',
  repo: 'hello',
  branch: 'main',
}

vi.mock('../src/repoParser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repoParser')>()
  return { ...actual, analyzeRepo: vi.fn().mockResolvedValue(fixtureResult) }
})

function event(overrides: Partial<Parameters<typeof import('../src/lambdaHandler').handler>[0]>) {
  return {
    rawPath: '/analyze-repo',
    requestContext: { http: { method: 'POST' } },
    body: null,
    ...overrides,
  }
}

describe('lambda handler', () => {
  beforeEach(async () => {
    const { clearCache } = await import('../src/cache')
    clearCache()
  })

  it('handles an OPTIONS preflight request', async () => {
    const { handler } = await import('../src/lambdaHandler')
    const result = await handler(event({ requestContext: { http: { method: 'OPTIONS' } } }))
    expect(result.statusCode).toBe(204)
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*')
  })

  it('rejects a non-POST/OPTIONS method with 404', async () => {
    const { handler } = await import('../src/lambdaHandler')
    const result = await handler(event({ requestContext: { http: { method: 'GET' } } }))
    expect(result.statusCode).toBe(404)
  })

  it('routes a POST body to the same logic as the Node server', async () => {
    const { handler } = await import('../src/lambdaHandler')
    const result = await handler(event({ body: JSON.stringify({ repoUrl: 'https://github.com/octocat/hello' }) }))

    expect(result.statusCode).toBe(200)
    const parsed = JSON.parse(result.body)
    expect(parsed.meta.owner).toBe('octocat')
  })

  it('decodes a base64-encoded body', async () => {
    const { handler } = await import('../src/lambdaHandler')
    const raw = JSON.stringify({ repoUrl: 'https://github.com/octocat/hello' })
    const result = await handler(event({ body: Buffer.from(raw).toString('base64'), isBase64Encoded: true }))
    expect(result.statusCode).toBe(200)
  })

  it('returns 400 for malformed JSON instead of throwing', async () => {
    const { handler } = await import('../src/lambdaHandler')
    const result = await handler(event({ body: '{not json' }))
    expect(result.statusCode).toBe(400)
  })

  it('returns 400 for an unknown repo URL via the shared error mapping', async () => {
    const { handler } = await import('../src/lambdaHandler')
    const result = await handler(event({ body: JSON.stringify({ repoUrl: 'not a url' }) }))
    expect(result.statusCode).toBe(400)
  })
})
