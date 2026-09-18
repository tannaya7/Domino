// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AvailabilityPanel from './AvailabilityPanel'
import type { SimulateResponse } from '../lib/api'

afterEach(() => cleanup())

function fixtureSimulation(overrides: Partial<SimulateResponse> = {}): SimulateResponse {
  return {
    scenario: null,
    presetScenarios: [],
    simulation: {
      naiveAvailability: 0.999,
      correlatedAvailability: 0.999,
      trials: 20000,
      expectedDowntimeHoursPerYear: { naive: 8.76, correlated: 8.76 },
      expectedAnnualExposure: { naive: 5000, correlated: 5000 },
      correlatedShareOfDowntime: 0,
      assumptions: { trials: 20000, costPerHourOfDowntime: 600, substrateFailureProbabilities: {}, vendorSlaOverrides: {} },
    },
    headline: {
      vendors: 1,
      substrates: 1,
      invisibleShare: 0,
      expectedLossPerYear: 5000,
      breakdown: [{ substrate: 'gcp', vendorCount: 1, failureProbability: 0, contributesCorrelation: false }],
    },
    ...overrides,
  }
}

describe('AvailabilityPanel', () => {
  it('shows a prompt to run a simulation before one exists', () => {
    render(<AvailabilityPanel simulation={null} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText(/run a monte carlo simulation/i)).toBeInTheDocument()
  })

  it("labels a solo-vendor substrate as having nothing to correlate, not a hidden risk", () => {
    render(<AvailabilityPanel simulation={fixtureSimulation()} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText('nothing to correlate')).toBeInTheDocument()
    expect(screen.queryByText(/shared risk/)).not.toBeInTheDocument()
  })

  it('labels a substrate shared by 2+ vendors as contributing shared risk', () => {
    const simulation = fixtureSimulation({
      headline: {
        vendors: 2,
        substrates: 1,
        invisibleShare: 0.4,
        expectedLossPerYear: 9000,
        breakdown: [{ substrate: 'aws', vendorCount: 2, failureProbability: 0.02, contributesCorrelation: true }],
      },
    })
    render(<AvailabilityPanel simulation={simulation} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText(/shared risk \(2\.00%\/yr\)/)).toBeInTheDocument()
  })

  it('formats estimated exposure in the given currency', () => {
    render(<AvailabilityPanel simulation={fixtureSimulation()} isLoading={false} error={null} currency="INR" onRun={vi.fn()} />)
    expect(screen.getByText('₹5,000/yr')).toBeInTheDocument()
  })

  it('shows "not estimated" when expected loss is zero', () => {
    const simulation = fixtureSimulation({
      headline: { vendors: 1, substrates: 1, invisibleShare: 0, expectedLossPerYear: 0, breakdown: [] },
    })
    render(<AvailabilityPanel simulation={simulation} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText('not estimated')).toBeInTheDocument()
  })
})
