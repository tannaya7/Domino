import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRiskSummary } from '../src/riskSummary'

describe('getRiskSummary', () => {
  it('returns a low-risk summary when there is nothing affected', async () => {
    const summary = await getRiskSummary({ name: 'User DB', type: 'database', downstream: [], upstream: [] })
    expect(summary).toContain('User DB')
    expect(summary).toContain('Low-risk')
  })

  it('names the affected components and gives a High-risk recommendation for a large blast radius', async () => {
    const summary = await getRiskSummary({
      name: 'Payment Service',
      type: 'service',
      downstream: ['Order Service', 'Checkout', 'Web App', 'Mobile App', 'Admin Panel', 'Reports', 'Billing'],
      upstream: [],
    })
    expect(summary).toContain('Payment Service')
    expect(summary).toContain('High-risk')
    expect(summary).toContain('Order Service')
    expect(summary.toLowerCase()).toContain('thorough testing')
  })

  it('mentions upstream dependencies when present', async () => {
    const summary = await getRiskSummary({
      name: 'Order Service',
      type: 'service',
      downstream: ['Web App'],
      upstream: ['Payment Service'],
    })
    expect(summary).toContain('Payment Service')
  })
})

describe('getRiskSummary — Bedrock integration', () => {
  afterEach(() => {
    vi.doUnmock('../src/bedrock')
    vi.resetModules()
  })

  it('uses the Bedrock-generated summary when it returns valid JSON', async () => {
    vi.resetModules()
    vi.doMock('../src/bedrock', () => ({
      invokeBedrock: vi.fn().mockResolvedValue('{"summary": "Bedrock says this is fine."}'),
      extractJson: (raw: string) => JSON.parse(raw),
    }))
    const { getRiskSummary: freshGetRiskSummary } = await import('../src/riskSummary')
    const summary = await freshGetRiskSummary({ name: 'X', type: 'service', downstream: [], upstream: [] })
    expect(summary).toBe('Bedrock says this is fine.')
  })

  it('falls back to the deterministic summary when Bedrock is unavailable', async () => {
    vi.resetModules()
    vi.doMock('../src/bedrock', () => ({
      invokeBedrock: vi.fn().mockResolvedValue(null),
      extractJson: () => null,
    }))
    const { getRiskSummary: freshGetRiskSummary } = await import('../src/riskSummary')
    const summary = await freshGetRiskSummary({ name: 'User DB', type: 'database', downstream: [], upstream: [] })
    expect(summary).toContain('Low-risk')
  })

  it('falls back to the deterministic summary when Bedrock returns malformed JSON', async () => {
    vi.resetModules()
    vi.doMock('../src/bedrock', () => ({
      invokeBedrock: vi.fn().mockResolvedValue('not json'),
      extractJson: () => null,
    }))
    const { getRiskSummary: freshGetRiskSummary } = await import('../src/riskSummary')
    const summary = await freshGetRiskSummary({ name: 'User DB', type: 'database', downstream: [], upstream: [] })
    expect(summary).toContain('Low-risk')
  })
})
