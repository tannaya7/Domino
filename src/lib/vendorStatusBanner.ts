import type { StatusIndicator, VendorStatus } from './types'

export interface BannerCandidate {
  vendorKey: string
  indicator: 'degraded' | 'outage'
  entrypointsAffected: number
}

const SEVERITY: Partial<Record<StatusIndicator, number>> = { outage: 2, degraded: 1 }

/**
 * Which vendor's status the top banner should feature, when one or more are degraded/outage.
 * Worst status wins (outage beats degraded); ties broken by the vendor with the most entrypoints
 * depending on it (the banner's whole point is "this matters"), then by key for determinism.
 * `null` when nothing is degraded/outage — operational and unknown never trigger a banner.
 */
export function selectBannerVendor(
  vendorStatuses: VendorStatus[],
  entrypointsAffectedByVendorKey: Map<string, number>,
): BannerCandidate | null {
  const candidates = vendorStatuses.filter(
    (s): s is VendorStatus & { indicator: 'degraded' | 'outage' } => s.indicator === 'degraded' || s.indicator === 'outage',
  )
  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const severityDiff = SEVERITY[b.indicator]! - SEVERITY[a.indicator]!
    if (severityDiff !== 0) return severityDiff
    const entrypointsDiff =
      (entrypointsAffectedByVendorKey.get(b.vendorKey) ?? 0) - (entrypointsAffectedByVendorKey.get(a.vendorKey) ?? 0)
    if (entrypointsDiff !== 0) return entrypointsDiff
    return a.vendorKey.localeCompare(b.vendorKey)
  })

  const top = candidates[0]
  return { vendorKey: top.vendorKey, indicator: top.indicator, entrypointsAffected: entrypointsAffectedByVendorKey.get(top.vendorKey) ?? 0 }
}
