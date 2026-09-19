import type {
  AskResult,
  AvailabilityHeadline,
  AwsHealthStatus,
  ConcentrationResult,
  CriticalityResult,
  ExactAvailabilityResult,
  FailureScenarioResult,
  GraphData,
  RecommendedMove,
  Runbook,
  Vendor,
  VendorGraph,
  VendorStatus,
  WhatIfOverride,
  WhatIfResult,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787'

export class ApiError extends Error {}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new ApiError(
      `Could not reach the analysis backend at ${API_BASE_URL}. Is it running (npm run server:dev)?`,
    )
  }

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(body.error ?? `Request failed with status ${res.status}.`)
  }
  return body as T
}

export interface AnalyzeRepoResponse extends GraphData {
  /** Third-party vendors detected from imports, env vars, manifests, and IaC. */
  vendors: Vendor[]
  vendorGraph: VendorGraph
  concentration: ConcentrationResult
  /** Graph-theory criticality of the file graph (articulation points, reachability loss). */
  criticality: CriticalityResult
  meta: {
    owner: string
    repo: string
    branch: string
    filesScanned: number
    truncated: boolean
    elapsedMs: number
    cached: boolean
    /** Powers the "X% of internal imports resolved" data-quality badge. */
    importResolution: { total: number; resolved: number }
  }
  /** Ask Blast Radius's free-text input only shows when this is true — the 3 suggested-question
   * chips work either way (deterministic, no Bedrock needed). */
  bedrockAvailable: boolean
}

export async function analyzeRepo(repoUrl: string): Promise<AnalyzeRepoResponse> {
  return postJson<AnalyzeRepoResponse>('/analyze-repo', { repoUrl })
}

export interface SimulateRequest {
  repoUrl: string
  /** One of the backend's PRESET_SCENARIOS ids, e.g. "aws-outage". Ignored if downSubstrates is set. */
  scenarioId?: string
  /** A custom list of substrates to treat as fully down, e.g. ["aws"]. */
  downSubstrates?: string[]
  trials?: number
  costPerHourOfDowntime?: number
  /** Per-vendor SLA overrides keyed by Vendor.key, from the Assumptions panel. */
  vendorSlaOverrides?: Record<string, number>
  /** Per-substrate failure-rate overrides keyed by substrate name, from the Assumptions panel. */
  substrateFailureProbabilities?: Record<string, number>
  /** Up to 3 stacked mitigation what-ifs (WhatIfPanel) — [] or omitted means no whatIf in the response. */
  overrides?: WhatIfOverride[]
}

export interface SimulateResponse {
  scenario: FailureScenarioResult | null
  simulation: ExactAvailabilityResult
  presetScenarios: Array<{ id: string; label: string; downSubstrates: string[]; description?: string }>
  /** Compact summary for the UI headline — see AvailabilityHeadline. */
  headline: AvailabilityHeadline
  /** null when no `overrides` were sent — never a zeroed-out placeholder result. */
  whatIf: WhatIfResult | null
  /** Deterministic top-3 mitigation ranking (no LLM) under the current assumptions. */
  recommendedMoves: RecommendedMove[]
}

export async function simulate(input: SimulateRequest): Promise<SimulateResponse> {
  return postJson<SimulateResponse>('/simulate', input)
}

export interface StatusResponse {
  vendorStatuses: VendorStatus[]
  awsHealth: AwsHealthStatus
}

export async function fetchStatus(repoUrl: string): Promise<StatusResponse> {
  return postJson<StatusResponse>('/status', { repoUrl })
}

export async function fetchRunbook(
  repoUrl: string,
  vendorKey: string,
  scenarioLabel?: string,
  costPerHourOfDowntime?: number,
): Promise<Runbook> {
  return postJson<Runbook>('/runbook', { repoUrl, vendorKey, scenarioLabel, costPerHourOfDowntime })
}

export interface ChangedNode {
  id: string
  label: string
  type: string
  blastRadiusCount: number
}

export interface AnalyzePrResponse {
  owner: string
  repo: string
  branch: string
  prNumber: number
  graph: GraphData
  changedNodes: ChangedNode[]
  unmatchedFiles: string[]
  combinedBlastRadius: { downstream: string[]; upstream: string[]; totalCount: number }
  highestRisk: { nodeId: string; label: string; count: number; risk: string } | null
}

export async function analyzePr(prUrl: string): Promise<AnalyzePrResponse> {
  return postJson<AnalyzePrResponse>('/analyze-pr', { prUrl })
}

export interface RiskSummaryRequest {
  name: string
  type: string
  downstream: string[]
  upstream: string[]
}

export async function getRiskSummary(input: RiskSummaryRequest): Promise<string> {
  const { summary } = await postJson<{ summary: string }>('/risk-summary', input)
  return summary
}

export interface AskRequest {
  repoUrl: string
  question: string
  costPerHourOfDowntime?: number
  vendorSlaOverrides?: Record<string, number>
  substrateFailureProbabilities?: Record<string, number>
}

export async function askBlastRadius(input: AskRequest): Promise<AskResult> {
  return postJson<AskResult>('/ask', input)
}

export interface GatePolicy {
  maxSubstrateShare?: number
  minSubstrates?: number
  maxNewVendorsPerPr?: number
  maxEntrypointsAffectedPct?: number
  maxExposureIncreasePerYear?: number
  failOn?: 'fail' | 'warn'
}

export interface GateNewVendor {
  key: string
  vendor: string
  substrate: string[]
  category: string
  detectedVia: string[]
  files: string[]
}

export interface GatePolicyViolation {
  rule: string
  actual: number
  limit: number
  message: string
}

export interface GateResponse {
  pr: { owner: string; repo: string; number: number; headSha: string; baseRef: string; baselineNote: string }
  newVendors: GateNewVendor[]
  entrypointsAffected: string[]
  concentration: { before: ConcentrationResult; after: ConcentrationResult }
  exposure: { before: number; after: number; delta: number; currency: string }
  policy: { status: 'info' | 'pass' | 'warn' | 'fail'; violations: GatePolicyViolation[] }
  markdown: string
  truncated: boolean
}

export interface GateRequest {
  prUrl: string
  policy?: GatePolicy
  costPerHourOfDowntime?: number
  currency?: string
}

/** The same check `action/action.yml` runs in CI — the "Pull Request" tab calls it report-only
 * (no policy) so a judge/reviewer sees the identical verdict card without needing a GitHub Action. */
export async function runGate(input: GateRequest): Promise<GateResponse> {
  return postJson<GateResponse>('/gate', input)
}
