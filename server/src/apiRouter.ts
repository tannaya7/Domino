import { analyzeConcentration } from '../../src/lib/concentration'
import {
  buildAvailabilityHeadline,
  computeExactAvailability,
  HISTORICAL_REPLAY_SCENARIOS,
  PRESET_SCENARIOS,
  simulateFailureScenario,
} from '../../src/lib/availability'
import { analyzeCriticality } from '../../src/lib/criticality'
import { evaluateScenario, MAX_SCENARIO_SELECTIONS, ScenarioValidationException } from '../../src/engine/scenario'
import { diffAnalyses } from '../../src/engine/snapshotDiff'
import { computeAssumptionsHash } from '../../src/lib/assumptionsHash'
import { buildAdjacencyMap, buildVendorGraph, getDownstream } from '../../src/lib/graph'
import type { ExactAvailabilityAssumptions, FailureScenario, WhatIfOverride, WhatIfResult } from '../../src/lib/types'
import { askQuestion } from './ask'
import {
  buildSnapshotSummary,
  getHistory,
  getSnapshotBySk,
  saveSnapshot,
  SnapshotTooLargeError,
} from './analysisSnapshots'
import { getAwsHealthStatus, isAwsHealthApiEnabled } from './awsHealth'
import { isBedrockConfigured } from './bedrock'
import { getCachedGraph, isDynamoConfigured, setCachedGraph } from './cache'
import { getBranchSha, GithubApiError, parseRepoShorthand, parseRepoUrl } from './github'
import { analyzePr } from './prAnalyzer'
import { analyzeRepo, type AnalyzeRepoResult } from './repoParser'
import { runPrGate } from './prGate'
import { getRiskSummary } from './riskSummary'
import { generateRunbook } from './runbook'
import { setVendorsToWatch, startStatusPolling } from './scheduler'
import { isSnsConfigured } from './sns'
import { fetchAllVendorStatuses } from './statusPoll'
import { computeWhatIf, MAX_WHATIF_OVERRIDES, rankRecommendedMoves } from './whatIf'

// Transport-agnostic API core: takes a path and an already-parsed JSON body, returns a status +
// response body. Both the local Node http server (requestHandler.ts) and a real Lambda deployment
// (lambdaHandler.ts, behind API Gateway) call this same logic — the only difference between them
// is how a request arrives and a response is sent, not what the API does.

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

/** A user-supplied what-if list from the vendor detail panel — bounded to MAX_WHATIF_OVERRIDES
 * entries (the UI caps stacked what-ifs at 3); malformed entries are dropped rather than rejecting
 * the whole request, since a missing vendorId just means that entry does nothing. */
function sanitizeWhatIfOverrides(value: unknown): WhatIfOverride[] {
  if (!Array.isArray(value)) return []
  const result: WhatIfOverride[] = []
  for (const raw of value.slice(0, MAX_WHATIF_OVERRIDES)) {
    if (typeof raw !== 'object' || raw === null) continue
    const record = raw as Record<string, unknown>
    const vendorId = asTrimmedString(record.vendorId)
    if (!vendorId) continue
    const substrate = asTrimmedString(record.substrate) || undefined
    const failoverVendorId = asTrimmedString(record.failoverVendorId) || undefined
    result.push({ vendorId, substrate, failoverVendorId })
  }
  return result
}

/** Shared by /simulate, /evaluate-scenario, /status, /runbook, /snapshot. A cache miss here does NOT
 * mean "never analyzed" — this process may be a different, colder Lambda container than the one
 * that served /analyze-repo, and containers share no memory. So this rebuilds from the request's
 * own repoUrl (the same repoUrl /analyze-repo itself takes) rather than depending on that per-
 * process cache being warm; the result is cached for next time under the same never-cache-a-
 * truncated-scan policy /analyze-repo uses. */
async function requireCachedAnalysis(repoUrl: string): Promise<AnalyzeRepoResult> {
  const { owner, repo } = parseRepoUrl(repoUrl)
  const cacheKey = `${owner}/${repo}`
  const cached = await getCachedGraph(cacheKey)
  if (cached) return cached
  const result = await analyzeRepo(repoUrl)
  if (!result.truncated) await setCachedGraph(cacheKey, result)
  return result
}

export interface ApiResponse {
  status: number
  body: unknown
}

/** GET /health — no auth, no side effects, deliberately outside routeApi's POST-only contract so
 * both entry points (requestHandler.ts, lambdaHandler.ts) can serve it on a plain GET before the
 * POST/OPTIONS-only gate below. Reports which AWS integrations are actually configured in THIS
 * running process — never whether they've been verified live (see docs/AWS_VERIFICATION.md for
 * that distinct claim) — so a judge/monitor can tell "backend is up" from "backend is up but
 * running every fallback" without guessing from behavior. */
export function healthCheck(): ApiResponse {
  return {
    status: 200,
    body: {
      ok: true,
      timestamp: new Date().toISOString(),
      integrations: {
        bedrock: isBedrockConfigured(),
        dynamodb: isDynamoConfigured(),
        awsHealth: isAwsHealthApiEnabled(),
        sns: isSnsConfigured(),
      },
    },
  }
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
    // A truncated/rate-limited scan may have missed IaC files entirely — caching it would let a
    // later /simulate, /snapshot, or repeat /analyze-repo silently treat "we didn't get to see it"
    // as "we looked and found nothing" (own-infrastructure findings, vendor detection, everything).
    if (!cached && !result.truncated) await setCachedGraph(cacheKey, result)

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
        // Deliberately separate from `vendors` — never merged into vendor counts, substrates, or
        // availability math. See unclassifiedDependencies.ts.
        unclassified: result.unclassified,
        // Static IaC resilience linter over the repo's OWN infrastructure — display only, never a
        // vendor. See src/engine/ownInfrastructure.ts.
        own: result.own,
        meta: {
          owner: result.owner,
          repo: result.repo,
          branch: result.branch,
          filesScanned: result.filesScanned,
          filesSelected: result.filesSelected,
          truncated: result.truncated,
          truncatedReason: result.truncatedReason,
          elapsedMs: Date.now() - start,
          cached: Boolean(cached),
          // "X% of internal imports resolved" data-quality badge.
          importResolution: result.importResolution,
        },
        // Ask Blast Radius (POST /ask) — the UI shows its free-text input only when this is true;
        // the 3 suggested-question chips work either way (deterministic, no Bedrock needed).
        bedrockAvailable: isBedrockConfigured(),
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
      scenario =
        PRESET_SCENARIOS.find((s) => s.id === scenarioId) ??
        HISTORICAL_REPLAY_SCENARIOS.find((s) => s.id === scenarioId) ??
        null
      if (!scenario) throw new HttpError(400, `Unknown scenarioId "${scenarioId}".`)
    } else if (downSubstrates.length > 0) {
      scenario = { id: 'custom', label: 'Custom scenario', downSubstrates }
    }

    const scenarioResult = scenario ? simulateFailureScenario(vendors, scenario) : null
    const simulation = computeExactAvailability(vendors, {
      costPerHourOfDowntime: sanitizeCost(body.costPerHourOfDowntime),
      vendorSlaOverrides: sanitizeProbabilityMap(body.vendorSlaOverrides),
      substrateOutageProbabilities: sanitizeProbabilityMap(body.substrateFailureProbabilities),
    })
    const headline = buildAvailabilityHeadline(vendors, simulation)

    // What-if mitigation preview (Prompt 15): baseline and mitigated are computed under the SAME
    // simulation.assumptions object (the fully-resolved assumptions computeExactAvailability just
    // used) — the override is the only thing that differs, so `delta` is exact, not noise. []
    // overrides -> no whatIf in the response at all, not a zeroed-out one.
    const whatIfOverrides = sanitizeWhatIfOverrides(body.overrides)
    let whatIf: WhatIfResult | null = null
    if (whatIfOverrides.length > 0) {
      whatIf = computeWhatIf(vendors, whatIfOverrides, simulation.assumptions)
    }
    const recommendedMoves = rankRecommendedMoves(vendors, simulation.assumptions)

    // Enrich worstSingleEvent with real entrypoints-affected, using the cached repo's file graph —
    // the pure engine has no graph access, so this is the one place that can honestly fill it in.
    if (headline.worstSingleEvent) {
      const adjacency = buildAdjacencyMap(cached.graph.nodes, cached.graph.edges)
      const entrypointSet = new Set(cached.entrypoints)
      const affectedVendorKeys = new Set(headline.worstSingleEvent.vendorKeys)
      const affectedEntrypoints = new Set<string>()
      for (const vendor of vendors) {
        if (!affectedVendorKeys.has(vendor.key)) continue
        for (const file of vendor.detectedInFiles) {
          if (!adjacency.reverse.has(file)) continue
          if (entrypointSet.has(file)) affectedEntrypoints.add(file)
          for (const downstream of getDownstream(file, adjacency)) {
            if (entrypointSet.has(downstream)) affectedEntrypoints.add(downstream)
          }
        }
      }
      headline.worstSingleEvent = { ...headline.worstSingleEvent, entrypointsAffected: [...affectedEntrypoints] }
    }

    return {
      status: 200,
      body: { scenario: scenarioResult, simulation, presetScenarios: PRESET_SCENARIOS, headline, whatIf, recommendedMoves },
    }
  }

  if (path === '/evaluate-scenario') {
    const repoUrl = asTrimmedString(body.repoUrl)
    const cached = await requireCachedAnalysis(repoUrl)
    const adjacency = buildAdjacencyMap(cached.graph.nodes, cached.graph.edges)
    const vendorGraph = buildVendorGraph(cached.vendors, adjacency)

    // Generous raw-array bound (well above MAX_SCENARIO_SELECTIONS) so an over-long payload still
    // reaches evaluateScenario's own validation and gets the real "N selections, max 12" message,
    // rather than being silently truncated to exactly the limit beforehand.
    const selection = {
      substrates: asStringArray(body.substrates, MAX_SCENARIO_SELECTIONS * 4),
      vendors: asStringArray(body.vendors, MAX_SCENARIO_SELECTIONS * 4),
      hours: typeof body.hours === 'number' ? body.hours : NaN,
    }

    try {
      const result = evaluateScenario(
        {
          vendors: vendorGraph.vendors,
          entrypoints: cached.entrypoints,
          costPerHour: sanitizeCost(body.costPerHour) ?? 0,
          overrides: {
            vendorSlaOverrides: sanitizeProbabilityMap(body.vendorSlaOverrides),
            substrateOutageProbabilities: sanitizeProbabilityMap(body.substrateOutageProbabilities),
          },
        },
        selection,
      )
      return { status: 200, body: result }
    } catch (err) {
      if (err instanceof ScenarioValidationException) throw new HttpError(400, err.message)
      throw err
    }
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

    // Same deterministic ranking /simulate exposes, fed to the runbook as CONTEXT only — it never
    // changes generatedBy ('bedrock' | 'deterministic'), it just gives whichever path produces the
    // narrative something concrete to reference instead of generic advice.
    const costPerHourOfDowntime = sanitizeCost(body.costPerHourOfDowntime) ?? 0
    const recommendedMoves = rankRecommendedMoves(cached.vendors, {
      costPerHourOfDowntime,
      vendorSlaOverrides: {},
      substrateOutageProbabilities: {},
    }).filter((m) => m.vendorId === vendor.key)

    const runbook = await generateRunbook({ vendor, affectedFileCount, scenario, recommendedMoves })
    return { status: 200, body: runbook }
  }

  if (path === '/gate') {
    const prUrl = asTrimmedString(body.prUrl)
    if (!prUrl) throw new HttpError(400, 'prUrl is required.')
    const result = await runPrGate({
      prUrl,
      policy: body.policy,
      costPerHourOfDowntime: sanitizeCost(body.costPerHourOfDowntime),
      currency: asTrimmedString(body.currency) || undefined,
    })
    return { status: 200, body: result }
  }

  if (path === '/ask') {
    const repoUrl = asTrimmedString(body.repoUrl)
    const question = asTrimmedString(body.question)
    if (!question) throw new HttpError(400, 'A question is required.')
    const cached = await requireCachedAnalysis(repoUrl)

    const assumptions: ExactAvailabilityAssumptions = {
      costPerHourOfDowntime: sanitizeCost(body.costPerHourOfDowntime) ?? 0,
      vendorSlaOverrides: sanitizeProbabilityMap(body.vendorSlaOverrides) ?? {},
      substrateOutageProbabilities: sanitizeProbabilityMap(body.substrateFailureProbabilities) ?? {},
    }

    const result = await askQuestion({ cached, question, assumptions })
    return { status: 200, body: result }
  }

  if (path === '/snapshot') {
    const repoUrl = asTrimmedString(body.repoUrl)
    const cached = await requireCachedAnalysis(repoUrl)

    // Never snapshot a degraded or rate-limited scan — a compact summary built from a partial file
    // graph would misrepresent this point in history forever (snapshots are meant to be trusted
    // later, unlike a live analysis the user can just re-run).
    if (cached.truncated) {
      throw new HttpError(400, 'Cannot save a snapshot from a truncated/rate-limited scan — analyze this repo again with a full scan first.')
    }

    const { owner, repo } = parseRepoUrl(repoUrl)
    const sha = await getBranchSha(owner, repo, cached.branch)

    const adjacency = buildAdjacencyMap(cached.graph.nodes, cached.graph.edges)
    const concentration = analyzeConcentration(cached.vendors, cached.iacSubstrates)
    const criticality = analyzeCriticality(
      adjacency,
      cached.graph.nodes.map((n) => n.id),
      cached.entrypoints.length > 0 ? cached.entrypoints : undefined,
    )
    const costPerHourOfDowntime = sanitizeCost(body.costPerHourOfDowntime) ?? 0
    const vendorSlaOverrides = sanitizeProbabilityMap(body.vendorSlaOverrides) ?? {}
    const substrateOutageProbabilities = sanitizeProbabilityMap(body.substrateOutageProbabilities) ?? {}
    const exactResult = computeExactAvailability(cached.vendors, { costPerHourOfDowntime, vendorSlaOverrides, substrateOutageProbabilities })
    const headline = buildAvailabilityHeadline(cached.vendors, exactResult)

    const note = asTrimmedString(body.note).slice(0, 280) || undefined

    const summary = buildSnapshotSummary({
      repo: `${owner}/${repo}`,
      sha,
      vendors: cached.vendors,
      concentration,
      criticality,
      headline,
      unclassifiedCount: cached.unclassified?.totalCount ?? null,
      ownInfraFindingsCount: cached.own?.findings.length ?? null,
      ownInfraRegionCount: cached.own?.regions.length ?? null,
      assumptionsHash: computeAssumptionsHash({ costPerHourOfDowntime, vendorSlaOverrides, substrateOutageProbabilities }),
      note,
    })

    try {
      await saveSnapshot(summary)
    } catch (err) {
      if (err instanceof SnapshotTooLargeError) throw new HttpError(500, err.message)
      throw err
    }

    return { status: 200, body: summary }
  }

  if (path === '/history') {
    const { owner, repo } = parseRepoShorthand(asTrimmedString(body.repo))
    const limit = typeof body.limit === 'number' ? body.limit : Number(body.limit) || 50
    const history = await getHistory(`${owner}/${repo}`, Math.max(1, Math.min(50, Math.trunc(limit))))
    return { status: 200, body: { repo: `${owner}/${repo}`, history } }
  }

  if (path === '/compare') {
    const { owner, repo } = parseRepoShorthand(asTrimmedString(body.repo))
    const repoKey = `${owner}/${repo}`
    const aSk = asTrimmedString(body.a)
    const bSk = asTrimmedString(body.b)
    if (!aSk || !bSk) throw new HttpError(400, 'Both "a" and "b" snapshot keys are required.')

    const [a, b] = await Promise.all([getSnapshotBySk(repoKey, aSk), getSnapshotBySk(repoKey, bSk)])
    if (!a) throw new HttpError(404, `Snapshot "${aSk}" was not found for ${repoKey}.`)
    if (!b) throw new HttpError(404, `Snapshot "${bSk}" was not found for ${repoKey}.`)

    return { status: 200, body: { a, b, diff: diffAnalyses(a, b) } }
  }

  return { status: 404, body: { error: 'Not found' } }
}
