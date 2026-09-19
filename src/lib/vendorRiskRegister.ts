import { getRiskLevel, type RiskLevel } from './risk'
import type { VendorWithBlastRadius } from './types'

export interface VendorRiskRow {
  key: string
  vendor: string
  tier: string
  substrate: string
  detectedVia: string
  filesAffected: number
  entrypointsAffected: number
  /** Share (0-1) of the naive annual downtime allocated to this vendor, proportional to its own
   * SLA-implied outage probability relative to every other vendor's. This is an ALLOCATION, not a
   * decomposition of the correlated model — correlated failures can't be cleanly attributed to one
   * vendor without further assumptions this app doesn't have. Labeled as such in the UI. */
  downtimeShare: number
  /** downtimeShare * naive annual downtime hours * cost/hour — a notional annual cost allocation,
   * not a probability-weighted causal figure for this vendor alone. */
  costPerYear: number
  risk: RiskLevel
}

/**
 * Builds one risk-register row per vendor. Pure — no I/O, no live status (merged in by the caller,
 * since that's dynamic per-fetch data this function has no business owning).
 */
export function buildVendorRiskRows(
  vendors: VendorWithBlastRadius[],
  entrypoints: string[],
  naiveDowntimeHoursPerYear: number,
  costPerHour: number,
): VendorRiskRow[] {
  const entrypointSet = new Set(entrypoints)
  const ownOutageProbabilities = vendors.map((v) => Math.max(0, 1 - v.sla))
  const totalOwnOutage = ownOutageProbabilities.reduce((sum, p) => sum + p, 0)

  return vendors.map((v, i) => {
    const share =
      totalOwnOutage > 0 ? ownOutageProbabilities[i] / totalOwnOutage : vendors.length > 0 ? 1 / vendors.length : 0
    const filesAffected = v.affectedFiles.length
    const entrypointsAffected = v.affectedFiles.filter((f) => entrypointSet.has(f)).length

    return {
      key: v.key,
      vendor: v.vendor,
      tier: v.tier,
      substrate: v.substrate.length > 0 ? v.substrate.join(', ') : 'self-hosted/unknown',
      detectedVia: v.detectedVia.length > 0 ? v.detectedVia.join(', ') : 'unknown',
      filesAffected,
      entrypointsAffected,
      downtimeShare: share,
      costPerYear: share * naiveDowntimeHoursPerYear * costPerHour,
      risk: getRiskLevel(filesAffected),
    }
  })
}
