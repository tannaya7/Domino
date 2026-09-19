import { describe, expect, it, vi } from 'vitest'
import { buildTourSteps, validateTourSteps, type TourStepContext } from './steps'
import type { RecommendedMove } from '../lib/types'

function baseContext(overrides: Partial<TourStepContext> = {}): TourStepContext {
  return {
    vendorCount: 5,
    substrateCount: 2,
    hiddenSharePercentValue: 42,
    expectedLossPerYear: 22113,
    currency: 'USD',
    mostConcentratedSubstrate: 'aws',
    mostConcentratedVendorCount: 4,
    scenarioLabel: 'AWS regional outage',
    scenarioAffectedEntrypoints: 3,
    totalEntrypoints: 5,
    topMove: {
      vendorId: 'stripe',
      vendorName: 'Stripe',
      moveType: 'failover',
      failoverVendorId: 'Razorpay',
      description: 'Add Razorpay as a failover for Stripe',
      annualSavings: 525,
    } satisfies RecommendedMove,
    actions: {
      runScenario: vi.fn(),
      applyTopMove: vi.fn(),
      openRiskRegister: vi.fn(),
      goToInputAndFocus: vi.fn(),
    },
    ...overrides,
  }
}

describe('buildTourSteps', () => {
  it('produces steps with unique, non-empty ids and non-empty captions', () => {
    const steps = buildTourSteps(baseContext())
    expect(validateTourSteps(steps)).toEqual([])
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length)
    for (const step of steps) {
      expect(step.caption.trim().length).toBeGreaterThan(0)
    }
  })

  it('includes the substrate-islands step when there is a shared substrate', () => {
    const steps = buildTourSteps(baseContext())
    expect(steps.some((s) => s.id === 'substrate-islands')).toBe(true)
  })

  it('omits the substrate-islands step, not fakes it, when nothing is shared', () => {
    const steps = buildTourSteps(baseContext({ mostConcentratedSubstrate: null }))
    expect(steps.some((s) => s.id === 'substrate-islands')).toBe(false)
    expect(validateTourSteps(steps)).toEqual([])
  })

  it('includes the recommended-move step when a curated top move exists', () => {
    const steps = buildTourSteps(baseContext())
    const move = steps.find((s) => s.id === 'recommended-move')
    expect(move).toBeDefined()
    expect(move!.caption).toContain('Razorpay')
    expect(move!.caption).toContain('$525')
  })

  it('omits the recommended-move step, not fakes it, when no top move is available', () => {
    const steps = buildTourSteps(baseContext({ topMove: null }))
    expect(steps.some((s) => s.id === 'recommended-move')).toBe(false)
    expect(validateTourSteps(steps)).toEqual([])
  })

  it('always ends with the try-your-own-repo step targeting the URL input', () => {
    const steps = buildTourSteps(baseContext())
    const last = steps[steps.length - 1]
    expect(last.id).toBe('try-your-own')
    expect(last.targetSelector).toBe('#repo-url')
  })

  it('wires each step\'s run() to the matching action, without calling any of them eagerly', () => {
    const ctx = baseContext()
    buildTourSteps(ctx)
    expect(ctx.actions.runScenario).not.toHaveBeenCalled()
    expect(ctx.actions.applyTopMove).not.toHaveBeenCalled()
    expect(ctx.actions.openRiskRegister).not.toHaveBeenCalled()
    expect(ctx.actions.goToInputAndFocus).not.toHaveBeenCalled()

    const steps = buildTourSteps(ctx)
    steps.find((s) => s.id === 'run-scenario')!.run!()
    expect(ctx.actions.runScenario).toHaveBeenCalledTimes(1)
  })
})

describe('validateTourSteps', () => {
  it('flags duplicate ids', () => {
    const errors = validateTourSteps([
      { id: 'a', targetSelector: null, caption: 'x', dwellMs: 1000 },
      { id: 'a', targetSelector: null, caption: 'y', dwellMs: 1000 },
    ])
    expect(errors).toEqual(['duplicate step id "a"'])
  })

  it('flags an empty caption', () => {
    const errors = validateTourSteps([{ id: 'a', targetSelector: null, caption: '   ', dwellMs: 1000 }])
    expect(errors).toEqual(['step "a" has an empty caption'])
  })
})
