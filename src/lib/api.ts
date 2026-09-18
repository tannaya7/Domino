import type {
  AwsHealthStatus,
  ConcentrationResult,
  CriticalityResult,
  FailureScenarioResult,
  GraphData,
  Runbook,
  SimulationResult,
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
}

export interface SimulateResponse {
  scenario: FailureScenarioResult | null
  simulation: SimulationResult
  presetScenarios: Array<{ id: string; label: string; downSubstrates: string[]; description?: string }>
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
