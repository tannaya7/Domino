import type {
  AnalysisDiff,
  AnalysisSnapshotSummary,
  AvailabilityHeadline,
  AwsHealthStatus,
  ConcentrationResult,
  CriticalityResult,
  ExactAvailabilityResult,
  FailureScenarioResult,
  GraphData,
  OwnInfrastructure,
  Runbook,
  UnclassifiedSummary,
  Vendor,
  VendorGraph,
  VendorStatus,
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

async function getJson<T>(path: string, query: Record<string, string>): Promise<T> {
  let res: Response
  const search = new URLSearchParams(query).toString()
  try {
    res = await fetch(`${API_BASE_URL}${path}?${search}`)
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
  /** External dependencies found but not in the curated vendor knowledge base — never merged into
   * vendors/concentration/availability math. */
  unclassified: UnclassifiedSummary
  /** Static IaC resilience linter over the repo's OWN infrastructure — display only, never a vendor. */
  own: OwnInfrastructure
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
}

export interface SimulateResponse {
  scenario: FailureScenarioResult | null
  simulation: ExactAvailabilityResult
  presetScenarios: Array<{ id: string; label: string; downSubstrates: string[]; description?: string }>
  /** Compact summary for the UI headline — see AvailabilityHeadline. */
  headline: AvailabilityHeadline
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

export async function fetchRunbook(repoUrl: string, vendorKey: string, scenarioLabel?: string): Promise<Runbook> {
  return postJson<Runbook>('/runbook', { repoUrl, vendorKey, scenarioLabel })
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

export interface SaveSnapshotRequest {
  repoUrl: string
  note?: string
  costPerHourOfDowntime?: number
  vendorSlaOverrides?: Record<string, number>
  substrateOutageProbabilities?: Record<string, number>
}

export async function saveSnapshot(input: SaveSnapshotRequest): Promise<AnalysisSnapshotSummary> {
  return postJson<AnalysisSnapshotSummary>('/snapshot', input)
}

export async function fetchHistory(repo: string, limit = 50): Promise<AnalysisSnapshotSummary[]> {
  const { history } = await getJson<{ repo: string; history: AnalysisSnapshotSummary[] }>('/history', {
    repo,
    limit: String(limit),
  })
  return history
}

export interface CompareResponse {
  a: AnalysisSnapshotSummary
  b: AnalysisSnapshotSummary
  diff: AnalysisDiff
}

export async function compareSnapshots(repo: string, a: string, b: string): Promise<CompareResponse> {
  return postJson<CompareResponse>('/compare', { repo, a, b })
}
