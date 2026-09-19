// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RiskOverview from './RiskOverview'
import { buildAdjacencyMap } from '../lib/graph'
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
    affectedFiles: ['src/pay.ts'],
    ...overrides,
  }
}

const graphData = { nodes: [{ id: 'src/pay.ts', label: 'pay.ts', type: 'file' }], edges: [] }

const baseProps = {
  entrypoints: [],
  naiveDowntimeHoursPerYear: 10,
  costPerHour: 500,
  currency: 'USD' as const,
  vendorStatuses: null,
  onSelectVendor: vi.fn(),
  graphData,
  adjacencyMap: buildAdjacencyMap(graphData.nodes, graphData.edges),
  onSelectNode: vi.fn(),
}

describe('RiskOverview', () => {
  it('defaults to the vendor risk register when there are vendors', () => {
    render(<RiskOverview {...baseProps} vendors={[vendor()]} />)
    expect(screen.getByText('Stripe')).toBeInTheDocument()
  })

  it('defaults to the Files sub-tab when there are no vendors', () => {
    render(<RiskOverview {...baseProps} vendors={[]} />)
    expect(screen.getByRole('heading', { name: 'Files' })).toBeInTheDocument()
    expect(screen.getByText('pay.ts')).toBeInTheDocument()
  })

  it('switches to the Files sub-tab on click, showing its (un-clipped) heading', async () => {
    const user = userEvent.setup()
    render(<RiskOverview {...baseProps} vendors={[vendor()]} />)
    await user.click(screen.getByRole('button', { name: 'Files' }))
    expect(screen.getByRole('heading', { name: 'Files' })).toBeInTheDocument()
    expect(screen.getByText('pay.ts')).toBeInTheDocument()
  })

  it('switches back to the vendor risk register', async () => {
    const user = userEvent.setup()
    render(<RiskOverview {...baseProps} vendors={[vendor()]} />)
    await user.click(screen.getByRole('button', { name: 'Files' }))
    await user.click(screen.getByRole('button', { name: 'Vendor risk register' }))
    expect(screen.getByText('Stripe')).toBeInTheDocument()
  })
})
