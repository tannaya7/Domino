// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AssumptionsPanel from './AssumptionsPanel'
import { defaultAssumptions } from '../hooks/useAvailabilityAssumptions'
import type { Vendor } from '../lib/types'

afterEach(() => cleanup())

function fixtureVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.9999,
    detectedVia: [],
    detectedInFiles: [],
    ...overrides,
  }
}

describe('AssumptionsPanel', () => {
  it('prefills each vendor SLA input from the vendor default, as a percentage', () => {
    render(<AssumptionsPanel vendors={[fixtureVendor()]} assumptions={defaultAssumptions()} onChange={vi.fn()} />)
    expect(screen.getByRole('spinbutton', { name: /Stripe SLA percent/i })).toHaveValue(99.99)
  })

  it('prefills the illustrative default cost per hour, labeled illustrative', () => {
    render(<AssumptionsPanel vendors={[]} assumptions={defaultAssumptions()} onChange={vi.fn()} />)
    expect(screen.getByRole('spinbutton', { name: /Downtime cost per hour/i })).toHaveValue(defaultAssumptions().costPerHour)
    expect(screen.getByText(/illustrative, edit for your business/i)).toBeInTheDocument()
  })

  it('edits a vendor SLA and reports it as a fraction via onChange', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<AssumptionsPanel vendors={[fixtureVendor()]} assumptions={defaultAssumptions()} onChange={onChange} />)

    const input = screen.getByRole('spinbutton', { name: /Stripe SLA percent/i })
    await user.clear(input)
    await user.type(input, '99.5')

    const lastCall = onChange.mock.calls.at(-1)![0]
    expect(lastCall.vendorSlaOverrides.stripe).toBeCloseTo(0.995)
  })

  it('prefills the illustrative default substrate outage probability, not a derived-from-SLA value', () => {
    // The exact engine's q_s is independent of vendor SLA — even a single vendor on a substrate
    // gets the illustrative default now, unlike the old Monte Carlo model's "no default for a lone
    // vendor" rule (which existed only to stop q_s being DERIVED from that same vendor's SLA).
    render(<AssumptionsPanel vendors={[fixtureVendor()]} assumptions={defaultAssumptions()} onChange={vi.fn()} />)
    const input = screen.getByRole('spinbutton', { name: /aws substrate outage probability percent/i })
    expect(input).toHaveValue(0.1)
  })

  it('excludes self-hosted/unknown substrate tags from the substrate list', () => {
    render(
      <AssumptionsPanel vendors={[fixtureVendor({ substrate: ['self'] })]} assumptions={defaultAssumptions()} onChange={vi.fn()} />,
    )
    expect(screen.queryByRole('spinbutton', { name: /substrate outage probability/i })).not.toBeInTheDocument()
  })

  it('converts the cost per hour when the currency toggle is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AssumptionsPanel
        vendors={[]}
        assumptions={{ ...defaultAssumptions(), currency: 'USD', costPerHour: 100 }}
        onChange={onChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'INR' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ currency: 'INR', costPerHour: 8300 }))
  })

  it('does not fire onChange when clicking the already-active currency', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<AssumptionsPanel vendors={[]} assumptions={defaultAssumptions()} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'USD' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
