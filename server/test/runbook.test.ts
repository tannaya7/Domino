import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Vendor } from '../../src/lib/types'

function fixtureVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.9999,
    statusUrl: 'https://status.stripe.com/api/v2/status.json',
    fallbacks: ['Razorpay'],
    detectedVia: ['import:stripe'],
    detectedInFiles: ['src/pay.ts'],
    ...overrides,
  }
}

describe('generateRunbook — deterministic fallback (no Bedrock configured)', () => {
  it('produces a Low-risk runbook for a small blast radius', async () => {
    const { generateRunbook } = await import('../src/runbook')
    const runbook = await generateRunbook({ vendor: fixtureVendor(), affectedFileCount: 1 })

    expect(runbook.generatedBy).toBe('deterministic')
    expect(runbook.riskLevel).toBe('Low')
    expect(runbook.summary).toContain('Stripe')
    expect(runbook.recommendedActions.length).toBeGreaterThan(0)
    expect(runbook.suggestedFallbacks).toEqual(['Razorpay'])
  })

  it('escalates for a High-risk blast radius', async () => {
    const { generateRunbook } = await import('../src/runbook')
    const runbook = await generateRunbook({ vendor: fixtureVendor(), affectedFileCount: 10 })
    expect(runbook.riskLevel).toBe('High')
    expect(runbook.recommendedActions.some((a) => a.toLowerCase().includes('escalate'))).toBe(true)
  })

  it('mentions the failure scenario label when provided (via the prompt) without crashing when absent', async () => {
    const { generateRunbook } = await import('../src/runbook')
    const runbook = await generateRunbook({
      vendor: fixtureVendor(),
      affectedFileCount: 2,
      scenario: 'AWS regional outage',
    })
    expect(runbook.summary).toBeTruthy()
  })
})

describe('generateRunbook — Bedrock integration', () => {
  afterEach(() => {
    vi.doUnmock('../src/bedrock')
    vi.resetModules()
  })

  it('uses the Bedrock-generated runbook when it returns valid structured JSON', async () => {
    vi.resetModules()
    vi.doMock('../src/bedrock', () => ({
      invokeBedrock: vi
        .fn()
        .mockResolvedValue('{"summary": "Bedrock summary", "recommendedActions": ["do this", "do that"]}'),
      extractJson: (raw: string) => JSON.parse(raw),
    }))
    const { generateRunbook } = await import('../src/runbook')
    const runbook = await generateRunbook({ vendor: fixtureVendor(), affectedFileCount: 3 })

    expect(runbook.generatedBy).toBe('bedrock')
    expect(runbook.summary).toBe('Bedrock summary')
    expect(runbook.recommendedActions).toEqual(['do this', 'do that'])
  })

  it('falls back to deterministic when Bedrock returns JSON missing recommendedActions', async () => {
    vi.resetModules()
    vi.doMock('../src/bedrock', () => ({
      invokeBedrock: vi.fn().mockResolvedValue('{"summary": "incomplete"}'),
      extractJson: (raw: string) => JSON.parse(raw),
    }))
    const { generateRunbook } = await import('../src/runbook')
    const runbook = await generateRunbook({ vendor: fixtureVendor(), affectedFileCount: 3 })
    expect(runbook.generatedBy).toBe('deterministic')
  })

  it('falls back to deterministic when Bedrock is unavailable', async () => {
    vi.resetModules()
    vi.doMock('../src/bedrock', () => ({
      invokeBedrock: vi.fn().mockResolvedValue(null),
      extractJson: () => null,
    }))
    const { generateRunbook } = await import('../src/runbook')
    const runbook = await generateRunbook({ vendor: fixtureVendor(), affectedFileCount: 3 })
    expect(runbook.generatedBy).toBe('deterministic')
  })
})
