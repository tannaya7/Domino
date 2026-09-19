import type { Vendor } from '../lib/types'

// Pure math only — no I/O, no randomness. Every function here is deterministic and exact (up to
// IEEE-754 floating point precision); Monte Carlo lives in ../lib/availability.ts and is used only
// as a seeded test oracle to cross-validate this module (see correlated.test.ts).

/**
 * Substrate tags that do NOT represent a real, shareable piece of hosting infrastructure. A vendor
 * carrying only these has nothing to correlate with anyone else — it contributes only its own
 * outage probability, never a shared-substrate channel. Never fabricate a correlation partner for
 * "self-hosted" or "we don't know" — that's exactly the kind of made-up precision this model exists
 * to avoid.
 */
export const UNSHAREABLE_SUBSTRATE_TAGS = new Set(['self', 'other', 'unknown', ''])

/** Deliberately round and clearly illustrative — there is no independently measured per-substrate
 * outage rate to draw from. Editable per substrate in the Assumptions panel. */
export const DEFAULT_SUBSTRATE_OUTAGE_PROBABILITY = 0.001

/** Enumerating 2^|S| substrate states is only tractable for small |S|; today's substrate tags
 * (aws/gcp/azure/cloudflare/vercel) never come close. Fail loudly rather than silently hang or
 * produce an approximation nobody asked for. */
const MAX_SUBSTRATES = 12

export interface CorrelatedVendorInput {
  key: string
  label: string
  /** u_v — this vendor's own outage probability, independent of any substrate, from its SLA. */
  ownOutageProbability: number
  /** Real, shareable substrates only (self/other/unknown already filtered out). */
  substrates: string[]
}

export interface CorrelatedModel {
  vendors: CorrelatedVendorInput[]
  /** q_s per substrate — every substrate that appears in at least one vendor's `substrates`. */
  substrateOutageProbabilities: Record<string, number>
}

export interface CorrelatedModelOverrides {
  /** Keyed by Vendor.key, fraction e.g. 0.999 — same override channel as the Assumptions panel. */
  vendorSlaOverrides?: Record<string, number>
  /** Keyed by substrate id, fraction e.g. 0.001 — illustrative unless the user supplies real data. */
  substrateOutageProbabilities?: Record<string, number>
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

/** Builds the model's plain-number inputs from detected vendors — the only place Vendor objects
 * and "SLA" language exist in this module; everything past this point is just probabilities. */
export function buildCorrelatedModel(vendors: Vendor[], overrides: CorrelatedModelOverrides = {}): CorrelatedModel {
  const slaOverrides = overrides.vendorSlaOverrides ?? {}
  const substrateOverrides = overrides.substrateOutageProbabilities ?? {}

  const modelVendors: CorrelatedVendorInput[] = vendors.map((v) => {
    const sla = v.key in slaOverrides ? slaOverrides[v.key] : v.sla
    const substrates = [...new Set(v.substrate.filter((s) => !UNSHAREABLE_SUBSTRATE_TAGS.has(s.toLowerCase())))]
    return { key: v.key, label: v.vendor, ownOutageProbability: clamp01(1 - sla), substrates }
  })

  const substrateIds = [...new Set(modelVendors.flatMap((v) => v.substrates))].sort()
  if (substrateIds.length > MAX_SUBSTRATES) {
    throw new Error(
      `${substrateIds.length} distinct substrates exceeds the exact engine's cap of ${MAX_SUBSTRATES} (2^|S| state enumeration).`,
    )
  }

  const substrateOutageProbabilities: Record<string, number> = {}
  for (const s of substrateIds) {
    substrateOutageProbabilities[s] = clamp01(s in substrateOverrides ? substrateOverrides[s] : DEFAULT_SUBSTRATE_OUTAGE_PROBABILITY)
  }

  return { vendors: modelVendors, substrateOutageProbabilities }
}

/** Vendor keys whose substrate list has no real (shareable) entries — reported so the UI can say
 * "N vendors with unknown hosting, not counted as correlated" instead of silently ignoring them. */
export function unknownHostingVendorKeys(model: CorrelatedModel): string[] {
  return model.vendors.filter((v) => v.substrates.length === 0).map((v) => v.key)
}

/**
 * The Poisson-binomial PMF of the number of "successes" (here: outages) among independent Bernoulli
 * trials with the given probabilities. Standard O(V^2) DP: pmf[k] after i trials is built from
 * pmf[k] and pmf[k-1] after i-1 trials. Returns an array of length probabilities.length + 1.
 */
export function poissonBinomialPmf(probabilities: number[]): number[] {
  let pmf = [1]
  for (const p of probabilities) {
    const next = new Array(pmf.length + 1).fill(0)
    for (let k = 0; k < pmf.length; k++) {
      next[k] += pmf[k] * (1 - p)
      next[k + 1] += pmf[k] * p
    }
    pmf = next
  }
  return pmf
}

/** Kahan-compensated accumulation into `total[index]` — keeps the many-small-terms sum in
 * pmfNumberDown accurate to the 1e-12-ish tolerance the exact engine promises. */
function kahanAdd(total: Float64Array, compensation: Float64Array, index: number, term: number): void {
  const y = term - compensation[index]
  const t = total[index] + y
  compensation[index] = t - total[index] - y
  total[index] = t
}

/**
 * Exact PMF of N = number of vendors down at once. Enumerates every 2^|S'| state of the substrates
 * NOT in `forcedDownSubstrates` (those are treated as certainly down — this is what lets the same
 * function serve both the unconditional model and a "simulate this substrate outage" scenario).
 * Within a state, vendors touching a down substrate are down for certain; the rest are independent
 * Bernoulli(ownOutageProbability), combined via poissonBinomialPmf and shifted by the certain count.
 */
export function pmfNumberDown(model: CorrelatedModel, forcedDownSubstrates: ReadonlySet<string> = new Set()): number[] {
  const freeSubstrates = Object.keys(model.substrateOutageProbabilities).filter((s) => !forcedDownSubstrates.has(s))
  const vendorCount = model.vendors.length
  const total = new Float64Array(vendorCount + 1)
  const compensation = new Float64Array(vendorCount + 1)
  const stateCount = 1 << freeSubstrates.length

  for (let mask = 0; mask < stateCount; mask++) {
    const downSet = new Set<string>(forcedDownSubstrates)
    let stateProbability = 1
    for (let i = 0; i < freeSubstrates.length; i++) {
      const s = freeSubstrates[i]
      const q = model.substrateOutageProbabilities[s]
      if (mask & (1 << i)) {
        downSet.add(s)
        stateProbability *= q
      } else {
        stateProbability *= 1 - q
      }
    }
    if (stateProbability === 0) continue

    let forcedDownCount = 0
    const remainingProbabilities: number[] = []
    for (const v of model.vendors) {
      if (v.substrates.some((s) => downSet.has(s))) forcedDownCount++
      else remainingProbabilities.push(v.ownOutageProbability)
    }

    const statePmf = poissonBinomialPmf(remainingProbabilities)
    for (let k = 0; k < statePmf.length; k++) {
      kahanAdd(total, compensation, k + forcedDownCount, stateProbability * statePmf[k])
    }
  }

  return Array.from(total)
}

/** P(N >= k), summed directly from the (typically tiny) upper tail — never `1 - cdf(k-1)`, which
 * loses precision to catastrophic cancellation when the tail is small and the CDF is near 1. */
export function tailProbability(pmf: number[], k: number): number {
  let sum = 0
  let compensation = 0
  for (let i = Math.max(0, Math.ceil(k)); i < pmf.length; i++) {
    const y = pmf[i] - compensation
    const t = sum + y
    compensation = t - sum - y
    sum = t
  }
  return sum
}

export function expectedValue(pmf: number[]): number {
  return pmf.reduce((sum, p, k) => sum + k * p, 0)
}

export function pmfSum(pmf: number[]): number {
  return pmf.reduce((a, b) => a + b, 0)
}

/** NAIVE comparator: fully independent, p_v = u_v — exactly what naive SLA-product math sees. */
export function naiveProbabilities(model: CorrelatedModel): number[] {
  return model.vendors.map((v) => v.ownOutageProbability)
}

/**
 * INDEPENDENT-SAME-MARGINALS comparator: fully independent, but each vendor's marginal probability
 * already folds in its substrate(s)' risk: p_v = 1 - (1 - u_v) * prod_{s in substrates(v)} (1 - q_s).
 * This has IDENTICAL per-vendor marginals to the correlated model — the only difference between the
 * two is whether shared substrates are sampled once (correlated) or independently per vendor (this
 * comparator) — isolating the pure effect of sharing from the effect of substrate risk existing at all.
 */
export function sameMarginalsProbabilities(model: CorrelatedModel): number[] {
  return model.vendors.map((v) => {
    const substrateUpProduct = v.substrates.reduce(
      (acc, s) => acc * (1 - model.substrateOutageProbabilities[s]),
      1,
    )
    return 1 - (1 - v.ownOutageProbability) * substrateUpProduct
  })
}

/** Closed-form series-system availability from independent per-vendor down-probabilities. */
export function seriesAvailabilityFromProbabilities(probabilities: number[]): number {
  return probabilities.reduce((acc, p) => acc * (1 - p), 1)
}

/**
 * Closed-form correlated availability: prod_s(1-q_s) * prod_v(1-u_v) — equals pmfNumberDown(model)[0].
 * Only substrates with at least one vendor on them enter the product: an entry in
 * `substrateOutageProbabilities` with no vendor attached genuinely can't affect whether any vendor
 * is up, and including it anyway would silently understate availability for a substrate that isn't
 * even connected to anything.
 */
export function correlatedSeriesAvailability(model: CorrelatedModel): number {
  const usedSubstrates = new Set(model.vendors.flatMap((v) => v.substrates))
  let a = 1
  for (const s of usedSubstrates) a *= 1 - model.substrateOutageProbabilities[s]
  for (const v of model.vendors) a *= 1 - v.ownOutageProbability
  return a
}

export interface WorstSingleEvent {
  substrate: string
  vendorKeys: string[]
  /** q_s for this substrate — the modeled annual probability of this exact event. */
  probabilityPerYear: number
}

/** The single substrate outage that would take down the most vendors at once, ties broken by
 * substrate name for determinism. `null` when there are no shared substrates at all. */
export function findWorstSingleEvent(model: CorrelatedModel): WorstSingleEvent | null {
  let best: WorstSingleEvent | null = null
  for (const substrate of Object.keys(model.substrateOutageProbabilities)) {
    const vendorKeys = model.vendors.filter((v) => v.substrates.includes(substrate)).map((v) => v.key)
    if (vendorKeys.length === 0) continue
    if (!best || vendorKeys.length > best.vendorKeys.length || (vendorKeys.length === best.vendorKeys.length && substrate < best.substrate)) {
      best = { substrate, vendorKeys, probabilityPerYear: model.substrateOutageProbabilities[substrate] }
    }
  }
  return best
}

/**
 * Same-category-alternative pairs: vendor A's curated `fallbacks` (server/src/vendorMap.ts) naming
 * vendor B, where B is ALSO detected in this repo. This is real, curated data, not an inferred
 * guess from matching tiers — two vendors sharing a tier are not necessarily substitutes for each
 * other in a given app. Returns [] when no such pair exists; callers should say so, not silently
 * omit the section (there is no "Prompt 5 failover" data source in this codebase to fall back to).
 */
export function findRedundancyGroupCandidates(vendors: Vendor[]): string[][] {
  const keyByName = new Map(vendors.map((v) => [v.vendor, v.key]))
  const seenPairs = new Set<string>()
  const groups: string[][] = []
  for (const v of vendors) {
    for (const fallbackName of v.fallbacks ?? []) {
      const fallbackKey = keyByName.get(fallbackName)
      if (!fallbackKey || fallbackKey === v.key) continue
      const pair = [v.key, fallbackKey].sort()
      const pairId = pair.join('|')
      if (seenPairs.has(pairId)) continue
      seenPairs.add(pairId)
      groups.push(pair)
    }
  }
  return groups
}

/** Exact P(every member of this group is down at once) — the capability the group backs is only
 * lost if ALL substitutes fail simultaneously. Reuses the same substrate-state enumeration. */
export function redundancyGroupDownProbability(model: CorrelatedModel, memberKeys: string[]): number {
  const members = model.vendors.filter((v) => memberKeys.includes(v.key))
  if (members.length === 0) return 0

  const substrateIds = Object.keys(model.substrateOutageProbabilities)
  const stateCount = 1 << substrateIds.length
  let total = 0
  let compensation = 0

  for (let mask = 0; mask < stateCount; mask++) {
    const downSet = new Set<string>()
    let stateProbability = 1
    for (let i = 0; i < substrateIds.length; i++) {
      const s = substrateIds[i]
      const q = model.substrateOutageProbabilities[s]
      if (mask & (1 << i)) {
        downSet.add(s)
        stateProbability *= q
      } else {
        stateProbability *= 1 - q
      }
    }
    if (stateProbability === 0) continue

    let allDownProbability = 1
    for (const v of members) {
      allDownProbability *= v.substrates.some((s) => downSet.has(s)) ? 1 : v.ownOutageProbability
    }

    const term = stateProbability * allDownProbability
    const y = term - compensation
    const t = total + y
    compensation = t - total - y
    total = t
  }

  return total
}

/**
 * Exact P(every substrate in `requiredDownSubstrates` is down AND every vendor in
 * `requiredDownVendorKeys` is down) — the compound-scenario builder's core primitive
 * (src/engine/scenario.ts). Unlike `pmfNumberDown`'s `forcedDownSubstrates` (which treats a
 * substrate as certainly down — useful for "given this outage, what else falls"), a REQUIRED
 * substrate here still carries its own q_s: this is the joint probability of these specific things
 * simultaneously failing, not a conditional-on-them-already-failing.
 *
 * Only substrates that can change the answer are enumerated: the required substrates themselves
 * (each contributing its own q_s once, not once per vendor), plus any substrate a required vendor
 * touches (its on/off state decides whether that vendor's "down via shared substrate" branch
 * fires). Every other substrate in the model marginalizes out to exactly 1 and is never enumerated.
 * This is what "don't multiply marginals" means in practice: a substrate shared by two required
 * vendors is sampled ONCE per state, preserving the correlation between them, rather than each
 * vendor's down-probability being computed independently and multiplied together.
 */
export function scenarioCombinationProbability(
  model: CorrelatedModel,
  requiredDownSubstrates: ReadonlySet<string>,
  requiredDownVendorKeys: ReadonlySet<string>,
): number {
  const requiredVendors = model.vendors.filter((v) => requiredDownVendorKeys.has(v.key))

  const relevantSubstrates = new Set<string>(requiredDownSubstrates)
  for (const v of requiredVendors) for (const s of v.substrates) relevantSubstrates.add(s)
  const enumeratedSubstrates = [...relevantSubstrates].filter((s) => !requiredDownSubstrates.has(s))

  let requiredSubstrateProbability = 1
  for (const s of requiredDownSubstrates) requiredSubstrateProbability *= model.substrateOutageProbabilities[s] ?? 0
  if (requiredSubstrateProbability === 0) return 0

  const stateCount = 1 << enumeratedSubstrates.length
  let total = 0
  let compensation = 0

  for (let mask = 0; mask < stateCount; mask++) {
    const downSet = new Set<string>(requiredDownSubstrates)
    let stateProbability = requiredSubstrateProbability
    for (let i = 0; i < enumeratedSubstrates.length; i++) {
      const s = enumeratedSubstrates[i]
      const q = model.substrateOutageProbabilities[s]
      if (mask & (1 << i)) {
        downSet.add(s)
        stateProbability *= q
      } else {
        stateProbability *= 1 - q
      }
    }
    if (stateProbability === 0) continue

    let combinationProbability = stateProbability
    for (const v of requiredVendors) {
      combinationProbability *= v.substrates.some((s) => downSet.has(s)) ? 1 : v.ownOutageProbability
      if (combinationProbability === 0) break
    }

    const y = combinationProbability - compensation
    const t = total + y
    compensation = t - total - y
    total = t
  }

  return total
}
