// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VendorRiskRegister from './VendorRiskRegister'
import type { VendorWithBlastRadius } from '../lib/types'

afterEach(() => cleanup())

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

const baseProps = {
  entrypoints: ['src/index.ts'],
  naiveDowntimeHoursPerYear: 10,
  costPerHour: 500,
  currency: 'USD' as const,
  vendorStatuses: null,
  verifications: new Map(),
  onSelectVendor: vi.fn(),
}

describe('VendorRiskRegister', () => {
  it('shows an empty state when there are no vendors', () => {
    render(<VendorRiskRegister {...baseProps} vendors={[]} />)
    expect(screen.getByText(/no third-party vendors detected/i)).toBeInTheDocument()
  })

  it('shows every vendor as a row with its computed columns', () => {
    const vendors = [vendor(), vendor({ key: 'razorpay', vendor: 'Razorpay', sla: 0.999 })]
    render(<VendorRiskRegister {...baseProps} vendors={vendors} />)
    expect(screen.getByText('Stripe')).toBeInTheDocument()
    expect(screen.getByText('Razorpay')).toBeInTheDocument()
    expect(screen.getAllByText('50%')).toHaveLength(2) // downtime share, split evenly (same SLA)
  })

  it('hides the Downtime share column entirely with a single vendor — a 100% allocation across a set of one is trivially uninformative, not a real signal', () => {
    render(<VendorRiskRegister {...baseProps} vendors={[vendor()]} />)
    expect(screen.getByText('Stripe')).toBeInTheDocument()
    expect(screen.queryByText('Downtime share')).not.toBeInTheDocument()
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
  })

  it('shows the Downtime share column again once there is more than one vendor', () => {
    const vendors = [vendor(), vendor({ key: 'razorpay', vendor: 'Razorpay' })]
    render(<VendorRiskRegister {...baseProps} vendors={vendors} />)
    expect(screen.getByText('Downtime share')).toBeInTheDocument()
  })

  it('documents that Risk is based only on files affected, independent of cost', () => {
    render(<VendorRiskRegister {...baseProps} vendors={[vendor()]} />)
    expect(screen.getByTitle(/risk is based only on files affected/i)).toBeInTheDocument()
  })

  it('shows "unknown" live status (never fabricated healthy) when no status was fetched', () => {
    render(<VendorRiskRegister {...baseProps} vendors={[vendor()]} vendorStatuses={null} />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('shows a real live status when provided', () => {
    render(
      <VendorRiskRegister
        {...baseProps}
        vendors={[vendor()]}
        vendorStatuses={[{ vendorKey: 'stripe', indicator: 'outage', checkedAt: '2026-01-01', stale: false }]}
      />,
    )
    expect(screen.getByText('Outage')).toBeInTheDocument()
  })

  it('calls onSelectVendor when a row is clicked', async () => {
    const onSelectVendor = vi.fn()
    const user = userEvent.setup()
    render(<VendorRiskRegister {...baseProps} vendors={[vendor()]} onSelectVendor={onSelectVendor} />)
    await user.click(screen.getByText('Stripe'))
    expect(onSelectVendor).toHaveBeenCalledWith('stripe')
  })

  it('defaults sorted by cost descending', () => {
    const cheap = vendor({ key: 'cheap', vendor: 'Cheap', sla: 0.9999999 })
    const expensive = vendor({ key: 'expensive', vendor: 'Expensive', sla: 0.9 })
    render(<VendorRiskRegister {...baseProps} vendors={[cheap, expensive]} />)
    const rows = screen.getAllByRole('row').slice(1) // skip header row
    expect(rows[0].textContent).toContain('Expensive')
    expect(rows[1].textContent).toContain('Cheap')
  })

  it('toggles sort direction on repeated header clicks', async () => {
    const a = vendor({ key: 'a', vendor: 'Alpha', sla: 0.99 })
    const b = vendor({ key: 'b', vendor: 'Beta', sla: 0.999 })
    const user = userEvent.setup()
    render(<VendorRiskRegister {...baseProps} vendors={[a, b]} />)

    await user.click(screen.getByRole('button', { name: /vendor/i }))
    let rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].textContent).toContain('Beta') // desc by vendor name (B > A)

    await user.click(screen.getByRole('button', { name: /vendor/i }))
    rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].textContent).toContain('Alpha') // asc
  })

  it('shows "not estimated" instead of $0/yr when cost per hour is zero', () => {
    render(<VendorRiskRegister {...baseProps} vendors={[vendor()]} costPerHour={0} />)
    expect(screen.getByText('not estimated')).toBeInTheDocument()
  })
})
