import type { StatusIndicator, Vendor, VendorStatus } from '../../src/lib/types'

const FETCH_TIMEOUT_MS = 4000

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

interface StatuspageV2Response {
  status?: { indicator?: string; description?: string }
}

function mapStatuspageIndicator(raw: string | undefined): StatusIndicator {
  switch (raw) {
    case 'none':
      return 'operational'
    case 'minor':
      return 'degraded'
    case 'major':
    case 'critical':
      return 'outage'
    default:
      return 'unknown'
  }
}

/**
 * Fetches one vendor's Statuspage v2 `status.json` feed. Never throws and never fabricates
 * "operational" — any failure (no statusUrl, network error, timeout, bad JSON) reports 'unknown'
 * with `stale: true` so the UI can show "status unavailable" rather than a false green light.
 */
export async function fetchVendorStatus(vendor: Vendor): Promise<VendorStatus> {
  const checkedAt = new Date().toISOString()
  if (!vendor.statusUrl) {
    return { vendorKey: vendor.key, indicator: 'unknown', checkedAt, stale: true }
  }
  try {
    const res = await fetchWithTimeout(vendor.statusUrl, FETCH_TIMEOUT_MS)
    if (!res.ok) return { vendorKey: vendor.key, indicator: 'unknown', checkedAt, stale: true }
    const data = (await res.json()) as StatuspageV2Response
    return {
      vendorKey: vendor.key,
      indicator: mapStatuspageIndicator(data.status?.indicator),
      description: data.status?.description,
      checkedAt,
      stale: false,
    }
  } catch {
    return { vendorKey: vendor.key, indicator: 'unknown', checkedAt, stale: true }
  }
}

/** Polls every vendor concurrently; one slow/failing vendor never blocks the others. */
export async function fetchAllVendorStatuses(vendors: Vendor[]): Promise<VendorStatus[]> {
  return Promise.all(vendors.map((vendor) => fetchVendorStatus(vendor)))
}
