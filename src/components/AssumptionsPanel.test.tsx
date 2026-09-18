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

  it('leaves a substrate rate with no default blank, not zero', () => {
    render(<AssumptionsPanel vendors={[fixtureVendor()]} assumptions={defaultAssumptions()} onChange={vi.fn()} />)
    const input = screen.getByRole('spinbutton', { name: /aws substrate failure rate percent/i })
    expect(input).toHaveValue(null)
    expect(input).toHaveAttribute('placeholder', 'no default')
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
