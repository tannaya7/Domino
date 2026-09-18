import type { AnalyzeRepoResult } from './repoParser'

// TODO: replace with the real `graph-cache` DynamoDB table (partition key `repo_url`,
// `graph_data`, `created_at`, `ttl`) once AWS credentials are configured — see PRD v2 §4.
// The in-memory Map below stands in for it with the same read/write/TTL semantics.

interface CacheEntry {
  graph: AnalyzeRepoResult
  createdAt: number
  ttlMs: number
}

const store = new Map<string, CacheEntry>()

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function getCachedGraph(repoUrl: string): AnalyzeRepoResult | null {
  const entry = store.get(repoUrl)
  if (!entry) return null
  if (Date.now() - entry.createdAt > entry.ttlMs) {
    store.delete(repoUrl)
    return null
  }
  return entry.graph
}

export function setCachedGraph(repoUrl: string, graph: AnalyzeRepoResult, ttlMs = DEFAULT_TTL_MS): void {
  store.set(repoUrl, { graph, createdAt: Date.now(), ttlMs })
}

export function clearCache(): void {
  store.clear()
}
