import { describe, expect, it } from 'vitest'
import type { Vendor } from '../../src/lib/types'
import { computeWhatIf, rankRecommendedMoves, resolveWhatIfOverrides } from '../src/whatIf'

function vendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.9999,
    fallbacks: ['Razorpay', 'Adyen'],
    detectedVia: ['import:stripe'],
    detectedInFiles: ['src/pay.ts'],
    ...overrides,
  }
}

const assumptions = { costPerHourOfDowntime: 1000, vendorSlaOverrides: {}, substrateOutageProbabilities: {} }

describe('resolveWhatIfOverrides', () => {
  it('moving a vendor to another substrate replaces its substrate list, no engine changes needed', () => {
    const { mitigatedVendors, redundancyGroups } = resolveWhatIfOverrides([vendor()], [{ vendorId: 'stripe', substrate: 'gcp' }])
    expect(mitigatedVendors).toHaveLength(1)
    expect(mitigatedVendors[0].substrate).toEqual(['gcp'])
    expect(redundancyGroups).toEqual([])
  })

  it('a curated failover not yet detected is synthesized and paired into a redundancy group', () => {
    const { mitigatedVendors, redundancyGroups, unresolvedFailovers } = resolveWhatIfOverrides(
      [vendor()],
      [{ vendorId: 'stripe', failoverVendorId: 'Razorpay' }],
    )
    expect(mitigatedVendors).toHaveLength(2)
    const synthetic = mitigatedVendors.find((v) => v.vendor === 'Razorpay')
    expect(synthetic).toBeDefined()
    expect(synthetic?.detectedInFiles).toEqual([])
    expect(redundancyGroups).toEqual([['stripe', synthetic!.key]])
    expect(unresolvedFailovers).toEqual([])
  })

  it('a failover that is already detected pairs with the existing vendor instead of duplicating it', () => {
    const razorpay = vendor({ key: 'razorpay', vendor: 'Razorpay', fallbacks: ['Stripe'] })
    const { mitigatedVendors, redundancyGroups } = resolveWhatIfOverrides(
      [vendor(), razorpay],
      [{ vendorId: 'stripe', failoverVendorId: 'Razorpay' }],
    )
    expect(mitigatedVendors).toHaveLength(2)
    expect(redundancyGroups).toEqual([['stripe', 'razorpay']])
  })

  it('a curated fallback name with no VENDOR_MAP entry is reported, not silently dropped', () => {
    const { mitigatedVendors, redundancyGroups, unresolvedFailovers } = resolveWhatIfOverrides(
      [vendor()],
      [{ vendorId: 'stripe', failoverVendorId: 'Adyen' }],
    )
    expect(mitigatedVendors).toHaveLength(1)
    expect(redundancyGroups).toEqual([])
    expect(unresolvedFailovers).toEqual(['Adyen'])
  })

  it('throws for an unknown vendorId', () => {
    expect(() => resolveWhatIfOverrides([vendor()], [{ vendorId: 'nope' }])).toThrow(/unknown vendorid/i)
  })

  it('throws for an unknown substrate', () => {
    expect(() => resolveWhatIfOverrides([vendor()], [{ vendorId: 'stripe', substrate: 'mars' }])).toThrow(/unknown substrate/i)
  })

  it('throws when a vendor is offered as its own failover', () => {
    expect(() => resolveWhatIfOverrides([vendor()], [{ vendorId: 'stripe', failoverVendorId: 'Stripe' }])).toThrow(/own failover/i)
  })

  it('stacks up to several overrides against different vendors in one pass', () => {
    const vendors = [vendor(), vendor({ key: 'sendgrid', vendor: 'SendGrid', substrate: ['azure'], fallbacks: [] })]
    const { mitigatedVendors, redundancyGroups } = resolveWhatIfOverrides(vendors, [
      { vendorId: 'stripe', substrate: 'gcp' },
      { vendorId: 'sendgrid', failoverVendorId: 'Postmark' },
    ])
    expect(mitigatedVendors.find((v) => v.key === 'stripe')?.substrate).toEqual(['gcp'])
    expect(mitigatedVendors.some((v) => v.vendor === 'Postmark')).toBe(true)
    expect(redundancyGroups).toHaveLength(1)
  })
})

describe('computeWhatIf', () => {
  it('is deterministic across repeated calls with identical input', () => {
    const vendors = [vendor()]
    const overrides = [{ vendorId: 'stripe', failoverVendorId: 'Razorpay' }]
    expect(computeWhatIf(vendors, overrides, assumptions)).toEqual(computeWhatIf(vendors, overrides, assumptions))
  })
})

describe('rankRecommendedMoves', () => {
  it('returns [] when there is no cost basis to rank savings in', () => {
    const zeroCost = { ...assumptions, costPerHourOfDowntime: 0 }
    expect(rankRecommendedMoves([vendor()], zeroCost)).toEqual([])
  })

  it('recommends the Razorpay failover for Stripe when it saves money and is not already detected', () => {
    const moves = rankRecommendedMoves([vendor()], assumptions)
    expect(moves.some((m) => m.vendorId === 'stripe' && m.moveType === 'failover' && m.failoverVendorId === 'Razorpay')).toBe(true)
  })

  it('never recommends more than one move per vendor', () => {
    const moves = rankRecommendedMoves([vendor()], assumptions)
    const vendorIds = moves.map((m) => m.vendorId)
    expect(new Set(vendorIds).size).toBe(vendorIds.length)
  })

  it('is sorted by annualSavings descending', () => {
    const vendors = [vendor(), vendor({ key: 'sendgrid', vendor: 'SendGrid', tier: 'email', substrate: ['azure'], sla: 0.999, fallbacks: [] })]
    const moves = rankRecommendedMoves(vendors, assumptions)
    for (let i = 1; i < moves.length; i++) {
      expect(moves[i - 1].annualSavings).toBeGreaterThanOrEqual(moves[i].annualSavings)
    }
  })
})
