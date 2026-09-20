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
      independentSameMarginalsAvailability: 0.998,
      correlatedAvailability: 0.998,
      expectedDowntimeHoursPerYear: { naive: 8.76, independentSameMarginals: 17.5, correlated: 17.5 },
      expectedAnnualExposure: { naive: 5000, independentSameMarginals: 5000, correlated: 5000 },
      assumptions: { costPerHourOfDowntime: 600, substrateOutageProbabilities: { gcp: 0.001 }, vendorSlaOverrides: {} },
    },
    headline: {
      vendors: 1,
      substrates: 1,
      unknownHostingVendorCount: 0,
      tailRisk: [
        { k: 2, naive: 0, independentSameMarginals: 0, correlated: 0, multiplier: 1 },
        { k: 3, naive: 0, independentSameMarginals: 0, correlated: 0, multiplier: 1 },
      ],
      hiddenUpstreamHoursPerYear: 8.76,
      concentrationEffectHoursPerYear: 0,
      worstSingleEvent: null,
      redundancyGroups: [],
      expectedLossPerYear: 5000,
    },
    ...overrides,
  }
}

describe('AvailabilityPanel', () => {
  it('shows a prompt to run the model before one exists', () => {
    render(<AvailabilityPanel simulation={null} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText(/run the exact availability model/i)).toBeInTheDocument()
  })

  it('labels the result as exact, not sampled', () => {
    render(<AvailabilityPanel simulation={fixtureSimulation()} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText(/exact \(enumerated\).*cross-validated against monte carlo in tests/i)).toBeInTheDocument()
  })

  it('shows the worst single event with affected vendor names', () => {
    const simulation = fixtureSimulation({
      headline: {
        ...fixtureSimulation().headline,
        worstSingleEvent: {
          substrate: 'aws',
          vendorKeys: ['a', 'b'],
          vendorNames: ['Stripe', 'Clerk'],
          entrypointsAffected: ['app/page.tsx'],
          probabilityPerYear: 0.001,
        },
      },
    })
    render(<AvailabilityPanel simulation={simulation} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText(/aws outage/i)).toBeInTheDocument()
    expect(screen.getByText(/Stripe, Clerk/)).toBeInTheDocument()
    expect(screen.getByText(/1 entrypoint\(s\) affected/)).toBeInTheDocument()
  })

  it('does not show a worst-event card when there is none', () => {
    render(<AvailabilityPanel simulation={fixtureSimulation()} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.queryByText(/worst single event/i)).not.toBeInTheDocument()
  })

  it('shows a curated redundancy pair', () => {
    const simulation = fixtureSimulation({
      headline: {
        ...fixtureSimulation().headline,
        redundancyGroups: [{ memberKeys: ['stripe', 'razorpay'], memberNames: ['Stripe', 'Razorpay'], groupDownProbabilityPerYear: 0.0001 }],
      },
    })
    render(<AvailabilityPanel simulation={simulation} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText('Stripe + Razorpay')).toBeInTheDocument()
  })

  it('notes unknown-hosting vendors when present', () => {
    const simulation = fixtureSimulation({ headline: { ...fixtureSimulation().headline, unknownHostingVendorCount: 2 } })
    render(<AvailabilityPanel simulation={simulation} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText(/2 vendor\(s\) with unknown hosting, not counted as correlated/)).toBeInTheDocument()
  })

  it('formats estimated exposure in the given currency', () => {
    render(<AvailabilityPanel simulation={fixtureSimulation()} isLoading={false} error={null} currency="INR" onRun={vi.fn()} />)
    expect(screen.getByText('₹5,000/yr')).toBeInTheDocument()
  })

  it('shows "not estimated" when expected loss is zero', () => {
    const simulation = fixtureSimulation({ headline: { ...fixtureSimulation().headline, expectedLossPerYear: 0 } })
    render(<AvailabilityPanel simulation={simulation} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText('not estimated')).toBeInTheDocument()
  })

  it('displays a tail-risk multiplier capped at ">1,000x"', () => {
    const simulation = fixtureSimulation({
      headline: {
        ...fixtureSimulation().headline,
        vendors: 2,
        tailRisk: [{ k: 2, naive: 0, independentSameMarginals: 0.0000001, correlated: 0.01, multiplier: 1000 }],
      },
    })
    render(<AvailabilityPanel simulation={simulation} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText(/>1,000x/)).toBeInTheDocument()
  })

  it('shows "needs at least k vendors" instead of a fabricated 0%/1.0x when there aren\'t enough vendors to reach k', () => {
    // Default fixture has 1 vendor with tailRisk checkpoints at k=2 and k=3 — both impossible, not "0% risk".
    render(<AvailabilityPanel simulation={fixtureSimulation()} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.getByText('needs at least 2 vendors')).toBeInTheDocument()
    expect(screen.getByText('needs at least 3 vendors')).toBeInTheDocument()
    expect(screen.queryByText(/1\.0x/)).not.toBeInTheDocument()
  })

  it('shows the real percentage/multiplier once there are enough vendors to reach k', () => {
    const simulation = fixtureSimulation({
      headline: {
        ...fixtureSimulation().headline,
        vendors: 3,
        tailRisk: [{ k: 2, naive: 0, independentSameMarginals: 0.001, correlated: 0.01, multiplier: 10 }],
      },
    })
    render(<AvailabilityPanel simulation={simulation} isLoading={false} error={null} currency="USD" onRun={vi.fn()} />)
    expect(screen.queryByText(/needs at least/)).not.toBeInTheDocument()
    expect(screen.getByText(/10\.0x/)).toBeInTheDocument()
  })
})
