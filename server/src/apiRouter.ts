import { analyzeConcentration } from '../../src/lib/concentration'
import { PRESET_SCENARIOS, buildAvailabilityHeadline, runMonteCarloAvailability, simulateFailureScenario } from '../../src/lib/availability'
import { analyzeCriticality } from '../../src/lib/criticality'
import { buildAdjacencyMap, buildVendorGraph } from '../../src/lib/graph'
import type { FailureScenario } from '../../src/lib/types'
import { getAwsHealthStatus } from './awsHealth'
import { getCachedGraph, setCachedGraph } from './cache'
import { GithubApiError, parseRepoUrl } from './github'
import { analyzePr } from './prAnalyzer'
import { analyzeRepo, type AnalyzeRepoResult } from './repoParser'
import { getRiskSummary } from './riskSummary'
import { generateRunbook } from './runbook'
import { setVendorsToWatch, startStatusPolling } from './scheduler'
import { fetchAllVendorStatuses } from './statusPoll'

// Transport-agnostic API core: takes a path and an already-parsed JSON body, returns a status +
// response body. Both the local Node http server (requestHandler.ts) and a real Lambda deployment
// (lambdaHandler.ts, behind API Gateway) call this same logic — the only difference between them
// is how a request arrives and a response is sent, not what the API does.

const MAX_TRIALS = 100_000

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function errorMessage(err: unknown): { status: number; message: string } {
  if (err instanceof HttpError) return { status: err.status, message: err.message }
  if (err instanceof GithubApiError) return { status: err.status, message: err.message }
  if (err instanceof Error) return { status: 400, message: err.message }
  return { status: 500, message: 'Unknown error.' }
}

function asTrimmedString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string').slice(0, maxItems)
}

function sanitizeTrials(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(1, Math.min(Math.floor(value), MAX_TRIALS))
}

function sanitizeCost(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

const MAX_OVERRIDE_ENTRIES = 100

/** A user-supplied {key: probability} map from the Assumptions panel — bounded size, values clamped to [0, 1]. */
function sanitizeProbabilityMap(value: unknown): Record<string, number> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const result: Record<string, number> = {}
  let count = 0
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (count >= MAX_OVERRIDE_ENTRIES) break
    if (typeof key !== 'string' || key.length === 0 || key.length > 200) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    result[key] = Math.max(0, Math.min(1, v))
    count++
  }
  return result
}

/** Shared by /simulate, /status, /runbook — they all operate on a repo /analyze-repo already cached. */
async function requireCachedAnalysis(repoUrl: string): Promise<AnalyzeRepoResult> {
  const { owner, repo } = parseRepoUrl(repoUrl)
  const cached = await getCachedGraph(`${owner}/${repo}`)
  if (!cached) throw new HttpError(400, 'Analyze this repo via /analyze-repo first.')
  return cached
}

export interface ApiResponse {
  status: number
  body: unknown
}

/** Routes one POST request. Callers are expected to have already rejected non-POST/OPTIONS methods. */
export async function routeApi(path: string, body: Record<string, unknown>): Promise<ApiResponse> {
  if (path === '/analyze-repo') {
    const repoUrl = asTrimmedString(body.repoUrl)
    const start = Date.now()

    const { owner, repo } = parseRepoUrl(repoUrl)
    const cacheKey = `${owner}/${repo}`
    const cached = await getCachedGraph(cacheKey)
    const result = cached ?? (await analyzeRepo(repoUrl))
    if (!cached) await setCachedGraph(cacheKey, result)

    const adjacency = buildAdjacencyMap(result.graph.nodes, result.graph.edges)
    const vendorGraph = buildVendorGraph(result.vendors, adjacency)
    const concentration = analyzeConcentration(result.vendors, result.iacSubstrates)
    // Framework-aware entrypoints (Next.js/Vite/package.json main-bin) when the repo follows one
    // of those conventions; analyzeCriticality falls back to its own structural heuristic when [].
    const criticality = analyzeCriticality(
      adjacency,
      result.graph.nodes.map((n) => n.id),
      result.entrypoints.length > 0 ? result.entrypoints : undefined,
    )

    setVendorsToWatch(result.vendors)
    startStatusPolling()

    return {
      status: 200,
      body: {
        nodes: result.graph.nodes,
        edges: result.graph.edges,
        vendors: result.vendors,
        vendorGraph,
        concentration,
        criticality,
        meta: {
          owner: result.owner,
          repo: result.repo,
          branch: result.branch,
          filesScanned: result.filesScanned,
          truncated: result.truncated,
          elapsedMs: Date.now() - start,
          cached: Boolean(cached),
          // "X% of internal imports resolved" data-quality badge.
          importResolution: result.importResolution,
        },
      },
    }
  }

  if (path === '/analyze-pr') {
    const prUrl = asTrimmedString(body.prUrl)
    const result = await analyzePr(prUrl)
    return { status: 200, body: result }
  }

  if (path === '/risk-summary') {
    const summary = await getRiskSummary({
      name: asTrimmedString(body.name),
      type: asTrimmedString(body.type),
      downstream: asStringArray(body.downstream, 500),
      upstream: asStringArray(body.upstream, 500),
    })
    return { status: 200, body: { summary } }
  }

  if (path === '/simulate') {
    const repoUrl = asTrimmedString(body.repoUrl)
    const cached = await requireCachedAnalysis(repoUrl)
    const vendors = cached.vendors

    const scenarioId = asTrimmedString(body.scenarioId)
    const downSubstrates = asStringArray(body.downSubstrates, 10)
    let scenario: FailureScenario | null = null
    if (scenarioId) {
      scenario = PRESET_SCENARIOS.find((s) => s.id === scenarioId) ?? null
      if (!scenario) throw new HttpError(400, `Unknown scenarioId "${scenarioId}".`)
    } else if (downSubstrates.length > 0) {
      scenario = { id: 'custom', label: 'Custom scenario', downSubstrates }
    }

    const scenarioResult = scenario ? simulateFailureScenario(vendors, scenario) : null
    const simulation = runMonteCarloAvailability(vendors, {
      trials: sanitizeTrials(body.trials),
      costPerHourOfDowntime: sanitizeCost(body.costPerHourOfDowntime),
      vendorSlaOverrides: sanitizeProbabilityMap(body.vendorSlaOverrides),
      substrateFailureProbabilities: sanitizeProbabilityMap(body.substrateFailureProbabilities),
    })
    const headline = buildAvailabilityHeadline(vendors, simulation)

    return { status: 200, body: { scenario: scenarioResult, simulation, presetScenarios: PRESET_SCENARIOS, headline } }
  }

  if (path === '/status') {
    const repoUrl = asTrimmedString(body.repoUrl)
    const cached = await requireCachedAnalysis(repoUrl)

    setVendorsToWatch(cached.vendors)
    startStatusPolling()

    const [vendorStatuses, awsHealth] = await Promise.all([
      fetchAllVendorStatuses(cached.vendors),
      getAwsHealthStatus(),
    ])

    return { status: 200, body: { vendorStatuses, awsHealth } }
  }

  if (path === '/runbook') {
    const repoUrl = asTrimmedString(body.repoUrl)
    const vendorKey = asTrimmedString(body.vendorKey)
    const cached = await requireCachedAnalysis(repoUrl)

    const vendor = cached.vendors.find((v) => v.key === vendorKey)
    if (!vendor) {
      throw new HttpError(404, `Vendor "${vendorKey}" was not found in the most recent analysis of this repo.`)
    }

    const adjacency = buildAdjacencyMap(cached.graph.nodes, cached.graph.edges)
    const vendorGraph = buildVendorGraph([vendor], adjacency)
    const affectedFileCount = vendorGraph.vendors[0]?.affectedFiles.length ?? 0
    const scenario = asTrimmedString(body.scenarioLabel) || undefined

    const runbook = await generateRunbook({ vendor, affectedFileCount, scenario })
    return { status: 200, body: runbook }
  }

  return { status: 404, body: { error: 'Not found' } }
}
