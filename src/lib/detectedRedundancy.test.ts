import { describe, expect, it } from 'vitest'
import { analyzeDetectedRedundancy, findCategoryRedundancyGroups } from './detectedRedundancy'
import type { Vendor } from './types'

function vendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    key: 'x',
    vendor: 'X',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.999,
    detectedVia: [],
    detectedInFiles: [],
    ...overrides,
  }
}

describe('findCategoryRedundancyGroups', () => {
  it('returns [] when no category has 2+ vendors', () => {
    const vendors = [vendor({ key: 'a', tier: 'payments' }), vendor({ key: 'b', tier: 'email' })]
    expect(findCategoryRedundancyGroups(vendors)).toEqual([])
  })

  it('groups 2+ vendors sharing a category', () => {
    const vendors = [
      vendor({ key: 'stripe', vendor: 'Stripe', tier: 'payments' }),
      vendor({ key: 'razorpay', vendor: 'Razorpay', tier: 'payments' }),
      vendor({ key: 'sentry', vendor: 'Sentry', tier: 'observability' }),
    ]
    expect(findCategoryRedundancyGroups(vendors)).toEqual([{ tier: 'payments', memberKeys: ['stripe', 'razorpay'] }])
  })

  it('handles 3+ vendors in the same category as one group', () => {
    const vendors = [
      vendor({ key: 'a', tier: 'email' }),
      vendor({ key: 'b', tier: 'email' }),
      vendor({ key: 'c', tier: 'email' }),
    ]
    expect(findCategoryRedundancyGroups(vendors)).toEqual([{ tier: 'email', memberKeys: ['a', 'b', 'c'] }])
  })

  it('sorts groups by tier name for determinism', () => {
    const vendors = [
      vendor({ key: 'a', tier: 'payments' }),
      vendor({ key: 'b', tier: 'payments' }),
      vendor({ key: 'c', tier: 'email' }),
      vendor({ key: 'd', tier: 'email' }),
    ]
    expect(findCategoryRedundancyGroups(vendors).map((g) => g.tier)).toEqual(['email', 'payments'])
  })
})

describe('analyzeDetectedRedundancy', () => {
  it('returns [] for an empty vendor list', () => {
    expect(analyzeDetectedRedundancy([])).toEqual([])
  })

  it('returns [] when no category has a redundancy group', () => {
    const vendors = [vendor({ key: 'a', tier: 'payments' })]
    expect(analyzeDetectedRedundancy(vendors)).toEqual([])
  })

  it('flags "redundancy illusion" when group members share a substrate', () => {
    const vendors = [
      vendor({ key: 'a', vendor: 'A', tier: 'payments', substrate: ['aws'] }),
      vendor({ key: 'b', vendor: 'B', tier: 'payments', substrate: ['aws'] }),
    ]
    const [group] = analyzeDetectedRedundancy(vendors)
    expect(group.redundancyIllusion).toBe(true)
    expect(group.sharedSubstrates).toEqual(['aws'])
  })

  it('does not flag illusion when group members are on fully distinct substrates', () => {
    const vendors = [
      vendor({ key: 'a', vendor: 'A', tier: 'payments', substrate: ['aws'] }),
      vendor({ key: 'b', vendor: 'B', tier: 'payments', substrate: ['gcp'] }),
    ]
    const [group] = analyzeDetectedRedundancy(vendors)
    expect(group.redundancyIllusion).toBe(false)
    expect(group.sharedSubstrates).toEqual([])
  })

  it('does not flag illusion for self-hosted/unknown substrates (nothing to share)', () => {
    const vendors = [
      vendor({ key: 'a', vendor: 'A', tier: 'payments', substrate: ['self'] }),
      vendor({ key: 'b', vendor: 'B', tier: 'payments', substrate: ['self'] }),
    ]
    const [group] = analyzeDetectedRedundancy(vendors)
    expect(group.redundancyIllusion).toBe(false)
  })

  it('MATH vs BRUTE FORCE: group-down probability matches a hand-computed value on a tiny 2-vendor model', () => {
    // Both vendors share substrate 'aws'. sla_a=0.99 (u_a=0.01), sla_b=0.98 (u_b=0.02). q_aws is
    // the illustrative default (0.001 — see engine/correlated.ts DEFAULT_SUBSTRATE_OUTAGE_PROBABILITY).
    // By hand: P(both down) = P(aws down)*1 + P(aws up)*u_a*u_b
    //                        = 0.001 + 0.999 * 0.01 * 0.02 = 0.001 + 0.0001998 = 0.0011998
    const vendors = [
      vendor({ key: 'a', vendor: 'A', tier: 'payments', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'b', vendor: 'B', tier: 'payments', sla: 0.98, substrate: ['aws'] }),
    ]
    const [group] = analyzeDetectedRedundancy(vendors)
    expect(group.groupDownProbabilityPerYear).toBeCloseTo(0.0011998, 6)
  })

  it('MATH vs BRUTE FORCE: a 3-member group on 2 substrates matches hand-computed enumeration', () => {
    // a,b on 'aws' (u=0.01 each); c on 'gcp' (u=0.03). q_aws=q_gcp=0.001 (illustrative default).
    // P(all three down) = sum over 4 states of (state prob) * P(all down | state):
    //   aws up, gcp up  (0.999*0.999): a,b need own outage, c needs own outage -> 0.01*0.01*0.03
    //   aws up, gcp down(0.999*0.001): a,b need own outage, c forced          -> 0.01*0.01*1
    //   aws down,gcp up (0.001*0.999): a,b forced, c needs own outage         -> 1*1*0.03
    //   aws down,gcp down(0.001*0.001): all forced                            -> 1*1*1
    const pAwsUpGcpUp = 0.999 * 0.999 * (0.01 * 0.01 * 0.03)
    const pAwsUpGcpDown = 0.999 * 0.001 * (0.01 * 0.01 * 1)
    const pAwsDownGcpUp = 0.001 * 0.999 * (1 * 1 * 0.03)
    const pAwsDownGcpDown = 0.001 * 0.001 * (1 * 1 * 1)
    const expected = pAwsUpGcpUp + pAwsUpGcpDown + pAwsDownGcpUp + pAwsDownGcpDown

    const vendors = [
      vendor({ key: 'a', vendor: 'A', tier: 'payments', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'b', vendor: 'B', tier: 'payments', sla: 0.99, substrate: ['aws'] }),
      vendor({ key: 'c', vendor: 'C', tier: 'payments', sla: 0.97, substrate: ['gcp'] }),
    ]
    const [group] = analyzeDetectedRedundancy(vendors)
    expect(group.groupDownProbabilityPerYear).toBeCloseTo(expected, 9)
    expect(group.redundancyIllusion).toBe(true) // a & b share aws
    expect(group.sharedSubstrates).toEqual(['aws'])
  })

  it('respects vendor SLA overrides (same overrides channel as the availability model)', () => {
    const vendors = [
      vendor({ key: 'a', tier: 'payments', sla: 0.5, substrate: ['aws'] }),
      vendor({ key: 'b', tier: 'payments', sla: 0.5, substrate: ['gcp'] }),
    ]
    const withoutOverride = analyzeDetectedRedundancy(vendors)[0].groupDownProbabilityPerYear
    const withOverride = analyzeDetectedRedundancy(vendors, { vendorSlaOverrides: { a: 0.999999, b: 0.999999 } })[0]
      .groupDownProbabilityPerYear
    expect(withOverride).toBeLessThan(withoutOverride)
  })

  it('includes member names for display', () => {
    const vendors = [
      vendor({ key: 'stripe', vendor: 'Stripe', tier: 'payments' }),
      vendor({ key: 'razorpay', vendor: 'Razorpay', tier: 'payments' }),
    ]
    const [group] = analyzeDetectedRedundancy(vendors)
    expect(group.memberNames.sort()).toEqual(['Razorpay', 'Stripe'])
  })
})
