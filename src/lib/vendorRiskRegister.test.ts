import { describe, expect, it } from 'vitest'
import { buildVendorRiskRows } from './vendorRiskRegister'
import type { VendorWithBlastRadius } from './types'

function vendor(overrides: Partial<VendorWithBlastRadius> = {}): VendorWithBlastRadius {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.999,
    detectedVia: ['import:stripe'],
    detectedInFiles: ['src/pay.ts'],
    directFiles: ['src/pay.ts'],
    affectedFiles: ['src/pay.ts', 'src/index.ts'],
    ...overrides,
  }
}

describe('buildVendorRiskRows', () => {
  it('returns an empty array for no vendors', () => {
    expect(buildVendorRiskRows([], [], 10, 500)).toEqual([])
  })

  it('allocates 100% of downtime share to a lone vendor', () => {
    const rows = buildVendorRiskRows([vendor()], ['src/index.ts'], 10, 500)
    expect(rows[0].downtimeShare).toBeCloseTo(1)
    expect(rows[0].costPerYear).toBeCloseTo(10 * 500)
  })

  it('allocates downtime share proportional to each vendor’s own outage probability', () => {
    // sla 0.99 -> outage 0.01; sla 0.999 -> outage 0.001. Share should be 10:1.
    const rows = buildVendorRiskRows(
      [vendor({ key: 'a', sla: 0.99 }), vendor({ key: 'b', sla: 0.999 })],
      [],
      100,
      1,
    )
    const a = rows.find((r) => r.key === 'a')!
    const b = rows.find((r) => r.key === 'b')!
    expect(a.downtimeShare / b.downtimeShare).toBeCloseTo(10, 0)
    expect(a.downtimeShare + b.downtimeShare).toBeCloseTo(1)
  })

  it('splits the share evenly when every vendor has a perfect (100%) SLA', () => {
    const rows = buildVendorRiskRows(
      [vendor({ key: 'a', sla: 1 }), vendor({ key: 'b', sla: 1 })],
      [],
      10,
      500,
    )
    expect(rows[0].downtimeShare).toBeCloseTo(0.5)
    expect(rows[1].downtimeShare).toBeCloseTo(0.5)
  })

  it('counts entrypoints affected as the subset of affected files that are entrypoints', () => {
    const rows = buildVendorRiskRows([vendor()], ['src/index.ts'], 10, 500)
    expect(rows[0].filesAffected).toBe(2)
    expect(rows[0].entrypointsAffected).toBe(1)
  })

  it('assigns risk level from the existing deterministic getRiskLevel thresholds', () => {
    const rows = buildVendorRiskRows(
      [vendor({ affectedFiles: Array.from({ length: 10 }, (_, i) => `f${i}.ts`) })],
      [],
      10,
      500,
    )
    expect(rows[0].risk).toBe('High')
  })

  it('falls back to "self-hosted/unknown" and "unknown" labels when substrate/detectedVia are empty', () => {
    const rows = buildVendorRiskRows([vendor({ substrate: [], detectedVia: [] })], [], 10, 500)
    expect(rows[0].substrate).toBe('self-hosted/unknown')
    expect(rows[0].detectedVia).toBe('unknown')
  })
})
