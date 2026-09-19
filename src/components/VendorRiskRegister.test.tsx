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
  onSelectVendor: vi.fn(),
}

describe('VendorRiskRegister', () => {
  it('shows an empty state when there are no vendors', () => {
    render(<VendorRiskRegister {...baseProps} vendors={[]} />)
    expect(screen.getByText(/no third-party vendors detected/i)).toBeInTheDocument()
  })

  it('shows every vendor as a row with its computed columns', () => {
    render(<VendorRiskRegister {...baseProps} vendors={[vendor()]} />)
    expect(screen.getByText('Stripe')).toBeInTheDocument()
    expect(screen.getByText('payments')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument() // downtime share, lone vendor
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
