import type { Vendor } from '../../src/lib/types'
import { publishVendorDegradationAlert } from './sns'
import { fetchAllVendorStatuses } from './statusPoll'

// EventBridge Scheduler target Lambda (rate: 5 minutes), replacing the in-process scheduler.ts
// used by local dev / the single-process demo. This is a SEPARATE Lambda from the API handler, so
// it has no in-memory vendor list to poll from — instead it reconstructs the watchlist by
// scanning graph-cache in DynamoDB for every repo anyone has analyzed recently, deduplicating
// vendors by key. A full table Scan is fine at hackathon scale (a handful of cached repos); it
// would need pagination/a GSI before this table grows large.

function getTableName(): string | undefined {
  return process.env.DYNAMODB_GRAPH_CACHE_TABLE
}

function getRegion(): string {
  return process.env.AWS_REGION ?? 'us-east-1'
}

interface CachedGraphItem {
  graph_data: string
}

/** Never throws — returns [] if DynamoDB isn't configured, unreachable, or every item is malformed. */
async function loadWatchedVendorsFromDynamo(): Promise<Vendor[]> {
  const tableName = getTableName()
  if (!tableName) return []

  try {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb')
    const { DynamoDBDocumentClient, ScanCommand } = await import('@aws-sdk/lib-dynamodb')
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: getRegion() }))

    const result = await client.send(
      new ScanCommand({ TableName: tableName, ProjectionExpression: 'graph_data' }),
    )

    const vendorsByKey = new Map<string, Vendor>()
    for (const item of (result.Items ?? []) as CachedGraphItem[]) {
      try {
        const cached = JSON.parse(item.graph_data) as { vendors?: Vendor[] }
        for (const vendor of cached.vendors ?? []) vendorsByKey.set(vendor.key, vendor)
      } catch {
        // One malformed cache entry shouldn't block polling every other cached repo's vendors.
      }
    }
    return [...vendorsByKey.values()]
  } catch {
    return []
  }
}

export interface SchedulerResult {
  vendorsPolled: number
  alertsPublished: number
}

/** The actual poll-and-alert cycle, independent of how the Lambda runtime invokes it. */
export async function pollAndAlert(): Promise<SchedulerResult> {
  const vendors = await loadWatchedVendorsFromDynamo()
  if (vendors.length === 0) return { vendorsPolled: 0, alertsPublished: 0 }

  const statuses = await fetchAllVendorStatuses(vendors)
  let alertsPublished = 0

  for (const status of statuses) {
    if (status.indicator !== 'degraded' && status.indicator !== 'outage') continue
    const vendor = vendors.find((v) => v.key === status.vendorKey)
    if (!vendor) continue
    const result = await publishVendorDegradationAlert({
      vendorKey: vendor.key,
      vendorName: vendor.vendor,
      indicator: status.indicator,
      description: status.description,
    })
    if (result.published) alertsPublished++
  }

  return { vendorsPolled: vendors.length, alertsPublished }
}

/** EventBridge Scheduler target. Logs its own summary so a run is visible in CloudWatch Logs without needing to inspect a return value. */
export async function handler(): Promise<SchedulerResult> {
  const result = await pollAndAlert()
  console.log(`[schedulerHandler] polled ${result.vendorsPolled} vendor(s), published ${result.alertsPublished} alert(s)`)
  return result
}
