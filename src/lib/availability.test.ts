import { describe, expect, it } from 'vitest'
import { calculateNaiveAvailability, PRESET_SCENARIOS, runMonteCarloAvailability, simulateFailureScenario } from './availability'
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

  it('derives substrate failure probabilities from vendor SLA when not overridden', () => {
    const vendors = [vendor({ sla: 0.99, substrate: ['aws'] })]
    const result = runMonteCarloAvailability(vendors, { trials: 10 }, alwaysUp)
    expect(result.assumptions.substrateFailureProbabilities.aws).toBeCloseTo(0.01)
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
})
