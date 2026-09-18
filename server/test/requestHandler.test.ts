import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vendor } from '../../src/lib/types'
import type { AnalyzeRepoResult } from '../src/repoParser'

const fixtureVendor: Vendor = {
  key: 'stripe',
  vendor: 'Stripe',
  tier: 'payments',
  substrate: ['aws'],
  sla: 0.9999,
  statusUrl: 'https://status.stripe.com/api/v2/status.json',
  fallbacks: ['Razorpay'],
  detectedVia: ['import:stripe'],
  detectedInFiles: ['src/pay.ts'],
}

const fixtureResult: AnalyzeRepoResult = {
  graph: {
    nodes: [
      { id: 'src/pay.ts', label: 'src/pay.ts', type: 'file' },
      { id: 'src/index.ts', label: 'src/index.ts', type: 'file' },
    ],
    edges: [{ from: 'src/index.ts', to: 'src/pay.ts' }],
  },
  truncated: false,
  filesScanned: 2,
  vendors: [fixtureVendor],
  iacSubstrates: [],
  entrypoints: [],
  importResolution: { total: 0, resolved: 0 },
  owner: 'octocat',
  repo: 'hello',
  branch: 'main',
}

const analyzeRepoMock = vi.fn().mockResolvedValue(fixtureResult)
const fetchAllVendorStatusesMock = vi.fn().mockResolvedValue([
  { vendorKey: 'stripe', indicator: 'operational', checkedAt: new Date().toISOString(), stale: false },
])
const getAwsHealthStatusMock = vi.fn().mockResolvedValue({
  source: 'unknown',
  indicator: 'unknown',
  checkedAt: new Date().toISOString(),
})

vi.mock('../src/repoParser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/repoParser')>()
  return { ...actual, analyzeRepo: analyzeRepoMock }
})
vi.mock('../src/statusPoll', () => ({ fetchAllVendorStatuses: fetchAllVendorStatusesMock }))
vi.mock('../src/awsHealth', () => ({ getAwsHealthStatus: getAwsHealthStatusMock }))

let server: Server
let baseUrl: string

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

beforeAll(async () => {
  const { handleRequest } = await import('../src/requestHandler')
  server = createServer(handleRequest)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(async () => {
  const { clearCache } = await import('../src/cache')
  clearCache()
  analyzeRepoMock.mockClear()
})

describe('POST /analyze-repo', () => {
  it('returns the file graph plus vendors, vendorGraph, concentration, and criticality', async () => {
    const { status, json } = await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })

    expect(status).toBe(200)
    expect(json.nodes).toHaveLength(2)
    expect(json.vendors).toEqual([expect.objectContaining({ key: 'stripe' })])
    expect(json.vendorGraph.vendors[0].affectedFiles.sort()).toEqual(['src/index.ts', 'src/pay.ts'])
    expect(json.concentration.vendorCount).toBe(1)
    expect(json.concentration.mostConcentrated.substrate).toBe('aws')
    expect(json.criticality.entrypoints).toBeDefined()
    expect(json.meta).toEqual(expect.objectContaining({ owner: 'octocat', repo: 'hello' }))
  })

  it('serves the second request from cache without calling analyzeRepo again', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    analyzeRepoMock.mockClear()
    const { json } = await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    expect(json.meta.cached).toBe(true)
    expect(analyzeRepoMock).not.toHaveBeenCalled()
  })

  it('rejects a non-GitHub URL with a 400', async () => {
    const { status, json } = await post('/analyze-repo', { repoUrl: 'not a url' })
    expect(status).toBe(400)
    expect(json.error).toBeTruthy()
  })
})

describe('POST /simulate', () => {
  it('requires the repo to be analyzed first', async () => {
    const { status, json } = await post('/simulate', { repoUrl: 'https://github.com/octocat/hello' })
    expect(status).toBe(400)
    expect(json.error).toMatch(/analyze this repo/i)
  })

  it('returns naive vs correlated availability for an analyzed repo', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json } = await post('/simulate', { repoUrl: 'https://github.com/octocat/hello', trials: 100 })

    expect(status).toBe(200)
    expect(json.simulation.naiveAvailability).toBeCloseTo(0.9999)
    expect(json.simulation.trials).toBe(100)
    expect(json.scenario).toBeNull()
  })

  it('rejects an unknown scenarioId', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status } = await post('/simulate', { repoUrl: 'https://github.com/octocat/hello', scenarioId: 'not-real' })
    expect(status).toBe(400)
  })

  it('runs a preset scenario and reports affected vendors', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json } = await post('/simulate', {
      repoUrl: 'https://github.com/octocat/hello',
      scenarioId: 'aws-outage',
      trials: 50,
    })
    expect(status).toBe(200)
    expect(json.scenario.affectedCount).toBe(1)
  })

  it('caps an absurdly large trials request instead of accepting it verbatim', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { json } = await post('/simulate', { repoUrl: 'https://github.com/octocat/hello', trials: 999_999_999 })
    expect(json.simulation.trials).toBeLessThanOrEqual(100_000)
  })
})

describe('POST /runbook', () => {
  it('produces a deterministic runbook for a known vendor (no Bedrock configured)', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json } = await post('/runbook', {
      repoUrl: 'https://github.com/octocat/hello',
      vendorKey: 'stripe',
    })
    expect(status).toBe(200)
    expect(json.generatedBy).toBe('deterministic')
    expect(json.summary).toContain('Stripe')
    expect(json.recommendedActions.length).toBeGreaterThan(0)
  })

  it('returns 404 for a vendor key absent from the analysis', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status } = await post('/runbook', { repoUrl: 'https://github.com/octocat/hello', vendorKey: 'nope' })
    expect(status).toBe(404)
  })
})

describe('POST /status', () => {
  beforeEach(() => {
    fetchAllVendorStatusesMock.mockClear()
    getAwsHealthStatusMock.mockClear()
  })

  it('returns vendor statuses and AWS health for an analyzed repo', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json } = await post('/status', { repoUrl: 'https://github.com/octocat/hello' })

    expect(status).toBe(200)
    expect(json.vendorStatuses).toEqual([expect.objectContaining({ vendorKey: 'stripe', indicator: 'operational' })])
    expect(json.awsHealth.source).toBe('unknown')
  })

  it('requires the repo to be analyzed first', async () => {
    const { status } = await post('/status', { repoUrl: 'https://github.com/octocat/hello' })
    expect(status).toBe(400)
  })
})

describe('unknown routes and malformed input', () => {
  it('returns 404 for an unrecognized route', async () => {
    const { status } = await post('/not-a-real-route', {})
    expect(status).toBe(404)
  })

  it('returns 400 instead of crashing on malformed JSON', async () => {
    const res = await fetch(`${baseUrl}/analyze-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    })
    expect(res.status).toBe(400)
  })
})
