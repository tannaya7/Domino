import type { AwsHealthStatus } from '../../src/lib/types'
import { withTimeout } from './withTimeout'

// AWS Health's account-specific describeEvents API requires a Business or Enterprise Support
// plan — on any other account it throws SubscriptionRequiredException regardless of correct code.
// We therefore only attempt it when explicitly opted in (AWS_HEALTH_ENABLED=true), and always fall
// back to the public AWS status feed — never fabricating a "healthy" result either way.

const PUBLIC_STATUS_FEED_URL = 'https://status.aws.amazon.com/rss/all.rss'
const FETCH_TIMEOUT_MS = 4000

export function isAwsHealthApiEnabled(): boolean {
  return process.env.AWS_HEALTH_ENABLED === 'true'
}

function getRegion(): string {
  return process.env.AWS_REGION ?? 'us-east-1'
}

async function tryAwsHealthApi(): Promise<AwsHealthStatus | null> {
  if (!isAwsHealthApiEnabled()) return null
  try {
    const { HealthClient, DescribeEventsCommand } = await import('@aws-sdk/client-health')
    const client = new HealthClient({ region: getRegion() })
    const result = await withTimeout(
      client.send(new DescribeEventsCommand({ filter: { eventStatusCodes: ['open', 'upcoming'] } })),
      5000,
      'AWS Health describeEvents',
    )
    const openEventCount = result.events?.length ?? 0
    return {
      source: 'aws-health-api',
      indicator: openEventCount > 0 ? 'degraded' : 'operational',
      checkedAt: new Date().toISOString(),
      note: `${openEventCount} open/upcoming AWS Health event(s) for this account.`,
    }
  } catch {
    // Most accounts: SubscriptionRequiredException (no Business/Enterprise plan) or no
    // credentials configured yet. Fall through to the public feed rather than erroring.
    return null
  }
}

async function tryPublicStatusFeed(): Promise<AwsHealthStatus | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(PUBLIC_STATUS_FEED_URL, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) return null
    await res.text()
    // Reachability is the signal here — this feed's format isn't a documented, stable per-service
    // API, so we deliberately don't parse it into a granular status (that would be false precision).
    return {
      source: 'public-status-feed',
      indicator: 'unknown',
      checkedAt: new Date().toISOString(),
      note: 'AWS public status feed is reachable. Per-service detail is not parsed from it — see status.aws.amazon.com for specifics.',
    }
  } catch {
    return null
  }
}

/** Never throws; a fully unreachable result reports source "unknown", not a fabricated status. */
export async function getAwsHealthStatus(): Promise<AwsHealthStatus> {
  return (await tryAwsHealthApi()) ?? (await tryPublicStatusFeed()) ?? {
    source: 'unknown',
    indicator: 'unknown',
    checkedAt: new Date().toISOString(),
    note: 'Could not reach the AWS Health API or the public AWS status feed.',
  }
}
