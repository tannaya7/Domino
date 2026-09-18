import { describe, expect, it } from 'vitest'
import { analyzeConcentration } from './concentration'
import type { IacSubstrateSignal, Vendor } from './types'

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

describe('analyzeConcentration', () => {
  it('returns zero counts and no rows for an empty vendor list', () => {
    const result = analyzeConcentration([])
    expect(result).toEqual({ vendorCount: 0, substrateCount: 0, bySubstrate: [], mostConcentrated: null })
  })

  it('groups vendors that share one substrate', () => {
    const vendors = [
      vendor({ key: 'stripe', vendor: 'Stripe', substrate: ['aws'] }),
      vendor({ key: 'clerk', vendor: 'Clerk', substrate: ['aws'] }),
      vendor({ key: 'sentry', vendor: 'Sentry', substrate: ['gcp'] }),
    ]
    const result = analyzeConcentration(vendors)

    expect(result.vendorCount).toBe(3)
    expect(result.substrateCount).toBe(2)
    expect(result.mostConcentrated).toEqual(
      expect.objectContaining({ substrate: 'aws', vendorKeys: expect.arrayContaining(['stripe', 'clerk']) }),
    )
    expect(result.mostConcentrated?.share).toBeCloseTo(2 / 3)
  })

  it('counts a multi-substrate vendor once per substrate it touches', () => {
    const vendors = [vendor({ key: 'twilio', vendor: 'Twilio', substrate: ['aws', 'gcp'] })]
    const result = analyzeConcentration(vendors)
    expect(result.substrateCount).toBe(2)
    expect(result.bySubstrate.map((r) => r.substrate).sort()).toEqual(['aws', 'gcp'])
  })

  it('surfaces "the illusion" — many named vendors collapsing onto one substrate', () => {
    const vendors = Array.from({ length: 9 }, (_, i) => vendor({ key: `v${i}`, vendor: `V${i}`, substrate: ['aws'] }))
    vendors.push(vendor({ key: 'v9', vendor: 'V9', substrate: ['cloudflare'] }))
    const result = analyzeConcentration(vendors)

    expect(result.vendorCount).toBe(10)
    expect(result.mostConcentrated?.substrate).toBe('aws')
    expect(result.mostConcentrated?.vendorKeys).toHaveLength(9)
    expect(result.mostConcentrated?.share).toBeCloseTo(0.9)
  })

  it('folds IaC substrate evidence in as a distinct "your application infrastructure" entity', () => {
    const vendors = [vendor({ key: 'stripe', vendor: 'Stripe', substrate: ['aws'] })]
    const iac: IacSubstrateSignal[] = [{ provider: 'aws', resourceType: 'aws_lambda_function', source: 'main.tf' }]
    const result = analyzeConcentration(vendors, iac)

    const awsRow = result.bySubstrate.find((r) => r.substrate === 'aws')
    expect(awsRow?.vendorNames).toContain('Your application infrastructure')
    expect(awsRow?.vendorKeys).toHaveLength(2)
    // Total entities is vendors + 1 (your infra), so share is 2/2 = 1.
    expect(awsRow?.share).toBe(1)
  })

  it('ignores an "other" IaC provider rather than inventing a substrate label', () => {
    const iac: IacSubstrateSignal[] = [{ provider: 'other', resourceType: 'null_resource', source: 'main.tf' }]
    const result = analyzeConcentration([], iac)
    expect(result.bySubstrate).toEqual([])
  })
})
