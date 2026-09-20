import { describe, expect, it } from 'vitest'
import { computeExactAvailability } from './availability'
import { buildAvailabilityHeadline } from './availability'
import type { NodeCriticality, Vendor, VendorWithBlastRadius } from './types'
import { buildVendorRiskRows } from './vendorRiskRegister'
import { buildCriticalityItemWhy, buildExpectedLossWhy, buildRiskRegisterRowWhy, buildVendorsSubstratesWhy, whatIfMoveVendorOffSubstrate } from './whyDrawer'

function vendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.999,
    detectedVia: ['manifest:npm:stripe', 'import:stripe'],
    detectedInFiles: ['src/pay.ts'],
    ...overrides,
  }
}

function vendorWithBlastRadius(overrides: Partial<VendorWithBlastRadius> = {}): VendorWithBlastRadius {
  return { ...vendor(), directFiles: ['src/pay.ts'], affectedFiles: ['src/pay.ts', 'src/index.ts'], ...overrides }
}

describe('whatIfMoveVendorOffSubstrate', () => {
  it('returns null when there are fewer than 3 vendors (P(>=3) is trivially 0 either way)', () => {
    const vendors = [vendor({ key: 'a' }), vendor({ key: 'b', substrate: ['aws'] })]
    expect(whatIfMoveVendorOffSubstrate(vendors, 'a')).toBeNull()
  })

  it('returns null when the vendor shares its substrate with no one', () => {
    const vendors = [
      vendor({ key: 'a', substrate: ['aws'] }),
      vendor({ key: 'b', substrate: ['gcp'] }),
      vendor({ key: 'c', substrate: ['azure'] }),
    ]
    expect(whatIfMoveVendorOffSubstrate(vendors, 'a')).toBeNull()
  })

  it('computes a real before/after P(>=3 down) when the vendor does share a substrate', () => {
    const vendors = [
      vendor({ key: 'a', substrate: ['aws'] }),
      vendor({ key: 'b', substrate: ['aws'] }),
      vendor({ key: 'c', substrate: ['aws'] }),
    ]
    const change = whatIfMoveVendorOffSubstrate(vendors, 'a')
    expect(change).not.toBeNull()
    expect(change!.description).toContain('Stripe')
    expect(change!.description).toContain('P(≥3 vendors down at once)')
    // Before: any one of the 3 sharing "aws" going down takes all 3 down together (~ the substrate's
    // own outage probability). After: a is independent, so all-3-down now needs BOTH a's own outage
    // AND the substrate's — strictly smaller. formatSmallPercent floors at "<0.001%" for that tiny
    // tail, so assert the qualitative shape rather than parsing a possibly-unparseable "<..." string.
    expect(change!.before).toBe('0.100%')
    expect(change!.after).toBe('<0.001%')
  })

  it('respects substrate outage probability overrides', () => {
    const vendors = [
      vendor({ key: 'a', substrate: ['aws'] }),
      vendor({ key: 'b', substrate: ['aws'] }),
      vendor({ key: 'c', substrate: ['aws'] }),
    ]
    const withDefault = whatIfMoveVendorOffSubstrate(vendors, 'a')!
    const withOverride = whatIfMoveVendorOffSubstrate(vendors, 'a', { substrateOutageProbabilities: { aws: 0.2 } })!
    // A riskier "aws" raises the "before" tail probability (all 3 share it) far more visibly than
    // the "after" one (only b/c still share it, a is independent) — overrides are genuinely threaded
    // through to the exact engine, not ignored.
    expect(withOverride.before).not.toBe(withDefault.before)
    expect(parseFloat(withOverride.before)).toBeGreaterThan(parseFloat(withDefault.before))
  })
})

describe('buildVendorsSubstratesWhy', () => {
  it('states the claim, inputs, and formula', () => {
    const vendors = [vendor({ key: 'a' }), vendor({ key: 'b', vendor: 'B', substrate: ['gcp'] })]
    const result = computeExactAvailability(vendors)
    const headline = buildAvailabilityHeadline(vendors, result)
    const why = buildVendorsSubstratesWhy(vendors, headline)
    expect(why.claim).toContain('2 vendor(s)')
    expect(why.claim).toContain('2 distinct')
    expect(why.inputs.find((i) => i.label === 'Vendors detected')?.value).toBe('2')
    expect(why.formula).toContain('substrates =')
  })

  it('includes per-vendor evidence with substrate and detectedVia', () => {
    const vendors = [vendor()]
    const result = computeExactAvailability(vendors)
    const headline = buildAvailabilityHeadline(vendors, result)
    const why = buildVendorsSubstratesWhy(vendors, headline)
    expect(why.evidence).toEqual([{ label: 'Stripe', detail: expect.stringContaining('aws') }])
  })

  it('includes a "what would change it" when a shared substrate exists', () => {
    const vendors = [
      vendor({ key: 'a', substrate: ['aws'] }),
      vendor({ key: 'b', vendor: 'B', substrate: ['aws'] }),
      vendor({ key: 'c', vendor: 'C', substrate: ['aws'] }),
    ]
    const result = computeExactAvailability(vendors)
    const headline = buildAvailabilityHeadline(vendors, result)
    const why = buildVendorsSubstratesWhy(vendors, headline)
    expect(why.changes.length).toBeGreaterThan(0)
    expect(why.changesNote).toBeUndefined()
  })

  it('provides a changesNote instead of a fake change when nothing is shared', () => {
    const vendors = [vendor({ key: 'a', substrate: ['self'] })]
    const result = computeExactAvailability(vendors)
    const headline = buildAvailabilityHeadline(vendors, result)
    const why = buildVendorsSubstratesWhy(vendors, headline)
    expect(why.changes).toEqual([])
    expect(why.changesNote).toBeTruthy()
  })
})

describe('buildExpectedLossWhy', () => {
  it('states the claim and the one-line formula, with cost/hr and downtime hours as inputs', () => {
    const vendors = [vendor({ substrate: ['self'] })]
    const result = computeExactAvailability(vendors, { costPerHourOfDowntime: 500 })
    const headline = buildAvailabilityHeadline(vendors, result)
    const why = buildExpectedLossWhy(headline, result, 'USD')
    expect(why.claim).toContain('$')
    expect(why.inputs.find((i) => i.label === 'Cost per hour of downtime')?.value).toBe('$500/hr')
    expect(why.formula).toBe('expectedLossPerYear = correlatedDowntimeHoursPerYear × costPerHourOfDowntime')
  })
})

describe('buildRiskRegisterRowWhy', () => {
  it('states the claim, confidence rule, and formula', () => {
    const v = vendorWithBlastRadius()
    const [row] = buildVendorRiskRows([v], ['src/index.ts'], 10, 500)
    const why = buildRiskRegisterRowWhy(row, v, [v], 'USD')
    expect(why.claim).toContain('Stripe')
    expect(why.claim).toContain(`${row.risk}-risk`)
    expect(why.inputs.find((i) => i.label === 'Confidence')?.value).toContain('High')
    expect(why.formula).toContain('costPerYear =')
  })

  it('includes file evidence', () => {
    const v = vendorWithBlastRadius()
    const [row] = buildVendorRiskRows([v], ['src/index.ts'], 10, 500)
    const why = buildRiskRegisterRowWhy(row, v, [v], 'USD')
    expect(why.evidence.some((e) => e.label === 'File affected' && e.detail === 'src/pay.ts')).toBe(true)
  })

  it('provides a changesNote when this vendor has nothing to move (solo on its substrate)', () => {
    const v = vendorWithBlastRadius()
    const [row] = buildVendorRiskRows([v], ['src/index.ts'], 10, 500)
    const why = buildRiskRegisterRowWhy(row, v, [v], 'USD')
    expect(why.changes).toEqual([])
    expect(why.changesNote).toContain("doesn't share")
  })
})

describe('buildCriticalityItemWhy', () => {
  function fixtureNode(overrides: Partial<NodeCriticality> = {}): NodeCriticality {
    return {
      nodeId: 'src/shared.ts',
      isArticulationPoint: true,
      affectedEntrypoints: ['src/a.ts', 'src/b.ts'],
      orphanedNodes: ['src/leaf.ts'],
      entrypointCount: 5,
      reachabilityLossRatio: 0.4,
      ...overrides,
    }
  }

  it('states an articulation-point claim distinctly from a merely-affected node', () => {
    const articulation = buildCriticalityItemWhy(fixtureNode({ isArticulationPoint: true }))
    expect(articulation.claim).toContain('structural bottleneck')

    const merely = buildCriticalityItemWhy(fixtureNode({ isArticulationPoint: false }))
    expect(merely.claim).not.toContain('structural bottleneck')
    expect(merely.claim).toContain('2 of 5')
  })

  it('includes entrypoint and orphaned-file evidence', () => {
    const why = buildCriticalityItemWhy(fixtureNode())
    expect(why.evidence).toContainEqual({ label: 'Entrypoint affected', detail: 'src/a.ts' })
    expect(why.evidence).toContainEqual({ label: 'File orphaned if removed', detail: 'src/leaf.ts' })
  })

  it('gives the reachabilityLossRatio formula in one line, self-exclusion documented', () => {
    const why = buildCriticalityItemWhy(fixtureNode())
    expect(why.formula).toContain('affectedEntrypoints.length / entrypointCount')
    expect(why.formula).toContain('excluded')
  })

  it('explains why there is no further "what would change it" — this metric already is one', () => {
    const why = buildCriticalityItemWhy(fixtureNode())
    expect(why.changes).toEqual([])
    expect(why.changesNote).toContain('already IS a "what happens if removed"')
  })
})
