import {
  buildCorrelatedModel,
  correlatedAvailabilityWithRedundancy,
  correlatedSeriesAvailability,
  findRedundancyGroupCandidates,
  findWorstSingleEvent,
  naiveProbabilities,
  pmfNumberDown,
  poissonBinomialPmf,
  redundancyGroupDownProbability,
  sameMarginalsProbabilities,
  seriesAvailabilityFromProbabilities,
  tailProbability,
  unknownHostingVendorKeys,
} from '../engine/correlated'
import type {
  AvailabilityAssumptions,
  AvailabilityHeadline,
  ExactAvailabilityAssumptions,
  ExactAvailabilityResult,
  FailureScenario,
  FailureScenarioResult,
  RedundancyGroupSummary,
  SimulationResult,
  TailRiskPoint,
  Vendor,
  WhatIfOverride,
  WhatIfResult,
  WhatIfSnapshot,
  WorstSingleEventSummary,
} from './types'

const HOURS_PER_YEAR = 8760
const DEFAULT_TRIALS = 20_000

/** Every vendor treated as fully independent — the product of their SLAs. This is the number most
 * people implicitly assume when they see "N vendors, each with a good SLA" and feel safe. */
export function calculateNaiveAvailability(vendors: Vendor[]): number {
  return vendors.reduce((product, v) => product * v.sla, 1)
}

/** Generic, defensible failure-scenario presets — no specific unverified historical incident is claimed. */
export const PRESET_SCENARIOS: FailureScenario[] = [
  {
    id: 'aws-outage',
    label: 'AWS regional outage',
    downSubstrates: ['aws'],
    description: 'Every vendor (and your own infrastructure, if detected) on AWS substrate goes down at once.',
  },
  {
    id: 'gcp-outage',
    label: 'GCP regional outage',
    downSubstrates: ['gcp'],
    description: 'Every vendor (and your own infrastructure, if detected) on GCP substrate goes down at once.',
  },
  {
    id: 'azure-outage',
    label: 'Azure regional outage',
    downSubstrates: ['azure'],
    description: 'Every vendor (and your own infrastructure, if detected) on Azure substrate goes down at once.',
  },
  {
    id: 'cloudflare-outage',
    label: 'Cloudflare global outage',
    downSubstrates: ['cloudflare'],
    description: 'Every vendor relying on Cloudflare edge/global infrastructure goes down at once.',
  },
]

/** Deterministic: given a scenario's down substrates, which vendors are directly affected? No randomness involved. */
export function simulateFailureScenario(vendors: Vendor[], scenario: FailureScenario): FailureScenarioResult {
  const downSubstrates = new Set(scenario.downSubstrates)
  const affectedVendors = vendors.filter((v) => v.substrate.some((s) => downSubstrates.has(s)))
  const unaffectedVendors = vendors.filter((v) => !v.substrate.some((s) => downSubstrates.has(s)))
  return {
    scenario,
    affectedVendors,
    unaffectedVendors,
    affectedCount: affectedVendors.length,
    totalCount: vendors.length,
    affectedShare: vendors.length > 0 ? affectedVendors.length / vendors.length : 0,
  }
}

/**
 * Estimates each substrate's failure probability as the mean of (1 - sla) across the vendors on
 * it. We don't have independently measured substrate-level SLA data, so this is an explicit,
 * documented approximation from what we do have — never presented as a discovered fact.
 *
 * Deliberately skips any substrate with fewer than 2 vendors on it. Correlation requires at least
 * two things to correlate — with a single vendor, "deriving" a substrate rate from that same
 * vendor's own SLA and then sampling it as a SEPARATE, independent failure channel in the Monte
 * Carlo loop below double-counts one risk source as manufactured correlation. This was a real bug:
 * a solo vendor on a substrate produced a large, entirely artifactual "correlated share of
 * downtime" with nothing behind it. See docs/availability-model.md for the proof. An explicit
 * user-supplied override (real external substrate data) is NOT subject to this restriction — it's
 * applied regardless of vendor count, since it isn't derived from the vendor's own number.
 */
function deriveDefaultSubstrateFailureProbabilities(vendors: Vendor[]): Record<string, number> {
  const bySubstrate = new Map<string, number[]>()
  for (const vendor of vendors) {
    for (const substrate of vendor.substrate) {
      if (!bySubstrate.has(substrate)) bySubstrate.set(substrate, [])
      bySubstrate.get(substrate)!.push(1 - vendor.sla)
    }
  }
  const result: Record<string, number> = {}
  for (const [substrate, rates] of bySubstrate) {
    if (rates.length < 2) continue
    result[substrate] = rates.reduce((sum, r) => sum + r, 0) / rates.length
  }
  return result
}

/**
 * Monte Carlo estimate of "correlated" availability: each trial samples whether each substrate is
 * down (shared by every vendor on it, modeling the concentration risk naive math hides), then
 * independently samples each vendor's own incident rate on top. A vendor is down in a trial if
 * either condition holds. This deliberately does not try to net out double-counted probability
 * mass between a vendor's own SLA and its substrate's derived failure rate — that split isn't
 * independently knowable from public data, so the model leans conservative (understates
 * availability) rather than presenting a falsely precise decomposition.
 *
 * `rng` defaults to Math.random but is injectable so this function stays a deterministic, testable
 * pure function under a fixed seed sequence.
 */
export function runMonteCarloAvailability(
  vendors: Vendor[],
  overrides: Partial<AvailabilityAssumptions> = {},
  rng: () => number = Math.random,
): SimulationResult {
  const trials = overrides.trials ?? DEFAULT_TRIALS
  const costPerHourOfDowntime = overrides.costPerHourOfDowntime ?? 0
  const vendorSlaOverrides = overrides.vendorSlaOverrides ?? {}
  // Overriding a vendor's SLA is an editable input to the model, not a change to what was
  // detected — the original `vendors` (with real SLA + provenance) is left untouched elsewhere.
  const effectiveVendors =
    Object.keys(vendorSlaOverrides).length === 0
      ? vendors
      : vendors.map((v) => (v.key in vendorSlaOverrides ? { ...v, sla: vendorSlaOverrides[v.key] } : v))

  const substrateFailureProbabilities = {
    ...deriveDefaultSubstrateFailureProbabilities(effectiveVendors),
    ...(overrides.substrateFailureProbabilities ?? {}),
  }

  const naiveAvailability = calculateNaiveAvailability(effectiveVendors)

  let upTrials = trials
  if (effectiveVendors.length > 0) {
    const substrates = [...new Set(effectiveVendors.flatMap((v) => v.substrate))]
    upTrials = 0
    for (let t = 0; t < trials; t++) {
      const substrateDown = new Set<string>()
      for (const substrate of substrates) {
        if (rng() < (substrateFailureProbabilities[substrate] ?? 0)) substrateDown.add(substrate)
      }
      const anyVendorDown = effectiveVendors.some((vendor) => {
        if (vendor.substrate.some((s) => substrateDown.has(s))) return true
        return rng() < 1 - vendor.sla
      })
      if (!anyVendorDown) upTrials++
    }
  }
  const correlatedAvailability = upTrials / trials

  const naiveDowntimeHours = (1 - naiveAvailability) * HOURS_PER_YEAR
  const correlatedDowntimeHours = (1 - correlatedAvailability) * HOURS_PER_YEAR
  const correlatedShareOfDowntime =
    correlatedDowntimeHours > 0
      ? Math.max(0, (correlatedDowntimeHours - naiveDowntimeHours) / correlatedDowntimeHours)
      : 0

  return {
    naiveAvailability,
    correlatedAvailability,
    trials,
    expectedDowntimeHoursPerYear: { naive: naiveDowntimeHours, correlated: correlatedDowntimeHours },
    expectedAnnualExposure: {
      naive: naiveDowntimeHours * costPerHourOfDowntime,
      correlated: correlatedDowntimeHours * costPerHourOfDowntime,
    },
    correlatedShareOfDowntime,
    assumptions: { trials, costPerHourOfDowntime, substrateFailureProbabilities, vendorSlaOverrides },
  }
}

// --- Exact engine orchestration (production path) ---------------------------------------------
// Everything below computes availability EXACTLY (closed form / enumeration — see
// src/engine/correlated.ts), never by sampling. runMonteCarloAvailability above is kept only as a
// seeded test oracle to cross-validate the exact engine (src/engine/correlated.test.ts).

/** Display-time cap so a tail-risk multiplier is never rendered as Infinity/NaN — see AvailabilityHeadline.tailRisk. */
const MAX_DISPLAYED_TAIL_MULTIPLIER = 1000

function tailRiskMultiplier(correlated: number, independentSameMarginals: number): number {
  if (independentSameMarginals > 0) return Math.min(correlated / independentSameMarginals, MAX_DISPLAYED_TAIL_MULTIPLIER)
  return correlated > 0 ? MAX_DISPLAYED_TAIL_MULTIPLIER : 1
}

/** k-checkpoints for tail risk: 2, 3, and the smallest k covering the top quarter of vendors —
 * floored at 2, since "1 of N down" isn't the "many at once" event this metric is about. */
function tailRiskCheckpoints(vendorCount: number): number[] {
  const quarter = Math.max(2, Math.ceil(vendorCount * 0.25))
  return [...new Set([2, 3, quarter])].sort((a, b) => a - b)
}

/**
 * Exact availability under all three comparators — see ExactAvailabilityResult for what each one
 * means. `vendors` is left untouched; overrides only affect the numbers computed here.
 */
export function computeExactAvailability(
  vendors: Vendor[],
  overrides: { costPerHourOfDowntime?: number; vendorSlaOverrides?: Record<string, number>; substrateOutageProbabilities?: Record<string, number> } = {},
): ExactAvailabilityResult {
  const costPerHourOfDowntime = overrides.costPerHourOfDowntime ?? 0
  const model = buildCorrelatedModel(vendors, overrides)

  const naiveAvailability = seriesAvailabilityFromProbabilities(naiveProbabilities(model))
  const independentSameMarginalsAvailability = seriesAvailabilityFromProbabilities(sameMarginalsProbabilities(model))
  const correlatedAvailability = correlatedSeriesAvailability(model)

  const naiveHours = (1 - naiveAvailability) * HOURS_PER_YEAR
  const sameMarginalsHours = (1 - independentSameMarginalsAvailability) * HOURS_PER_YEAR
  const correlatedHours = (1 - correlatedAvailability) * HOURS_PER_YEAR

  return {
    naiveAvailability,
    independentSameMarginalsAvailability,
    correlatedAvailability,
    expectedDowntimeHoursPerYear: { naive: naiveHours, independentSameMarginals: sameMarginalsHours, correlated: correlatedHours },
    expectedAnnualExposure: {
      naive: naiveHours * costPerHourOfDowntime,
      independentSameMarginals: sameMarginalsHours * costPerHourOfDowntime,
      correlated: correlatedHours * costPerHourOfDowntime,
    },
    assumptions: {
      costPerHourOfDowntime,
      vendorSlaOverrides: overrides.vendorSlaOverrides ?? {},
      substrateOutageProbabilities: model.substrateOutageProbabilities,
    },
  }
}

/**
 * The UI headline, computed by the exact engine. `worstSingleEvent.entrypointsAffected` comes back
 * empty here — this function has no file-graph access (pure vendor/substrate model only); the
 * caller (apiRouter.ts, which has the cached repo's file graph) fills it in when available.
 */
export function buildAvailabilityHeadline(vendors: Vendor[], result: ExactAvailabilityResult): AvailabilityHeadline {
  const model = buildCorrelatedModel(vendors, result.assumptions)
  const vendorNameByKey = new Map(vendors.map((v) => [v.key, v.vendor]))

  const naivePmf = poissonBinomialPmf(naiveProbabilities(model))
  const sameMarginalsPmf = poissonBinomialPmf(sameMarginalsProbabilities(model))
  const correlatedPmf = pmfNumberDown(model)

  const tailRisk: TailRiskPoint[] = tailRiskCheckpoints(model.vendors.length).map((k) => {
    const naive = tailProbability(naivePmf, k)
    const independentSameMarginals = tailProbability(sameMarginalsPmf, k)
    const correlated = tailProbability(correlatedPmf, k)
    return { k, naive, independentSameMarginals, correlated, multiplier: tailRiskMultiplier(correlated, independentSameMarginals) }
  })

  const worstEvent = findWorstSingleEvent(model)
  const worstSingleEvent: WorstSingleEventSummary | null = worstEvent
    ? {
        substrate: worstEvent.substrate,
        vendorKeys: worstEvent.vendorKeys,
        vendorNames: worstEvent.vendorKeys.map((k) => vendorNameByKey.get(k) ?? k),
        entrypointsAffected: [],
        probabilityPerYear: worstEvent.probabilityPerYear,
      }
    : null

  const redundancyGroups: RedundancyGroupSummary[] = findRedundancyGroupCandidates(vendors).map((memberKeys) => ({
    memberKeys,
    memberNames: memberKeys.map((k) => vendorNameByKey.get(k) ?? k),
    groupDownProbabilityPerYear: redundancyGroupDownProbability(model, memberKeys),
  }))

  const substrateIds = new Set(model.vendors.flatMap((v) => v.substrates))

  return {
    vendors: vendors.length,
    substrates: substrateIds.size,
    unknownHostingVendorCount: unknownHostingVendorKeys(model).length,
    tailRisk,
    hiddenUpstreamHoursPerYear: result.expectedDowntimeHoursPerYear.independentSameMarginals - result.expectedDowntimeHoursPerYear.naive,
    concentrationEffectHoursPerYear: result.expectedDowntimeHoursPerYear.correlated - result.expectedDowntimeHoursPerYear.independentSameMarginals,
    worstSingleEvent,
    redundancyGroups,
    expectedLossPerYear: result.expectedAnnualExposure.correlated,
  }
}

// --- What-if mitigation (Prompt 15: "move this vendor" / "add a failover") -------------------
// Resolving a `failoverVendorId` against the curated vendor knowledge base (server/src/vendorMap.ts)
// is server-only, so that lives in server/src/whatIf.ts — everything here is the pure, shared math:
// given an already-resolved mitigated vendor list and redundancy groups, compute baseline vs.
// mitigated with the exact engine and diff them. No sampling anywhere in this path, so the delta
// between the two sides is exact, not noise.

/** Below this floor, a delta is treated as "no meaningful change" rather than rendered as a
 * precise-looking number the exact engine can produce even for a practically-irrelevant move
 * (e.g. two vendors that already share every substrate they're each on). Financial-exposure floor
 * is in whatever currency unit costPerHourOfDowntime was supplied in; the downtime floor (~36
 * seconds/year) catches the case where costPerHourOfDowntime is 0 and exposure is always 0. */
const MEANINGFUL_ANNUAL_EXPOSURE_FLOOR = 0.5
const MEANINGFUL_DOWNTIME_HOURS_FLOOR = 0.01

function computeWhatIfSnapshot(
  vendors: Vendor[],
  redundancyGroups: string[][],
  assumptions: ExactAvailabilityAssumptions,
): WhatIfSnapshot {
  const model = buildCorrelatedModel(vendors, assumptions)
  const correlatedAvailability = correlatedAvailabilityWithRedundancy(model, redundancyGroups)
  const expectedDowntimeHoursPerYear = (1 - correlatedAvailability) * HOURS_PER_YEAR
  return {
    correlatedAvailability,
    expectedDowntimeHoursPerYear,
    expectedAnnualExposure: expectedDowntimeHoursPerYear * assumptions.costPerHourOfDowntime,
  }
}

/**
 * Baseline vs. mitigated, both computed by the exact engine under the IDENTICAL `assumptions` —
 * the only difference between the two sides is `mitigatedVendors`/`redundancyGroups` themselves,
 * so `delta` reflects only the override, never assumption drift or sampling noise.
 */
export function buildWhatIfResult(
  baselineVendors: Vendor[],
  mitigatedVendors: Vendor[],
  redundancyGroups: string[][],
  assumptions: ExactAvailabilityAssumptions,
  meta: { appliedOverrides: WhatIfOverride[]; unresolvedFailovers: string[] },
): WhatIfResult {
  const baseline = computeWhatIfSnapshot(baselineVendors, [], assumptions)
  const mitigated = computeWhatIfSnapshot(mitigatedVendors, redundancyGroups, assumptions)

  const delta = {
    correlatedAvailability: mitigated.correlatedAvailability - baseline.correlatedAvailability,
    expectedDowntimeHoursPerYear: mitigated.expectedDowntimeHoursPerYear - baseline.expectedDowntimeHoursPerYear,
    expectedAnnualExposure: mitigated.expectedAnnualExposure - baseline.expectedAnnualExposure,
  }
  const meaningfulChange =
    Math.abs(delta.expectedAnnualExposure) >= MEANINGFUL_ANNUAL_EXPOSURE_FLOOR ||
    Math.abs(delta.expectedDowntimeHoursPerYear) >= MEANINGFUL_DOWNTIME_HOURS_FLOOR

  return {
    baseline,
    mitigated,
    delta,
    meaningfulChange,
    appliedOverrides: meta.appliedOverrides,
    unresolvedFailovers: meta.unresolvedFailovers,
  }
}

/** Share of correlated downtime that comes from substrate risk a vendor's own SLA doesn't
 * capture — clamped for display; a pathological override could otherwise push this outside [0,100].
 * Shared by VendorHeadlineCard (the on-screen claim) and the guided tour (src/tour/steps.ts, which
 * repeats the same claim in a caption) so the two can never drift apart. */
export function hiddenSharePercent(headline: AvailabilityHeadline, result: ExactAvailabilityResult): number {
  const correlatedHours = result.expectedDowntimeHoursPerYear.correlated
  if (correlatedHours <= 0) return 0
  return Math.max(0, Math.min(100, (headline.hiddenUpstreamHoursPerYear / correlatedHours) * 100))
}
