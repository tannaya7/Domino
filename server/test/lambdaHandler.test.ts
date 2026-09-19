import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyzeRepoResult } from '../src/repoParser'

const fixtureResult: AnalyzeRepoResult = {
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

  it('serves GET /health without routing through routeApi', async () => {
    const { handler } = await import('../src/lambdaHandler')
    const result = await handler(event({ rawPath: '/health', requestContext: { http: { method: 'GET' } } }))
    expect(result.statusCode).toBe(200)
    const parsed = JSON.parse(result.body)
    expect(parsed.ok).toBe(true)
    expect(parsed.integrations).toEqual({ bedrock: false, dynamodb: false, awsHealth: false, sns: false })
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

  it('rejects an oversized plain-text body with 413 before parsing it as JSON', async () => {
    const { handler } = await import('../src/lambdaHandler')
    const oversized = JSON.stringify({ repoUrl: 'x', padding: 'a'.repeat(3 * 1024 * 1024) })
    const result = await handler(event({ body: oversized }))
    expect(result.statusCode).toBe(413)
  })

  it('rejects an oversized base64-encoded body by its DECODED length', async () => {
    const { handler } = await import('../src/lambdaHandler')
    const oversized = JSON.stringify({ repoUrl: 'x', padding: 'a'.repeat(3 * 1024 * 1024) })
    const encoded = Buffer.from(oversized).toString('base64')
    const result = await handler(event({ body: encoded, isBase64Encoded: true }))
    expect(result.statusCode).toBe(413)
  })

  it('accepts a base64-encoded body whose DECODED size is under the limit, even though base64 inflates the encoded string past it', async () => {
    // Base64 inflates size by ~33% — a decoded payload just under 2MB can encode to a string
    // over 2MB. Checking the wrong (encoded) length would reject this; checking decoded length
    // (what this handler does) correctly accepts it.
    const { handler } = await import('../src/lambdaHandler')
    const underLimit = JSON.stringify({ repoUrl: 'https://github.com/octocat/hello', padding: 'a'.repeat(1.7 * 1024 * 1024) })
    const encoded = Buffer.from(underLimit).toString('base64')
    expect(Buffer.byteLength(underLimit, 'utf-8')).toBeLessThan(2 * 1024 * 1024)
    expect(encoded.length).toBeGreaterThan(2 * 1024 * 1024) // encoded form alone would look "too big"
    const result = await handler(event({ body: encoded, isBase64Encoded: true }))
    expect(result.statusCode).toBe(200)
  })

  it('accepts a body comfortably under the size limit', async () => {
    const { handler } = await import('../src/lambdaHandler')
    const result = await handler(event({ body: JSON.stringify({ repoUrl: 'https://github.com/octocat/hello' }) }))
    expect(result.statusCode).toBe(200)
  })

  it('locks CORS to ALLOWED_ORIGIN when configured, instead of "*"', async () => {
    process.env.ALLOWED_ORIGIN = 'https://d111111abcdef8.cloudfront.net'
    try {
      const { handler } = await import('../src/lambdaHandler')
      const result = await handler(event({ requestContext: { http: { method: 'OPTIONS' } } }))
      expect(result.headers['Access-Control-Allow-Origin']).toBe('https://d111111abcdef8.cloudfront.net')
    } finally {
      delete process.env.ALLOWED_ORIGIN
    }
  })
})
