// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import VendorHeadlineCard from './VendorHeadlineCard'
import type { AvailabilityHeadline, ExactAvailabilityResult, Vendor } from '../lib/types'

afterEach(() => cleanup())

function fixtureResult(overrides: Partial<ExactAvailabilityResult> = {}): ExactAvailabilityResult {
  return {
    naiveAvailability: 0.999,
    independentSameMarginalsAvailability: 0.998,
    correlatedAvailability: 0.998,
    expectedDowntimeHoursPerYear: { naive: 8.76, independentSameMarginals: 17.5, correlated: 17.5 },
    expectedAnnualExposure: { naive: 5000, independentSameMarginals: 10000, correlated: 10000 },
    assumptions: { costPerHourOfDowntime: 600, vendorSlaOverrides: {}, substrateOutageProbabilities: {} },
    ...overrides,
  }
}

function fixtureHeadline(overrides: Partial<AvailabilityHeadline> = {}): AvailabilityHeadline {
  return {
    vendors: 12,
    substrates: 3,
    unknownHostingVendorCount: 0,
    tailRisk: [],
    hiddenUpstreamHoursPerYear: 8.76,
    concentrationEffectHoursPerYear: -1,
    worstSingleEvent: { substrate: 'aws', vendorKeys: [], vendorNames: [], entrypointsAffected: [], probabilityPerYear: 0.001 },
    redundancyGroups: [],
    expectedLossPerYear: 12000,
    ...overrides,
  }
}

function fixtureVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.9999,
    detectedVia: ['manifest:npm:stripe', 'import:stripe'],
    detectedInFiles: [],
    ...overrides,
  }
}

describe('VendorHeadlineCard', () => {
  it('renders nothing when there are no vendors', () => {
    const { container } = render(
      <VendorHeadlineCard
        headline={fixtureHeadline({ vendors: 0, substrates: 0, worstSingleEvent: null })}
        result={fixtureResult()}
        currency="USD"
        vendors={[]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the rich N vendors -> M substrates story with an invisible-to-SLA-math percentage and exposure', () => {
    render(<VendorHeadlineCard headline={fixtureHeadline()} result={fixtureResult()} currency="USD" vendors={[]} />)
    expect(screen.getByText('12 vendors')).toBeInTheDocument()
    expect(screen.getByText('3 substrates')).toBeInTheDocument()
    expect(screen.getByText(/% of expected downtime is invisible to SLA math/)).toBeInTheDocument()
    expect(screen.getByText(/\$12,000\/yr at your assumptions/)).toBeInTheDocument()
  })

  it('shows the graceful single-vendor message with the substrate name', () => {
    render(
      <VendorHeadlineCard
        headline={fixtureHeadline({
          vendors: 1,
          substrates: 1,
          worstSingleEvent: { substrate: 'gcp', vendorKeys: ['v1'], vendorNames: ['V1'], entrypointsAffected: [], probabilityPerYear: 0.001 },
        })}
        result={fixtureResult()}
        currency="USD"
        vendors={[]}
      />,
    )
    expect(screen.getByText('1 vendor on 1 substrate (gcp), no shared infrastructure detected.')).toBeInTheDocument()
  })

  it('shows a self-hosted/unknown-hosting message when there is no substrate at all', () => {
    render(
      <VendorHeadlineCard
        headline={fixtureHeadline({ vendors: 1, substrates: 0, worstSingleEvent: null })}
        result={fixtureResult()}
        currency="USD"
        vendors={[]}
      />,
    )
    expect(screen.getByText(/self-hosted\/unknown hosting/)).toBeInTheDocument()
  })

  it('shows the multi-vendor self-hosted message when 2+ vendors have no shared infrastructure', () => {
    render(
      <VendorHeadlineCard
        headline={fixtureHeadline({ vendors: 3, substrates: 0, worstSingleEvent: null })}
        result={fixtureResult()}
        currency="USD"
        vendors={[]}
      />,
    )
    expect(screen.getByText('3 vendors, no shared infrastructure detected (self-hosted/unknown hosting).')).toBeInTheDocument()
  })

  it('clamps the invisible-to-SLA-math share to 0% when there is no correlated downtime', () => {
    render(
      <VendorHeadlineCard
        headline={fixtureHeadline()}
        result={fixtureResult({ expectedDowntimeHoursPerYear: { naive: 0, independentSameMarginals: 0, correlated: 0 } })}
        currency="USD"
        vendors={[]}
      />,
    )
    expect(screen.getByText(/0% of expected downtime is invisible to SLA math/)).toBeInTheDocument()
  })

  it('counts only high-confidence vendors (manifest AND (import or env)) toward "N high-confidence"', () => {
    const vendors = [
      fixtureVendor({ key: 'a', detectedVia: ['manifest:npm:a', 'import:a'] }), // high
      fixtureVendor({ key: 'b', detectedVia: ['import:b'] }), // medium
      fixtureVendor({ key: 'c', detectedVia: ['env:C_KEY'] }), // low
    ]
    render(<VendorHeadlineCard headline={fixtureHeadline()} result={fixtureResult()} currency="USD" vendors={vendors} />)
    expect(screen.getByText('1 high-confidence')).toBeInTheDocument()
  })

  it('shows "+N unclassified" only when a positive count is passed', () => {
    const { rerender } = render(
      <VendorHeadlineCard headline={fixtureHeadline()} result={fixtureResult()} currency="USD" vendors={[]} />,
    )
    expect(screen.queryByText(/unclassified/)).not.toBeInTheDocument()

    rerender(
      <VendorHeadlineCard headline={fixtureHeadline()} result={fixtureResult()} currency="USD" vendors={[]} unclassifiedCount={5} />,
    )
    expect(screen.getByText('+5 unclassified')).toBeInTheDocument()
  })
})
