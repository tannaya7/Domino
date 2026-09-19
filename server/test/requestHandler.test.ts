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
  unclassified: { packages: [], envVars: [], hosts: [], totalCount: 0 },
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

const getBranchShaMock = vi.fn().mockResolvedValue('deadbeef1234567890')
vi.mock('../src/github', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/github')>()
  return { ...actual, getBranchSha: getBranchShaMock }
})

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

async function get(path: string, query: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const search = new URLSearchParams(query).toString()
  const res = await fetch(`${baseUrl}${path}${search ? `?${search}` : ''}`, { method: 'GET' })
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
  const { clearSnapshotStore } = await import('../src/analysisSnapshots')
  clearCache()
  clearSnapshotStore()
  analyzeRepoMock.mockClear()
  getBranchShaMock.mockClear()
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

  it('returns exact naive vs correlated availability for an analyzed repo', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json } = await post('/simulate', { repoUrl: 'https://github.com/octocat/hello' })

    expect(status).toBe(200)
    expect(json.simulation.naiveAvailability).toBeCloseTo(0.9999)
    expect(json.simulation.trials).toBeUndefined() // exact engine — no Monte Carlo trial count
    expect(json.scenario).toBeNull()
    expect(json.headline.vendors).toBeGreaterThanOrEqual(0)
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

  it('clamps an out-of-range substrate outage probability override into [0, 1] instead of accepting it verbatim', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { json } = await post('/simulate', {
      repoUrl: 'https://github.com/octocat/hello',
      substrateFailureProbabilities: { aws: 999 },
    })
    for (const p of Object.values(json.simulation.assumptions.substrateOutageProbabilities)) {
      expect(p as number).toBeGreaterThanOrEqual(0)
      expect(p as number).toBeLessThanOrEqual(1)
    }
  })
})

describe('POST /evaluate-scenario', () => {
  it('requires the repo to be analyzed first', async () => {
    const { status, json } = await post('/evaluate-scenario', {
      repoUrl: 'https://github.com/octocat/hello',
      substrates: ['aws'],
      vendors: [],
      hours: 4,
    })
    expect(status).toBe(400)
    expect(json.error).toMatch(/analyze this repo/i)
  })

  it('evaluates a valid selection and returns the vendors it takes down', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json } = await post('/evaluate-scenario', {
      repoUrl: 'https://github.com/octocat/hello',
      substrates: ['aws'],
      vendors: [],
      hours: 4,
      costPerHour: 100,
    })
    expect(status).toBe(200)
    expect(json.downVendorKeys).toEqual(['stripe'])
    expect(json.perIncidentCost).toBe(400)
    expect(json.illustrative).toBe(true)
  })

  it('rejects an unknown substrate id with a 400 naming it', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json } = await post('/evaluate-scenario', {
      repoUrl: 'https://github.com/octocat/hello',
      substrates: ['azure'],
      vendors: [],
      hours: 4,
    })
    expect(status).toBe(400)
    expect(json.error).toMatch(/azure/i)
  })

  it('rejects an unknown vendor id with a 400', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json } = await post('/evaluate-scenario', {
      repoUrl: 'https://github.com/octocat/hello',
      substrates: [],
      vendors: ['paypal'],
      hours: 4,
    })
    expect(status).toBe(400)
    expect(json.error).toMatch(/paypal/i)
  })

  it('rejects hours outside [0.25, 720] with a 400', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json } = await post('/evaluate-scenario', {
      repoUrl: 'https://github.com/octocat/hello',
      substrates: ['aws'],
      vendors: [],
      hours: 1000,
    })
    expect(status).toBe(400)
    expect(json.error).toMatch(/hours/i)
  })

  it('rejects more than the max total selections with a 400', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json } = await post('/evaluate-scenario', {
      repoUrl: 'https://github.com/octocat/hello',
      substrates: [],
      vendors: Array.from({ length: 13 }, (_, i) => `vendor-${i}`),
      hours: 4,
    })
    expect(status).toBe(400)
    expect(json.error).toMatch(/12/)
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

describe('POST /snapshot, GET /history, POST /compare', () => {
  it('POST /snapshot requires the repo to be analyzed first', async () => {
    const { status, json } = await post('/snapshot', { repoUrl: 'https://github.com/octocat/hello' })
    expect(status).toBe(400)
    expect(json.error).toMatch(/analyze this repo/i)
  })

  it('POST /snapshot saves a compact summary and GET /history returns it', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { status, json: saved } = await post('/snapshot', { repoUrl: 'https://github.com/octocat/hello', note: 'first save' })
    expect(status).toBe(200)
    expect(saved.repo).toBe('octocat/hello')
    expect(saved.sha).toBe('deadbeef1234567890')
    expect(saved.note).toBe('first save')
    expect(saved.vendors).toEqual([expect.objectContaining({ id: 'stripe' })])
    expect(saved.nodes).toBeUndefined() // never the file graph

    const { status: historyStatus, json: history } = await get('/history', { repo: 'octocat/hello' })
    expect(historyStatus).toBe(200)
    expect(history.history).toHaveLength(1)
    expect(history.history[0].sk).toBe(saved.sk)
  })

  it('POST /snapshot refuses a truncated/degraded scan', async () => {
    analyzeRepoMock.mockResolvedValueOnce({ ...fixtureResult, truncated: true })
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/truncated' })
    const { status, json } = await post('/snapshot', { repoUrl: 'https://github.com/octocat/truncated' })
    expect(status).toBe(400)
    expect(json.error).toMatch(/truncated|rate-limited/i)
  })

  it('GET /history uses strict repo parsing — rejects a malformed repo identifier', async () => {
    const { status, json } = await get('/history', { repo: 'not a valid repo!!' })
    expect(status).toBe(400)
    expect(json.error).toMatch(/not a valid/i)
  })

  it('GET /history returns [] for a repo with no snapshots, never a 404', async () => {
    const { status, json } = await get('/history', { repo: 'octocat/never-seen' })
    expect(status).toBe(200)
    expect(json.history).toEqual([])
  })

  it('POST /compare returns a real diff between two saved snapshots', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { json: first } = await post('/snapshot', { repoUrl: 'https://github.com/octocat/hello' })
    await new Promise((r) => setTimeout(r, 2))
    getBranchShaMock.mockResolvedValueOnce('feedface0000000000')
    const { json: second } = await post('/snapshot', { repoUrl: 'https://github.com/octocat/hello' })

    const { status, json } = await post('/compare', { repo: 'octocat/hello', a: first.sk, b: second.sk })
    expect(status).toBe(200)
    expect(json.diff.verdict).toBe('No material change.') // same fixture data both times
    expect(json.a.sk).toBe(first.sk)
    expect(json.b.sk).toBe(second.sk)
  })

  it('POST /compare 404s when a snapshot key does not exist', async () => {
    await post('/analyze-repo', { repoUrl: 'https://github.com/octocat/hello' })
    const { json: first } = await post('/snapshot', { repoUrl: 'https://github.com/octocat/hello' })
    const { status } = await post('/compare', { repo: 'octocat/hello', a: first.sk, b: 'not-a-real-sk' })
    expect(status).toBe(404)
  })
})
