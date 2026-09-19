// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VendorDetailPanel from './VendorDetailPanel'
import type { VendorWithBlastRadius } from '../lib/types'

afterEach(() => cleanup())

function fixtureVendor(overrides: Partial<VendorWithBlastRadius> = {}): VendorWithBlastRadius {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.9999,
    detectedVia: ['import:stripe'],
    detectedInFiles: ['src/pay.ts'],
    directFiles: ['src/pay.ts'],
    affectedFiles: ['src/pay.ts', 'src/index.ts'],
    ...overrides,
  }
}

describe('VendorDetailPanel', () => {
  it('does not show a result line before "Simulate this vendor\'s outage" is clicked', () => {
    render(
      <VendorDetailPanel
        vendor={fixtureVendor()}
        entrypoints={['src/index.ts']}
        costPerHour={500}
        currency="USD"
        verification={undefined}
        onViewFiles={vi.fn()}
        onSimulateOutage={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(screen.queryByText(/if stripe is down/i)).not.toBeInTheDocument()
  })

  it('shows the result line with files/entrypoints/loss-per-hour once simulated, labeled not-probability-weighted', async () => {
    const onSimulateOutage = vi.fn()
    const user = userEvent.setup()
    render(
      <VendorDetailPanel
        vendor={fixtureVendor()}
        entrypoints={['src/index.ts']}
        costPerHour={500}
        currency="USD"
        verification={undefined}
        onViewFiles={vi.fn()}
        onSimulateOutage={onSimulateOutage}
        onClear={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /simulate this vendor's outage/i }))
    expect(onSimulateOutage).toHaveBeenCalled()
    expect(screen.getByText(/if stripe is down/i)).toBeInTheDocument()
    expect(screen.getByText('2 files')).toBeInTheDocument()
    expect(screen.getByText('1/1 entrypoints')).toBeInTheDocument()
    expect(screen.getByText('$500')).toBeInTheDocument()
    expect(screen.getByText(/per hour of outage \(not probability-weighted\)/i)).toBeInTheDocument()
  })

  it('explicitly says so when the vendor has files affected but no downstream entrypoints', async () => {
    const user = userEvent.setup()
    render(
      <VendorDetailPanel
        vendor={fixtureVendor({ affectedFiles: ['src/internal-util.ts'] })}
        entrypoints={['src/index.ts']}
        costPerHour={500}
        currency="USD"
        verification={undefined}
        onViewFiles={vi.fn()}
        onSimulateOutage={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /simulate this vendor's outage/i }))
    expect(screen.getByText(/no entrypoints depend on it/i)).toBeInTheDocument()
  })

  it('explicitly says so when the vendor has no downstream files at all', async () => {
    const user = userEvent.setup()
    render(
      <VendorDetailPanel
        vendor={fixtureVendor({ affectedFiles: [] })}
        entrypoints={['src/index.ts']}
        costPerHour={500}
        currency="USD"
        verification={undefined}
        onViewFiles={vi.fn()}
        onSimulateOutage={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /simulate this vendor's outage/i }))
    expect(screen.getByText(/has no downstream files/i)).toBeInTheDocument()
  })

  it('lists up to the top 5 affected paths, entrypoints first', async () => {
    const user = userEvent.setup()
    render(
      <VendorDetailPanel
        vendor={fixtureVendor({ affectedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'src/index.ts'] })}
        entrypoints={['src/index.ts']}
        costPerHour={500}
        currency="USD"
        verification={undefined}
        onViewFiles={vi.fn()}
        onSimulateOutage={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /simulate this vendor's outage/i }))
    expect(screen.getByText(/src\/index\.ts/)).toBeInTheDocument()
    expect(screen.queryByText(/f\.ts/)).not.toBeInTheDocument() // 7 files total, only top 5 shown
  })
})
