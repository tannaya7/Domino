import {
  buildCorrelatedModel,
  redundancyGroupDownProbability,
  UNSHAREABLE_SUBSTRATE_TAGS,
  type CorrelatedModelOverrides,
} from '../engine/correlated'
import type { Vendor } from './types'

export interface DetectedRedundancyGroup {
  tier: string
  memberKeys: string[]
  memberNames: string[]
  /** Exact P(every member down at once) — same engine as the availability model, so this number is
   * never a second, drifting computation of "how correlated risk works" in this app. */
  groupDownProbabilityPerYear: number
  /** True when 2+ members of this group share a substrate — the "redundancy" may not survive a
   * single substrate outage. Purely structural: we cannot see whether the code actually fails over
   * between these vendors at all, redundancy-illusion or not. */
  redundancyIllusion: boolean
  /** Substrates shared by 2+ members, driving the flag above. */
  sharedSubstrates: string[]
}

/** Vendors grouped by category (tier) where 2+ share it — the only signal we have for "these might
 * substitute for each other." Two vendors sharing a tier are not proven to be interchangeable in
 * this app's code; see the UI label ("possible redundancy: we can't see whether your code actually
 * fails over"). */
export function findCategoryRedundancyGroups(vendors: Vendor[]): Array<{ tier: string; memberKeys: string[] }> {
  const byTier = new Map<string, string[]>()
  for (const v of vendors) {
    if (!byTier.has(v.tier)) byTier.set(v.tier, [])
    byTier.get(v.tier)!.push(v.key)
  }
  return [...byTier.entries()]
    .filter(([, keys]) => keys.length >= 2)
    .map(([tier, memberKeys]) => ({ tier, memberKeys }))
    .sort((a, b) => a.tier.localeCompare(b.tier))
}

function realSubstrates(vendor: Vendor): Set<string> {
  return new Set(vendor.substrate.filter((s) => !UNSHAREABLE_SUBSTRATE_TAGS.has(s.toLowerCase())))
}

/** Substrates shared by at least 2 of the given vendors (not necessarily all of them) — the
 * condition under which a single substrate outage could take out more than one "redundant" vendor
 * at once. */
function sharedSubstratesAmong(members: Vendor[]): string[] {
  const counts = new Map<string, number>()
  for (const v of members) {
    for (const s of realSubstrates(v)) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([s]) => s)
    .sort()
}

/**
 * Groups detected vendors by category, computes exact P(the whole group down at once) via the same
 * correlated-failure engine the availability model uses, and flags "redundancy illusion" when
 * members of a group share a substrate. Returns [] when no category has 2+ vendors — reported as
 * such by the caller, not hidden.
 */
export function analyzeDetectedRedundancy(
  vendors: Vendor[],
  overrides: CorrelatedModelOverrides = {},
): DetectedRedundancyGroup[] {
  if (vendors.length === 0) return []
  const model = buildCorrelatedModel(vendors, overrides)
  const vendorByKey = new Map(vendors.map((v) => [v.key, v]))

  return findCategoryRedundancyGroups(vendors).map(({ tier, memberKeys }) => {
    const members = memberKeys.map((k) => vendorByKey.get(k)!)
    const sharedSubstrates = sharedSubstratesAmong(members)
    return {
      tier,
      memberKeys,
      memberNames: members.map((v) => v.vendor),
      groupDownProbabilityPerYear: redundancyGroupDownProbability(model, memberKeys),
      redundancyIllusion: sharedSubstrates.length > 0,
      sharedSubstrates,
    }
  })
}
