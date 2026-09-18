import type { Vendor } from '../../src/lib/types'
import { publishVendorDegradationAlert } from './sns'
import { fetchAllVendorStatuses } from './statusPoll'

// Local-process stand-in for an EventBridge Scheduler rule invoking a Lambda on a fixed cadence.
// The real AWS deployment (see DEPLOYMENT.md) is: EventBridge rule --rate(5 minutes)--> Lambda
// running this exact fetchAllVendorStatuses + publishVendorDegradationAlert logic. Swapping this
// module out for that Lambda handler is a packaging change, not a logic rewrite.

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000

function getPollIntervalMs(): number {
  const raw = Number(process.env.STATUS_POLL_INTERVAL_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_POLL_INTERVAL_MS
}

let intervalHandle: ReturnType<typeof setInterval> | null = null
let vendorsToWatch: Vendor[] = []

/** Replaces the set of vendors the scheduler polls — called after each successful repo analysis. */
export function setVendorsToWatch(vendors: Vendor[]): void {
  vendorsToWatch = vendors
}

export async function pollVendorStatusOnce(): Promise<void> {
  if (vendorsToWatch.length === 0) return
  const statuses = await fetchAllVendorStatuses(vendorsToWatch)
  for (const status of statuses) {
    if (status.indicator !== 'degraded' && status.indicator !== 'outage') continue
    const vendor = vendorsToWatch.find((v) => v.key === status.vendorKey)
    if (!vendor) continue
    await publishVendorDegradationAlert({
      vendorKey: vendor.key,
      vendorName: vendor.vendor,
      indicator: status.indicator,
      description: status.description,
    })
  }
}

export function startStatusPolling(): void {
  if (intervalHandle) return
  intervalHandle = setInterval(() => {
    pollVendorStatusOnce().catch(() => {
      // A single failed poll cycle should never crash the process or stop future cycles.
    })
  }, getPollIntervalMs())
  // Don't let this timer keep the Node process alive on its own (e.g. during tests/CLI usage).
  intervalHandle.unref?.()
}

export function stopStatusPolling(): void {
  if (intervalHandle) clearInterval(intervalHandle)
  intervalHandle = null
}
