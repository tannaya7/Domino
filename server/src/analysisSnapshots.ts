import { ENGINE_VERSION } from '../../src/engine/version'
import { KB_VERSION } from '../../src/data/vendors.generated'
import type {
  AnalysisSnapshotSummary,
  AvailabilityHeadline,
  ConcentrationResult,
  CriticalityResult,
  Vendor,
} from '../../src/lib/types'
import { withTimeout } from './withTimeout'

// Same in-memory-first, DynamoDB-when-configured pattern as cache.ts (a separate table, a separate
// module — snapshots are append-only history, never a freshness-checked cache of "the current
// state"). The AWS SDK is loaded lazily so local dev without DynamoDB configured never pays for it.

export class SnapshotTooLargeError extends Error {}

const MAX_ITEM_BYTES = 100_000
const TTL_SECONDS = 90 * 24 * 60 * 60 // 90 days
const MAX_HISTORY = 50
const DYNAMODB_TIMEOUT_MS = 3000

const memoryStore = new Map<string, AnalysisSnapshotSummary[]>() // keyed by "owner/repo", newest-first

function getTableName(): string | undefined {
  return process.env.DYNAMODB_ANALYSIS_SNAPSHOTS_TABLE
}
function isDynamoConfigured(): boolean {
  return Boolean(getTableName())
}
function getRegion(): string {
  return process.env.AWS_REGION ?? 'us-east-1'
}

let dynamoDocClientPromise: Promise<import('@aws-sdk/lib-dynamodb').DynamoDBDocumentClient> | null = null

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

/** Byte size of the exact JSON this would be stored as — the 100 KB/item cap this task requires. */
export function summaryByteSize(summary: AnalysisSnapshotSummary): number {
  return Buffer.byteLength(JSON.stringify(summary), 'utf-8')
}

export function assertWithinSizeCap(summary: AnalysisSnapshotSummary): void {
  const bytes = summaryByteSize(summary)
  if (bytes > MAX_ITEM_BYTES) {
    throw new SnapshotTooLargeError(`Snapshot summary is ${bytes} bytes, exceeds the ${MAX_ITEM_BYTES}-byte cap.`)
  }
}

export interface BuildSnapshotSummaryInput {
  repo: string // "owner/repo"
  sha: string
  vendors: Vendor[]
  concentration: ConcentrationResult
  criticality: CriticalityResult
  headline: AvailabilityHeadline
  /** null when unclassified scanning didn't run for this analysis — never fabricated as 0. */
  unclassifiedCount: number | null
  assumptionsHash: string
  note?: string
}

/** Builds the COMPACT summary this feature stores — never the file graph. Pure (no I/O, no
 * randomness): same input always produces the same summary except for `analyzedAt`/`sk`, which are
 * wall-clock by design (a snapshot's whole point is recording when it was taken). */
export function buildSnapshotSummary(input: BuildSnapshotSummaryInput): AnalysisSnapshotSummary {
  const analyzedAt = new Date().toISOString()
  return {
    repo: input.repo,
    sk: `${analyzedAt}#${input.sha}`,
    sha: input.sha,
    analyzedAt,
    ...(input.note ? { note: input.note } : {}),
    vendors: input.vendors.map((v) => ({ id: v.key, substrate: v.substrate, category: v.tier })),
    substrateShares: input.concentration.bySubstrate.map((s) => ({ substrate: s.substrate, share: s.share })),
    tailRisk: input.headline.tailRisk.map((t) => ({ k: t.k, correlated: t.correlated, multiplier: t.multiplier })),
    worstSingleEvent: input.headline.worstSingleEvent
      ? {
          substrate: input.headline.worstSingleEvent.substrate,
          vendorKeys: input.headline.worstSingleEvent.vendorKeys,
          probabilityPerYear: input.headline.worstSingleEvent.probabilityPerYear,
        }
      : null,
    topCriticality: input.criticality.byNode.slice(0, 5).map((n) => ({
      nodeId: n.nodeId,
      isArticulationPoint: n.isArticulationPoint,
      reachabilityLossRatio: n.reachabilityLossRatio,
    })),
    unclassifiedCount: input.unclassifiedCount,
    entrypointCount: input.criticality.entrypoints.length,
    engineVersion: ENGINE_VERSION,
    kbVersion: KB_VERSION,
    assumptionsHash: input.assumptionsHash,
  }
}

interface SnapshotItem extends AnalysisSnapshotSummary {
  ttl: number
}

async function putInDynamo(summary: AnalysisSnapshotSummary): Promise<void> {
  const tableName = getTableName()
  if (!tableName) return
  try {
    const { PutCommand } = await import('@aws-sdk/lib-dynamodb')
    const client = await getDynamoDocClient()
    const item: SnapshotItem = { ...summary, ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS }
    await withTimeout(client.send(new PutCommand({ TableName: tableName, Item: item })), DYNAMODB_TIMEOUT_MS, 'DynamoDB PutItem')
  } catch {
    // Swallow — the in-memory store (written before this is called) still serves this process.
  }
}

async function queryDynamo(repo: string, limit: number): Promise<AnalysisSnapshotSummary[] | null> {
  const tableName = getTableName()
  if (!tableName) return null
  try {
    const { QueryCommand } = await import('@aws-sdk/lib-dynamodb')
    const client = await getDynamoDocClient()
    const result = await withTimeout(
      client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'repo = :repo',
          ExpressionAttributeValues: { ':repo': repo },
          ScanIndexForward: false, // newest sk first (isoTime is the leading part of sk, so lexicographic = chronological)
          Limit: limit,
        }),
      ),
      DYNAMODB_TIMEOUT_MS,
      'DynamoDB Query',
    )
    return (result.Items as SnapshotItem[] | undefined)?.map(({ ttl: _ttl, ...summary }) => summary) ?? []
  } catch {
    return null // Any DynamoDB failure — treat as "fall back to the in-memory store".
  }
}

async function getFromDynamo(repo: string, sk: string): Promise<AnalysisSnapshotSummary | null> {
  const tableName = getTableName()
  if (!tableName) return null
  try {
    const { GetCommand } = await import('@aws-sdk/lib-dynamodb')
    const client = await getDynamoDocClient()
    const result = await withTimeout(
      client.send(new GetCommand({ TableName: tableName, Key: { repo, sk } })),
      DYNAMODB_TIMEOUT_MS,
      'DynamoDB GetItem',
    )
    if (!result.Item) return null
    const { ttl: _ttl, ...summary } = result.Item as SnapshotItem
    return summary
  } catch {
    return null
  }
}

/** Saves a snapshot. Throws SnapshotTooLargeError (never silently truncates) if it exceeds the
 * 100 KB/item cap. Snapshots are append-only: each (repo, sk) pair is written exactly once, since
 * sk embeds the save timestamp — there is no update/delete path anywhere in this module. */
export async function saveSnapshot(summary: AnalysisSnapshotSummary): Promise<void> {
  assertWithinSizeCap(summary)
  const list = memoryStore.get(summary.repo) ?? []
  list.push(summary)
  list.sort((a, b) => b.sk.localeCompare(a.sk))
  memoryStore.set(summary.repo, list)
  if (isDynamoConfigured()) await putInDynamo(summary)
}

export async function getHistory(repo: string, limit = MAX_HISTORY): Promise<AnalysisSnapshotSummary[]> {
  const cappedLimit = Math.min(limit, MAX_HISTORY)
  if (!isDynamoConfigured()) return (memoryStore.get(repo) ?? []).slice(0, cappedLimit)
  const fromDynamo = await queryDynamo(repo, cappedLimit)
  return fromDynamo ?? (memoryStore.get(repo) ?? []).slice(0, cappedLimit)
}

export async function getSnapshotBySk(repo: string, sk: string): Promise<AnalysisSnapshotSummary | null> {
  if (!isDynamoConfigured()) return (memoryStore.get(repo) ?? []).find((s) => s.sk === sk) ?? null
  const fromDynamo = await getFromDynamo(repo, sk)
  return fromDynamo ?? (memoryStore.get(repo) ?? []).find((s) => s.sk === sk) ?? null
}

/** Clears ONLY the in-memory fallback store — never touches DynamoDB, same guarantee as
 * cache.ts's clearCache(). Test-only. */
export function clearSnapshotStore(): void {
  memoryStore.clear()
}
