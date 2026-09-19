// Resolves what-if overrides (Prompt 15) against the curated vendor knowledge base and ranks
// mitigation candidates deterministically. This is the one place that bridges the pure engine
// (src/engine, src/lib — no vendor-map knowledge) with the curated data (./vendorMap.ts) needed to
// turn a bare failover *name* into a full synthetic Vendor with a substrate and SLA.

import { KNOWN_SHAREABLE_SUBSTRATES } from '../../src/engine/correlated'
import { buildWhatIfResult } from '../../src/lib/availability'
import type { ExactAvailabilityAssumptions, RecommendedMove, Vendor, VendorEntry, WhatIfOverride, WhatIfResult } from '../../src/lib/types'
import { VENDOR_MAP } from './vendorMap'

export const MAX_WHATIF_OVERRIDES = 3
/** Top N mitigations to surface — enough to inform a decision without turning into a second dashboard. */
const RECOMMENDED_MOVES_LIMIT = 3

function findVendorEntryByName(name: string): { key: string; entry: VendorEntry } | null {
  for (const [key, entry] of Object.entries(VENDOR_MAP)) {
    if (entry.vendor === name) return { key, entry }
  }
  return null
}

export interface ResolvedWhatIf {
  mitigatedVendors: Vendor[]
  redundancyGroups: string[][]
  appliedOverrides: WhatIfOverride[]
  unresolvedFailovers: string[]
}

/**
 * Applies every override to a fresh copy of `baselineVendors`, producing the mitigated vendor list
 * and the redundancy groups the exact engine needs (see correlatedAvailabilityWithRedundancy).
 * Throws a plain Error (-> 400 via apiRouter's errorMessage) for a vendorId/substrate that isn't
 * real — those come from a UI-controlled dropdown, so an unknown value is a client bug, not a
 * data-quality gap. An unresolvable `failoverVendorId` (a curated `fallbacks` name with no matching
 * VENDOR_MAP entry — e.g. Stripe's curated "Adyen") is NOT an error: it's a real gap in the curated
 * data, reported via `unresolvedFailovers` rather than silently doing nothing or throwing.
 */
export function resolveWhatIfOverrides(baselineVendors: Vendor[], overrides: WhatIfOverride[]): ResolvedWhatIf {
  const vendors = baselineVendors.map((v) => ({ ...v }))
  const byKey = new Map(vendors.map((v) => [v.key, v]))
  const byName = new Map(vendors.map((v) => [v.vendor, v]))
  const redundancyGroups: string[][] = []
  const unresolvedFailovers: string[] = []

  for (const override of overrides) {
    const vendor = byKey.get(override.vendorId)
    if (!vendor) throw new Error(`Unknown vendorId "${override.vendorId}".`)

    if (override.substrate) {
      if (!KNOWN_SHAREABLE_SUBSTRATES.includes(override.substrate)) {
        throw new Error(`Unknown substrate "${override.substrate}".`)
      }
      vendor.substrate = [override.substrate]
    }

    if (override.failoverVendorId) {
      const existing = byName.get(override.failoverVendorId)
      if (existing) {
        if (existing.key === vendor.key) throw new Error(`"${vendor.vendor}" cannot be its own failover.`)
        redundancyGroups.push([vendor.key, existing.key])
      } else {
        const found = findVendorEntryByName(override.failoverVendorId)
        if (!found) {
          unresolvedFailovers.push(override.failoverVendorId)
        } else {
          const syntheticKey = `whatif:${found.key}:for:${vendor.key}`
          const synthetic: Vendor = {
            ...found.entry,
            key: syntheticKey,
            detectedVia: ['what-if: hypothetical failover, not detected in this repo'],
            detectedInFiles: [],
          }
          vendors.push(synthetic)
          byKey.set(syntheticKey, synthetic)
          byName.set(synthetic.vendor, synthetic)
          redundancyGroups.push([vendor.key, syntheticKey])
        }
      }
    }
  }

  return { mitigatedVendors: vendors, redundancyGroups, appliedOverrides: overrides, unresolvedFailovers }
}

export function computeWhatIf(
  baselineVendors: Vendor[],
  overrides: WhatIfOverride[],
  assumptions: ExactAvailabilityAssumptions,
): WhatIfResult {
  const resolved = resolveWhatIfOverrides(baselineVendors, overrides)
  return buildWhatIfResult(baselineVendors, resolved.mitigatedVendors, resolved.redundancyGroups, assumptions, {
    appliedOverrides: resolved.appliedOverrides,
    unresolvedFailovers: resolved.unresolvedFailovers,
  })
}

/**
 * Deterministic top-N mitigation ranking by money saved — no LLM, no randomness. Considers, per
 * detected vendor: moving to each other known substrate, and adding each curated fallback not
 * already detected in this repo — exactly the two move types the what-if panel itself offers.
 * Returns [] (never fabricated) when costPerHourOfDowntime is 0 — there's no currency-denominated
 * saving to rank without a cost basis.
 */
export function rankRecommendedMoves(vendors: Vendor[], assumptions: ExactAvailabilityAssumptions, limit = RECOMMENDED_MOVES_LIMIT): RecommendedMove[] {
  if (assumptions.costPerHourOfDowntime <= 0) return []

  const candidates: RecommendedMove[] = []

  for (const vendor of vendors) {
    const currentSubstrates = new Set(vendor.substrate)
    for (const candidateSubstrate of KNOWN_SHAREABLE_SUBSTRATES) {
      if (currentSubstrates.has(candidateSubstrate)) continue
      const result = computeWhatIf(vendors, [{ vendorId: vendor.key, substrate: candidateSubstrate }], assumptions)
      if (result.delta.expectedAnnualExposure < 0 && result.meaningfulChange) {
        candidates.push({
          vendorId: vendor.key,
          vendorName: vendor.vendor,
          moveType: 'substrate',
          substrate: candidateSubstrate,
          description: `Move ${vendor.vendor} from ${vendor.substrate.join('/') || 'its current substrate'} onto ${candidateSubstrate}`,
          annualSavings: -result.delta.expectedAnnualExposure,
        })
      }
    }

    for (const fallbackName of vendor.fallbacks ?? []) {
      if (vendors.some((v) => v.vendor === fallbackName)) continue // already detected — not a "move" to recommend
      const result = computeWhatIf(vendors, [{ vendorId: vendor.key, failoverVendorId: fallbackName }], assumptions)
      if (result.unresolvedFailovers.length > 0) continue
      if (result.delta.expectedAnnualExposure < 0 && result.meaningfulChange) {
        candidates.push({
          vendorId: vendor.key,
          vendorName: vendor.vendor,
          moveType: 'failover',
          failoverVendorId: fallbackName,
          description: `Add ${fallbackName} as a failover for ${vendor.vendor}`,
          annualSavings: -result.delta.expectedAnnualExposure,
        })
      }
    }
  }

  // Savings desc, then a stable tie-break — never leave ranking order to object/array iteration.
  candidates.sort(
    (a, b) => b.annualSavings - a.annualSavings || a.vendorId.localeCompare(b.vendorId) || a.moveType.localeCompare(b.moveType),
  )

  // At most one recommendation per vendor: three substrate flavors for the same vendor is one
  // decision, not three moves.
  const seenVendors = new Set<string>()
  const ranked: RecommendedMove[] = []
  for (const candidate of candidates) {
    if (seenVendors.has(candidate.vendorId)) continue
    seenVendors.add(candidate.vendorId)
    ranked.push(candidate)
    if (ranked.length >= limit) break
  }
  return ranked
}
