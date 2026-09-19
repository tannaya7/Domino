// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StatusBanner from './StatusBanner'

afterEach(() => cleanup())

describe('StatusBanner', () => {
  it('never renders the word "live" — every status is a point-in-time check, always qualified with "as of"', () => {
    render(
      <StatusBanner
        candidate={{ vendorKey: 'stripe', indicator: 'outage', entrypointsAffected: 3 }}
        vendorName="Stripe"
        checkedAt="2026-01-01T12:34:00Z"
        onShowBlastRadius={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert').textContent?.toLowerCase()).not.toContain('live')
    expect(screen.getByText(/as of/)).toBeInTheDocument()
  })

  it('shows the vendor name, status, and entrypoint count', () => {
    render(
      <StatusBanner
        candidate={{ vendorKey: 'stripe', indicator: 'degraded', entrypointsAffected: 5 }}
        vendorName="Stripe"
        checkedAt="2026-01-01T12:34:00Z"
        onShowBlastRadius={vi.fn()}
      />,
    )
    expect(screen.getByText(/Stripe/)).toBeInTheDocument()
    expect(screen.getByText(/degraded/)).toBeInTheDocument()
    expect(screen.getByText(/5 entrypoint\(s\)/)).toBeInTheDocument()
  })

  it('calls onShowBlastRadius when the button is clicked', async () => {
    const onShowBlastRadius = vi.fn()
    const user = userEvent.setup()
    render(
      <StatusBanner
        candidate={{ vendorKey: 'stripe', indicator: 'outage', entrypointsAffected: 1 }}
        vendorName="Stripe"
        checkedAt="2026-01-01T12:34:00Z"
        onShowBlastRadius={onShowBlastRadius}
      />,
    )
    await user.click(screen.getByRole('button', { name: /show blast radius/i }))
    expect(onShowBlastRadius).toHaveBeenCalled()
  })
})
