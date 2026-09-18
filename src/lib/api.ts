import type { GraphData } from './types'

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
