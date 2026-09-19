import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCENARIO_HOURS,
  evaluateScenario,
  MAX_SCENARIO_HOURS,
  MAX_SCENARIO_SELECTIONS,
  MIN_SCENARIO_HOURS,
  scenarioKnownIds,
  ScenarioValidationException,
  validateScenarioSelection,
  type ScenarioAnalysisInput,
} from './scenario'
import type { VendorWithBlastRadius } from '../lib/types'

function vendor(overrides: Partial<VendorWithBlastRadius> = {}): VendorWithBlastRadius {
  return {
    key: 'x',
    vendor: 'X',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.999,
    detectedVia: [],
    detectedInFiles: [],
    directFiles: [],
    affectedFiles: [],
    ...overrides,
  }
}

function analysis(vendors: VendorWithBlastRadius[], overrides: Partial<ScenarioAnalysisInput> = {}): ScenarioAnalysisInput {
  return { vendors, entrypoints: [], costPerHour: 100, ...overrides }
}

describe('scenarioKnownIds', () => {
  it('collects real substrates (excluding unshareable tags) and every vendor key', () => {
    const vendors = [
      vendor({ key: 'stripe', substrate: ['aws'] }),
      vendor({ key: 'homegrown', substrate: ['self'] }),
      vendor({ key: 'sendgrid', substrate: ['aws', 'gcp'] }),
    ]
    expect(scenarioKnownIds(vendors)).toEqual({
      substrateIds: ['aws', 'gcp'],
      vendorIds: ['stripe', 'homegrown', 'sendgrid'],
    })
  })
})

describe('validateScenarioSelection', () => {
  const known = { substrateIds: ['aws', 'gcp'], vendorIds: ['stripe', 'sendgrid'] }

  it('accepts a valid selection', () => {
    expect(validateScenarioSelection({ substrates: ['aws'], vendors: ['stripe'], hours: 4 }, known)).toEqual([])
  })

  it('rejects unknown substrate ids', () => {
    const errors = validateScenarioSelection({ substrates: ['azure'], vendors: [], hours: 4 }, known)
    expect(errors).toContainEqual({ field: 'substrates', message: expect.stringContaining('azure') })
  })

  it('rejects unknown vendor ids', () => {
    const errors = validateScenarioSelection({ substrates: [], vendors: ['paypal'], hours: 4 }, known)
    expect(errors).toContainEqual({ field: 'vendors', message: expect.stringContaining('paypal') })
  })

  it('rejects an empty selection', () => {
    const errors = validateScenarioSelection({ substrates: [], vendors: [], hours: 4 }, known)
    expect(errors).toContainEqual({ field: 'selection', message: expect.stringContaining('at least one') })
  })

  it(`rejects more than ${MAX_SCENARIO_SELECTIONS} total selections`, () => {
    const manyKnown = { substrateIds: ['aws'], vendorIds: Array.from({ length: 20 }, (_, i) => `v${i}`) }
    const errors = validateScenarioSelection(
      { substrates: ['aws'], vendors: manyKnown.vendorIds.slice(0, MAX_SCENARIO_SELECTIONS), hours: 4 },
      manyKnown,
    )
    expect(errors).toContainEqual({ field: 'selection', message: expect.stringContaining(`${MAX_SCENARIO_SELECTIONS}`) })
  })

  it('accepts exactly the max total selections', () => {
    const manyKnown = { substrateIds: ['aws'], vendorIds: Array.from({ length: 20 }, (_, i) => `v${i}`) }
    const errors = validateScenarioSelection(
      { substrates: ['aws'], vendors: manyKnown.vendorIds.slice(0, MAX_SCENARIO_SELECTIONS - 1), hours: 4 },
      manyKnown,
    )
    expect(errors).toEqual([])
  })

  it.each([0, MIN_SCENARIO_HOURS - 0.01, MAX_SCENARIO_HOURS + 0.01, NaN, Infinity])(
    'rejects hours=%s as out of [0.25, 720]',
    (hours) => {
      const errors = validateScenarioSelection({ substrates: ['aws'], vendors: [], hours }, known)
      expect(errors).toContainEqual({ field: 'hours', message: expect.any(String) })
    },
  )

  it.each([MIN_SCENARIO_HOURS, DEFAULT_SCENARIO_HOURS, MAX_SCENARIO_HOURS])('accepts hours=%s (boundary-inclusive)', (hours) => {
    const errors = validateScenarioSelection({ substrates: ['aws'], vendors: [], hours }, known)
    expect(errors.filter((e) => e.field === 'hours')).toEqual([])
  })
})

describe('evaluateScenario — validation', () => {
  it('throws ScenarioValidationException (not a silent clamp) on bad input', () => {
    expect(() => evaluateScenario(analysis([vendor({ key: 'stripe' })]), { substrates: [], vendors: ['unknown'], hours: 4 })).toThrow(
      ScenarioValidationException,
    )
  })

  it('the thrown exception carries the field-level errors', () => {
    try {
      evaluateScenario(analysis([vendor({ key: 'stripe' })]), { substrates: [], vendors: [], hours: 9999 })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ScenarioValidationException)
      const fields = (err as ScenarioValidationException).errors.map((e) => e.field)
      expect(fields).toEqual(expect.arrayContaining(['selection', 'hours']))
    }
  })
})

describe('evaluateScenario — impact', () => {
  it('vendors down = selected vendors UNION all vendors on selected substrates', () => {
    const stripe = vendor({ key: 'stripe', substrate: ['aws'] })
    const sendgrid = vendor({ key: 'sendgrid', substrate: ['aws'] })
    const auth0 = vendor({ key: 'auth0', substrate: ['gcp'] }) // picked directly, different substrate
    const datadog = vendor({ key: 'datadog', substrate: ['azure'] }) // untouched

    const result = evaluateScenario(analysis([stripe, sendgrid, auth0, datadog]), {
      substrates: ['aws'],
      vendors: ['auth0'],
      hours: 4,
    })
    expect(result.downVendorKeys.sort()).toEqual(['auth0', 'sendgrid', 'stripe'])
  })

  it('files and entrypoints affected are counted once even when multiple down vendors share a file', () => {
    const stripe = vendor({ key: 'stripe', substrate: ['aws'], affectedFiles: ['src/pay.ts', 'src/checkout.ts'] })
    const sendgrid = vendor({ key: 'sendgrid', substrate: ['aws'], affectedFiles: ['src/pay.ts', 'src/notify.ts'] })

    const result = evaluateScenario(analysis([stripe, sendgrid], { entrypoints: ['src/checkout.ts', 'src/notify.ts'] }), {
      substrates: ['aws'],
      vendors: [],
      hours: 4,
    })
    // src/pay.ts is affected by BOTH vendors — must appear exactly once, not twice.
    expect(result.filesAffected).toEqual(['src/checkout.ts', 'src/notify.ts', 'src/pay.ts'])
    expect(result.entrypointsAffected).toEqual(['src/checkout.ts', 'src/notify.ts'])
    expect(result.entrypointsTotal).toBe(2)
  })

  it('categoriesLost is the distinct set of tiers among down vendors', () => {
    const stripe = vendor({ key: 'stripe', tier: 'payments', substrate: ['aws'] })
    const paypal = vendor({ key: 'paypal', tier: 'payments', substrate: ['aws'] })
    const sentry = vendor({ key: 'sentry', tier: 'observability', substrate: ['gcp'] })

    const result = evaluateScenario(analysis([stripe, paypal, sentry]), { substrates: ['aws'], vendors: [], hours: 4 })
    expect(result.categoriesLost).toEqual(['payments'])
  })

  it('flags "no detected fallback" only when EVERY vendor of a category reaching an entrypoint is down', () => {
    const stripe = vendor({ key: 'stripe', tier: 'payments', substrate: ['aws'], affectedFiles: ['src/checkout.ts'] })
    const paypal = vendor({ key: 'paypal', tier: 'payments', substrate: ['gcp'], affectedFiles: ['src/checkout.ts'] })
    const sentry = vendor({ key: 'sentry', tier: 'observability', substrate: ['aws'], affectedFiles: ['src/checkout.ts'] })

    // Only aws down: stripe (payments) and sentry (observability) go down, but paypal (payments, on
    // gcp) stays up — so payments still has a detected fallback at this entrypoint; observability
    // does not, since sentry was the only detected observability vendor reaching it.
    const result = evaluateScenario(analysis([stripe, paypal, sentry], { entrypoints: ['src/checkout.ts'] }), {
      substrates: ['aws'],
      vendors: [],
      hours: 4,
    })
    expect(result.noFallback).toEqual([{ entrypoint: 'src/checkout.ts', tier: 'observability' }])
  })

  it('flags "no detected fallback" when both same-category vendors are taken down together', () => {
    const stripe = vendor({ key: 'stripe', tier: 'payments', substrate: ['aws'], affectedFiles: ['src/checkout.ts'] })
    const paypal = vendor({ key: 'paypal', tier: 'payments', substrate: ['gcp'], affectedFiles: ['src/checkout.ts'] })

    const result = evaluateScenario(analysis([stripe, paypal], { entrypoints: ['src/checkout.ts'] }), {
      substrates: ['aws', 'gcp'],
      vendors: [],
      hours: 4,
    })
    expect(result.noFallback).toEqual([{ entrypoint: 'src/checkout.ts', tier: 'payments' }])
  })
})

describe('evaluateScenario — modeled frequency & money', () => {
  it('expectedDowntimeHoursPerYear = 8760 * combinationProbability, and money follows the documented formulas', () => {
    const stripe = vendor({ key: 'stripe', substrate: ['aws'], sla: 0.999 })
    const result = evaluateScenario(analysis([stripe], { costPerHour: 500 }), {
      substrates: ['aws'],
      vendors: [],
      hours: 6,
    })
    expect(result.expectedDowntimeHoursPerYear).toBeCloseTo(8760 * result.combinationProbability, 9)
    expect(result.perIncidentCost).toBe(500 * 6)
    expect(result.expectedAnnualCost).toBeCloseTo(500 * result.expectedDowntimeHoursPerYear, 9)
    expect(result.illustrative).toBe(true)
  })

  it('does not multiply marginals: two vendors sharing an unselected substrate score a HIGHER combined probability than independent multiplication would', () => {
    const d = vendor({ key: 'd', substrate: ['azure'], sla: 0.99 })
    const e = vendor({ key: 'e', substrate: ['azure'], sla: 0.98 })
    const result = evaluateScenario(analysis([d, e], { overrides: { substrateOutageProbabilities: { azure: 0.05 } } }), {
      substrates: [],
      vendors: ['d', 'e'],
      hours: 4,
    })
    const naiveMarginalProduct = (1 - (1 - 0.01) * (1 - 0.05)) * (1 - (1 - 0.02) * (1 - 0.05))
    expect(result.combinationProbability).not.toBeCloseTo(naiveMarginalProduct, 4)
    expect(result.combinationProbability).toBeCloseTo(0.05 + 0.95 * 0.01 * 0.02, 12)
  })
})
