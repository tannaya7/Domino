import { describe, expect, it } from 'vitest'
import { evaluatePolicy, validateGatePolicy, type PolicyEvalInput } from '../src/policy'

function input(overrides: Partial<PolicyEvalInput> = {}): PolicyEvalInput {
  return {
    newVendorsCount: 0,
    mostConcentratedSubstrateShare: 0.3,
    substrateCount: 3,
    entrypointsAffectedPct: 10,
    exposureIncreasePerYear: 0,
    ...overrides,
  }
}

describe('validateGatePolicy', () => {
  it('returns undefined for no policy (report-only)', () => {
    expect(validateGatePolicy(undefined)).toBeUndefined()
    expect(validateGatePolicy(null)).toBeUndefined()
  })

  it('accepts a policy with every known key', () => {
    const policy = validateGatePolicy({
      maxSubstrateShare: 0.5,
      minSubstrates: 2,
      maxNewVendorsPerPr: 1,
      maxEntrypointsAffectedPct: 25,
      maxExposureIncreasePerYear: 1000,
      failOn: 'fail',
    })
    expect(policy).toEqual({
      maxSubstrateShare: 0.5,
      minSubstrates: 2,
      maxNewVendorsPerPr: 1,
      maxEntrypointsAffectedPct: 25,
      maxExposureIncreasePerYear: 1000,
      failOn: 'fail',
    })
  })

  it('rejects an unknown key with a 400-shaped Error', () => {
    expect(() => validateGatePolicy({ maxSubstratesShare: 0.5 })).toThrow(/unknown policy key/i)
  })

  it('rejects a non-object policy', () => {
    expect(() => validateGatePolicy('strict')).toThrow(/must be an object/i)
    expect(() => validateGatePolicy([1, 2])).toThrow(/must be an object/i)
  })

  it.each([
    ['maxSubstrateShare', -0.1],
    ['maxSubstrateShare', 1.1],
    ['maxSubstrateShare', '50%'],
    ['minSubstrates', -1],
    ['minSubstrates', 1.5],
    ['maxNewVendorsPerPr', -1],
    ['maxEntrypointsAffectedPct', 101],
    ['maxExposureIncreasePerYear', -5],
  ])('rejects an out-of-range/wrong-type %s: %j', (key, value) => {
    expect(() => validateGatePolicy({ [key]: value })).toThrow()
  })

  it('rejects an invalid failOn value', () => {
    expect(() => validateGatePolicy({ failOn: 'block' })).toThrow(/failOn/)
  })
})

describe('evaluatePolicy', () => {
  it('is "info" and never fails when no policy is supplied, regardless of how bad the numbers are', () => {
    const result = evaluatePolicy(
      input({ newVendorsCount: 50, mostConcentratedSubstrateShare: 1, exposureIncreasePerYear: 1_000_000 }),
      undefined,
    )
    expect(result).toEqual({ status: 'info', violations: [] })
  })

  it('is "pass" with no violations when every number is within limits', () => {
    const result = evaluatePolicy(
      input({ newVendorsCount: 1, mostConcentratedSubstrateShare: 0.4, substrateCount: 3, entrypointsAffectedPct: 5, exposureIncreasePerYear: 10 }),
      { maxSubstrateShare: 0.5, minSubstrates: 2, maxNewVendorsPerPr: 2, maxEntrypointsAffectedPct: 20, maxExposureIncreasePerYear: 100 },
    )
    expect(result).toEqual({ status: 'pass', violations: [] })
  })

  it('flags maxSubstrateShare exceeded', () => {
    const result = evaluatePolicy(input({ mostConcentratedSubstrateShare: 0.9 }), { maxSubstrateShare: 0.5, failOn: 'fail' })
    expect(result.status).toBe('fail')
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].rule).toBe('maxSubstrateShare')
    expect(result.violations[0].actual).toBe(0.9)
    expect(result.violations[0].limit).toBe(0.5)
  })

  it('flags minSubstrates when below the floor', () => {
    const result = evaluatePolicy(input({ substrateCount: 1 }), { minSubstrates: 2 })
    expect(result.violations.map((v) => v.rule)).toEqual(['minSubstrates'])
  })

  it('does not flag minSubstrates when exactly at the floor', () => {
    const result = evaluatePolicy(input({ substrateCount: 2 }), { minSubstrates: 2 })
    expect(result.status).toBe('pass')
  })

  it('flags maxNewVendorsPerPr exceeded', () => {
    const result = evaluatePolicy(input({ newVendorsCount: 3 }), { maxNewVendorsPerPr: 2 })
    expect(result.violations.map((v) => v.rule)).toEqual(['maxNewVendorsPerPr'])
  })

  it('flags maxEntrypointsAffectedPct exceeded', () => {
    const result = evaluatePolicy(input({ entrypointsAffectedPct: 60 }), { maxEntrypointsAffectedPct: 50 })
    expect(result.violations.map((v) => v.rule)).toEqual(['maxEntrypointsAffectedPct'])
  })

  it('flags maxExposureIncreasePerYear exceeded', () => {
    const result = evaluatePolicy(input({ exposureIncreasePerYear: 5000 }), { maxExposureIncreasePerYear: 1000 })
    expect(result.violations.map((v) => v.rule)).toEqual(['maxExposureIncreasePerYear'])
  })

  it('never flags maxExposureIncreasePerYear for a decrease, regardless of magnitude', () => {
    const result = evaluatePolicy(input({ exposureIncreasePerYear: -1_000_000 }), { maxExposureIncreasePerYear: 100 })
    expect(result.status).toBe('pass')
  })

  it('defaults failOn to "warn" when a policy is given without one', () => {
    const result = evaluatePolicy(input({ newVendorsCount: 5 }), { maxNewVendorsPerPr: 1 })
    expect(result.status).toBe('warn')
  })

  it('reports every violated rule at once, not just the first', () => {
    const result = evaluatePolicy(
      input({ newVendorsCount: 5, mostConcentratedSubstrateShare: 0.9, substrateCount: 1 }),
      { maxNewVendorsPerPr: 1, maxSubstrateShare: 0.5, minSubstrates: 2, failOn: 'fail' },
    )
    expect(result.status).toBe('fail')
    expect(new Set(result.violations.map((v) => v.rule))).toEqual(
      new Set(['maxNewVendorsPerPr', 'maxSubstrateShare', 'minSubstrates']),
    )
  })
})
