import type { AnalyzeRepoResult } from './repoParser'
import { withTimeout } from './withTimeout'

// Real `graph-cache` DynamoDB table (partition key `repo_url`) when DYNAMODB_GRAPH_CACHE_TABLE is
// set; otherwise this falls back to the in-memory Map below, which is always populated first as a
// same-process fast path even when DynamoDB is configured. The AWS SDK is loaded lazily (dynamic
// import) so local dev without DynamoDB configured never pays for it.

interface CacheEntry {
  graph: AnalyzeRepoResult
  createdAt: number
  ttlMs: number
}

const memoryStore = new Map<string, CacheEntry>()
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const DYNAMODB_TIMEOUT_MS = 3000

function getTableName(): string | undefined {
  return process.env.DYNAMODB_GRAPH_CACHE_TABLE
}

function getRegion(): string {
  return process.env.AWS_REGION ?? 'us-east-1'
}

function isDynamoConfigured(): boolean {
  return Boolean(getTableName())
}

function isFresh(createdAt: number, ttlMs: number): boolean {
  return Date.now() - createdAt <= ttlMs
}

let dynamoDocClientPromise: Promise<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient> | null = null

/** Lazily constructs (and memoizes) the DynamoDB document client. Credentials resolve via the
 * standard AWS SDK credential chain (env vars, shared config, IMDS, ...) — never hardcoded here. */
async function getDynamoDocClient() {
  if (!dynamoDocClientPromise) {
    dynamoDocClientPromise = (async () => {
      const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb')
      const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb')
      return DynamoDBDocumentClient.from(new DynamoDBClient({ region: getRegion() }))
    })()
  }
  return dynamoDocClientPromise
}

interface GraphCacheItem {
  repo_url: string
  graph_data: string
  created_at: number
  ttl_ms: number
  /** Native DynamoDB TTL attribute (epoch seconds) — a best-effort backstop; the in-app freshness
   * check via created_at/ttl_ms is authoritative, since DynamoDB's TTL sweep can lag by hours. */
  ttl: number
}

async function getFromDynamo(repoUrl: string): Promise<AnalyzeRepoResult | null> {
  const tableName = getTableName()
  if (!tableName) return null
  try {
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb')
    const client = await getDynamoDocClient()
    const result = await withTimeout(
      client.send(new GetCommand({ TableName: tableName, Key: { repo_url: repoUrl } })),
      DYNAMODB_TIMEOUT_MS,
      'DynamoDB GetItem',
    )
    const item = result.Item as GraphCacheItem | undefined
    if (!item || !isFresh(item.created_at, item.ttl_ms)) return null
    return JSON.parse(item.graph_data) as AnalyzeRepoResult
  } catch {
    return null // Any DynamoDB failure (network, credentials, timeout) — treat as a cache miss.
  }
}

async function setInDynamo(repoUrl: string, graph: AnalyzeRepoResult, ttlMs: number): Promise<void> {
  const tableName = getTableName()
  if (!tableName) return
  try {
    const { PutCommand } = await import('@aws-sdk/lib-dynamodb')
    const client = await getDynamoDocClient()
    const createdAt = Date.now()
    const item: GraphCacheItem = {
      repo_url: repoUrl,
      graph_data: JSON.stringify(graph),
      created_at: createdAt,
      ttl_ms: ttlMs,
      ttl: Math.floor((createdAt + ttlMs) / 1000),
    }
    await withTimeout(
      client.send(new PutCommand({ TableName: tableName, Item: item })),
      DYNAMODB_TIMEOUT_MS,
      'DynamoDB PutItem',
    )
  } catch {
    // Swallow — the in-memory store (set before this is called) still serves this process.
  }
}

export async function getCachedGraph(repoUrl: string): Promise<AnalyzeRepoResult | null> {
  const memoryEntry = memoryStore.get(repoUrl)
  if (memoryEntry) {
    if (isFresh(memoryEntry.createdAt, memoryEntry.ttlMs)) return memoryEntry.graph
    memoryStore.delete(repoUrl)
  }

  if (!isDynamoConfigured()) return null
  return getFromDynamo(repoUrl)
}

export async function setCachedGraph(repoUrl: string, graph: AnalyzeRepoResult, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  memoryStore.set(repoUrl, { graph, createdAt: Date.now(), ttlMs })
  if (isDynamoConfigured()) await setInDynamo(repoUrl, graph, ttlMs)
}

/** Clears ONLY the in-memory fallback store. Deliberately never touches DynamoDB — a test run
 * (or any other caller) can never wipe a real production cache table through this function. */
export function clearCache(): void {
  memoryStore.clear()
}
