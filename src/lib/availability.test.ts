import { describe, expect, it } from 'vitest'
import {
  buildAvailabilityHeadline,
  calculateNaiveAvailability,
  computeExactAvailability,
  PRESET_SCENARIOS,
  runMonteCarloAvailability,
  simulateFailureScenario,
} from './availability'
import type { Vendor } from './types'

function vendor(overrides: Partial<Vendor>): Vendor {
  return {
    key: 'x',
    vendor: 'X',
    tier: 'other' as Vendor['tier'],
    substrate: ['aws'],
    sla: 0.999,
    detectedVia: [],
    detectedInFiles: [],
    ...overrides,
  }
}

const alwaysUp = () => 1 // never < any probability in [0,1) -> nothing ever "fails"
const alwaysDown = () => 0 // < any positive probability -> everything "fails"

/** Deterministic seeded PRNG (mulberry32) — statistical assertions need reproducible trials, not
 * Math.random(), which made this suite's regression test flaky (see the test using it below). */
function mulberry32(seed: number): () => number {
  let state = seed
  return function next() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('calculateNaiveAvailability', () => {
  it('multiplies vendor SLAs assuming independence', () => {
    const vendors = [vendor({ sla: 0.99 }), vendor({ sla: 0.98 })]
    expect(calculateNaiveAvailability(vendors)).toBeCloseTo(0.99 * 0.98)
  })

  it('returns 1 for an empty vendor list (nothing to fail)', () => {
    expect(calculateNaiveAvailability([])).toBe(1)
  })
})

describe('simulateFailureScenario', () => {
  it('flags only vendors on the scenario-affected substrate', () => {
    const vendors = [
      vendor({ key: 'a', substrate: ['aws'] }),
      vendor({ key: 'b', substrate: ['gcp'] }),
      vendor({ key: 'c', substrate: ['aws', 'gcp'] }),
    ]
    const result = simulateFailureScenario(vendors, PRESET_SCENARIOS.find((s) => s.id === 'aws-outage')!)

    expect(result.affectedVendors.map((v) => v.key).sort()).toEqual(['a', 'c'])
    expect(result.unaffectedVendors.map((v) => v.key)).toEqual(['b'])
    expect(result.affectedShare).toBeCloseTo(2 / 3)
  })

  it('returns zero share for an empty vendor list without dividing by zero', () => {
    const result = simulateFailureScenario([], PRESET_SCENARIOS[0])
    expect(result.affectedShare).toBe(0)
    expect(result.totalCount).toBe(0)
  })
})

describe('runMonteCarloAvailability', () => {
  it('reports 100% correlated availability when nothing ever fails', () => {
    const vendors = [vendor({ sla: 0.9 }), vendor({ sla: 0.5, substrate: ['gcp'] })]
    const result = runMonteCarloAvailability(vendors, { trials: 50 }, alwaysUp)
    expect(result.correlatedAvailability).toBe(1)
    expect(result.expectedDowntimeHoursPerYear.correlated).toBe(0)
  })

  it('reports 0% correlated availability when everything always fails', () => {
    const vendors = [vendor({ sla: 0.9 })]
    const result = runMonteCarloAvailability(vendors, { trials: 50 }, alwaysDown)
    expect(result.correlatedAvailability).toBe(0)
  })

  it('treats an empty vendor list as fully available', () => {
    const result = runMonteCarloAvailability([], { trials: 10 })
    expect(result.naiveAvailability).toBe(1)
    expect(result.correlatedAvailability).toBe(1)
  })

  it('shows correlated availability at or below naive availability for vendors sharing a substrate', () => {
    // Two vendors sharing "aws" with a real derived substrate failure rate: correlation can only
    // ever add risk relative to treating them as independent, never remove it.
    const vendors = [vendor({ key: 'a', sla: 0.99, substrate: ['aws'] }), vendor({ key: 'b', sla: 0.99, substrate: ['aws'] })]
    const result = runMonteCarloAvailability(vendors, { trials: 5000 })
    expect(result.correlatedAvailability).toBeLessThanOrEqual(result.naiveAvailability + 1e-9)
  })

  it('derives a substrate failure probability from vendor SLA when 2+ vendors share it', () => {
    // Changed from a single-vendor fixture: deriving a substrate rate from one vendor's own SLA and
    // then sampling it as a SEPARATE failure channel double-counts that vendor's risk instead of
    // modeling correlation (see the regression test below) — the default is now only derived once
    // there are actually 2+ vendors to correlate.
    const vendors = [
      vendor({ key: 'a', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'b', sla: 0.97, substrate: ['aws'] }),
    ]
    const result = runMonteCarloAvailability(vendors, { trials: 10 }, alwaysUp)
    expect(result.assumptions.substrateFailureProbabilities.aws).toBeCloseTo((0.01 + 0.03) / 2)
  })

  it('does NOT derive a substrate failure probability for a substrate with only one vendor on it', () => {
    // Was: derived (mean of a single (1-sla) value = that same value), then sampled independently
    // on top of the vendor's own SLA roll — the exact double-count this test now guards against.
    const vendors = [vendor({ sla: 0.99, substrate: ['aws'] })]
    const result = runMonteCarloAvailability(vendors, { trials: 10 }, alwaysUp)
    expect(result.assumptions.substrateFailureProbabilities.aws).toBeUndefined()
  })

  it('REGRESSION: a lone vendor on a substrate does not manufacture correlated risk out of nothing', () => {
    // This is the exact scenario reported as suspicious: 1 vendor, 1 substrate. Before the fix,
    // deriveDefaultSubstrateFailureProbabilities derived the substrate's rate from this same
    // vendor's own SLA, and the Monte Carlo loop then rolled that rate a SECOND, independent time
    // ("substrate down") on top of the vendor's own SLA roll ("own incident") and OR'd them. With
    // p = 1 - sla, that produces P(down) = 1 - (1-p)^2 instead of the true single-source p — a
    // mechanical double-count, not correlation (correlation needs >= 2 things to correlate).
    const sla = 0.999
    const p = 1 - sla
    const vendors = [vendor({ key: 'solo', sla, substrate: ['gcp'] })]
    // Seeded, not Math.random(): the ratio in correlatedShareOfDowntime divides two nearly-equal
    // small numbers, which amplifies ordinary sampling noise enough to occasionally fail an
    // unseeded run even when the underlying fix is correct — reproducibility matters more here
    // than "real" randomness.
    const result = runMonteCarloAvailability(vendors, { trials: 100_000 }, mulberry32(12345))

    expect(result.assumptions.substrateFailureProbabilities.gcp).toBeUndefined()
    expect(result.naiveAvailability).toBeCloseTo(sla, 5)

    const oldBuggyAvailability = (1 - p) ** 2 // what the pre-fix double-counted model would produce
    const trueAvailability = sla // what a single, un-duplicated risk source implies

    // Well outside Monte Carlo noise at 100k trials (std error ~1.4e-4): the fixed model sits at
    // the true rate, not down near the old double-counted one.
    expect(result.correlatedAvailability).toBeGreaterThan((oldBuggyAvailability + trueAvailability) / 2)
    expect(result.correlatedAvailability).toBeCloseTo(trueAvailability, 2)
    // Was ~57% under the bug on a real single-vendor repo; should be negligible now.
    expect(result.correlatedShareOfDowntime).toBeLessThan(0.05)
  })

  it('respects an explicit substrateFailureProbabilities override', () => {
    const vendors = [vendor({ sla: 0.999999, substrate: ['aws'] })]
    const result = runMonteCarloAvailability(
      vendors,
      { trials: 20, substrateFailureProbabilities: { aws: 1 } },
      alwaysDown,
    )
    expect(result.correlatedAvailability).toBe(0)
  })

  it('computes financial exposure as downtime hours times cost per hour', () => {
    const vendors = [vendor({ sla: 0.9 })]
    const result = runMonteCarloAvailability(vendors, { trials: 10, costPerHourOfDowntime: 1000 }, alwaysDown)
    expect(result.expectedAnnualExposure.correlated).toBeCloseTo(result.expectedDowntimeHoursPerYear.correlated * 1000)
  })

  it('reports zero financial exposure when cost per hour is not provided', () => {
    const vendors = [vendor({ sla: 0.9 })]
    const result = runMonteCarloAvailability(vendors, { trials: 10 }, alwaysDown)
    expect(result.expectedAnnualExposure.correlated).toBe(0)
  })

  it('applies a per-vendor SLA override without mutating the original vendor', () => {
    const original = vendor({ key: 'x', sla: 0.5 })
    const result = runMonteCarloAvailability([original], { trials: 10, vendorSlaOverrides: { x: 0.999999 } }, alwaysUp)
    expect(result.naiveAvailability).toBeCloseTo(0.999999)
    expect(original.sla).toBe(0.5)
  })

  it('lets a vendor SLA override make two vendors on the same substrate correlate where the raw data would not', () => {
    const vendors = [vendor({ key: 'a', sla: 0.5, substrate: ['aws'] }), vendor({ key: 'b', sla: 0.99, substrate: ['aws'] })]
    const result = runMonteCarloAvailability(
      vendors,
      { trials: 10, vendorSlaOverrides: { a: 0.99 } },
      alwaysUp,
    )
    // Both effectively at 0.99 now — the derived rate should reflect the override, not the raw 0.5.
    expect(result.assumptions.substrateFailureProbabilities.aws).toBeCloseTo(0.01)
  })
})

describe('computeExactAvailability', () => {
  it('reports 100% availability for an empty vendor list', () => {
    const result = computeExactAvailability([])
    expect(result.naiveAvailability).toBe(1)
    expect(result.correlatedAvailability).toBe(1)
    expect(result.independentSameMarginalsAvailability).toBe(1)
  })

  it('matches the naive product-of-SLAs for vendors with no shareable substrate', () => {
    const vendors = [vendor({ key: 'a', sla: 0.99, substrate: ['self'] }), vendor({ key: 'b', sla: 0.98, substrate: ['self'] })]
    const result = computeExactAvailability(vendors)
    expect(result.naiveAvailability).toBeCloseTo(0.99 * 0.98)
    expect(result.correlatedAvailability).toBeCloseTo(0.99 * 0.98)
  })

  it('gives a lone vendor on a substrate MORE downtime than naive (a real, separate substrate risk, not a double count)', () => {
    // Unlike the old Monte Carlo model's bug, this is intentional: q_s here is an independent,
    // illustrative default (0.1%/yr) — not derived from the vendor's own SLA — so it's honestly
    // additional risk, not a duplicate of the vendor's own number.
    const vendors = [vendor({ key: 'solo', sla: 0.999, substrate: ['gcp'] })]
    const result = computeExactAvailability(vendors)
    expect(result.correlatedAvailability).toBeLessThan(result.naiveAvailability)
  })

  it('applies vendor SLA and substrate outage probability overrides', () => {
    const vendors = [vendor({ key: 'a', sla: 0.5, substrate: ['gcp'] })]
    const result = computeExactAvailability(vendors, {
      vendorSlaOverrides: { a: 0.999999 },
      substrateOutageProbabilities: { gcp: 0 },
    })
    expect(result.naiveAvailability).toBeCloseTo(0.999999)
    expect(result.correlatedAvailability).toBeCloseTo(0.999999)
  })

  it('computes financial exposure from the correlated downtime hours', () => {
    const vendors = [vendor({ sla: 0.9, substrate: ['self'] })]
    const result = computeExactAvailability(vendors, { costPerHourOfDowntime: 1000 })
    expect(result.expectedAnnualExposure.correlated).toBeCloseTo(result.expectedDowntimeHoursPerYear.correlated * 1000)
  })
})

describe('buildAvailabilityHeadline (exact)', () => {
  it('reports zero vendors/substrates and no worst event for an empty vendor list', () => {
    const result = computeExactAvailability([])
    const headline = buildAvailabilityHeadline([], result)
    expect(headline.vendors).toBe(0)
    expect(headline.substrates).toBe(0)
    expect(headline.worstSingleEvent).toBeNull()
    expect(headline.redundancyGroups).toEqual([])
  })

  it('counts unknown-hosting vendors separately and gives them no worst-event exposure', () => {
    const vendors = [vendor({ key: 'solo', substrate: ['self'] })]
    const headline = buildAvailabilityHeadline(vendors, computeExactAvailability(vendors))
    expect(headline.unknownHostingVendorCount).toBe(1)
    expect(headline.substrates).toBe(0)
    expect(headline.worstSingleEvent).toBeNull()
  })

  it('identifies the worst single event as the substrate with the most vendors on it', () => {
    const vendors = [
      vendor({ key: 'a', vendor: 'A', substrate: ['aws'] }),
      vendor({ key: 'b', vendor: 'B', substrate: ['aws'] }),
      vendor({ key: 'c', vendor: 'C', substrate: ['gcp'] }),
    ]
    const headline = buildAvailabilityHeadline(vendors, computeExactAvailability(vendors))
    expect(headline.worstSingleEvent).toMatchObject({ substrate: 'aws', vendorKeys: ['a', 'b'], vendorNames: ['A', 'B'] })
    expect(headline.worstSingleEvent!.entrypointsAffected).toEqual([]) // no file graph in this pure-model test
  })

  it('reports a curated redundancy pair only when both vendors are detected', () => {
    const vendors = [
      vendor({ key: 'stripe', vendor: 'Stripe', fallbacks: ['Razorpay'], substrate: ['aws'] }),
      vendor({ key: 'razorpay', vendor: 'Razorpay', substrate: ['gcp'] }),
    ]
    const headline = buildAvailabilityHeadline(vendors, computeExactAvailability(vendors))
    expect(headline.redundancyGroups).toHaveLength(1)
    expect(headline.redundancyGroups[0].memberNames.sort()).toEqual(['Razorpay', 'Stripe'])
  })

  it('hiddenUpstreamHoursPerYear is non-negative and concentrationEffectHoursPerYear is non-positive', () => {
    const vendors = [
      vendor({ key: 'a', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'b', sla: 0.97, substrate: ['aws'] }),
    ]
    const headline = buildAvailabilityHeadline(vendors, computeExactAvailability(vendors))
    expect(headline.hiddenUpstreamHoursPerYear).toBeGreaterThanOrEqual(-1e-9)
    expect(headline.concentrationEffectHoursPerYear).toBeLessThanOrEqual(1e-9)
  })

  it('surfaces expectedLossPerYear straight from the exact result', () => {
    const vendors = [vendor({ sla: 0.9, substrate: ['self'] })]
    const result = computeExactAvailability(vendors, { costPerHourOfDowntime: 1000 })
    const headline = buildAvailabilityHeadline(vendors, result)
    expect(headline.expectedLossPerYear).toBe(result.expectedAnnualExposure.correlated)
  })

  it('tail risk multiplier is capped for display and never Infinity/NaN', () => {
    const vendors = [
      vendor({ key: 'a', sla: 0.999999, substrate: ['aws'] }),
      vendor({ key: 'b', sla: 0.999999, substrate: ['aws'] }),
      vendor({ key: 'c', sla: 0.999999, substrate: ['aws'] }),
    ]
    const headline = buildAvailabilityHeadline(vendors, computeExactAvailability(vendors))
    for (const point of headline.tailRisk) {
      expect(Number.isFinite(point.multiplier)).toBe(true)
      expect(point.multiplier).toBeLessThanOrEqual(1000)
    }
  })
})
