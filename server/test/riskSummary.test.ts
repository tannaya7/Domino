import { describe, expect, it } from 'vitest'
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
