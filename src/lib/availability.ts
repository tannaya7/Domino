import type {
  AvailabilityAssumptions,
  AvailabilityHeadline,
  FailureScenario,
  FailureScenarioResult,
  SimulationResult,
  Vendor,
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

/**
 * One compact object for the UI headline. Built from the same `effectiveVendors` logic as the
 * simulation itself (vendor SLA overrides applied) so the breakdown always explains the number
 * next to it — never a second, drifting computation of the same thing.
 */
export function buildAvailabilityHeadline(vendors: Vendor[], result: SimulationResult): AvailabilityHeadline {
  const vendorSlaOverrides = result.assumptions.vendorSlaOverrides
  const effectiveVendors = vendors.map((v) => (v.key in vendorSlaOverrides ? { ...v, sla: vendorSlaOverrides[v.key] } : v))

  const bySubstrate = new Map<string, Vendor[]>()
  for (const vendor of effectiveVendors) {
    for (const substrate of vendor.substrate) {
      if (!bySubstrate.has(substrate)) bySubstrate.set(substrate, [])
      bySubstrate.get(substrate)!.push(vendor)
    }
  }

  const breakdown = [...bySubstrate.entries()]
    .map(([substrate, vs]) => ({
      substrate,
      vendorCount: vs.length,
      failureProbability: result.assumptions.substrateFailureProbabilities[substrate] ?? 0,
      // Matches deriveDefaultSubstrateFailureProbabilities: correlation needs >=2 vendors sharing
      // the substrate. A substrate with 1 vendor never contributes correlated risk, regardless of
      // whether a rate happens to be set for it via an explicit override.
      contributesCorrelation: vs.length >= 2,
    }))
    .sort((a, b) => b.vendorCount - a.vendorCount || a.substrate.localeCompare(b.substrate))

  return {
    vendors: vendors.length,
    substrates: bySubstrate.size,
    invisibleShare: result.correlatedShareOfDowntime,
    expectedLossPerYear: result.expectedAnnualExposure.correlated,
    breakdown,
  }
}
