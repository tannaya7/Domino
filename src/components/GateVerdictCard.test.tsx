// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import GateVerdictCard from './GateVerdictCard'
import type { GateResponse } from '../lib/api'

afterEach(() => cleanup())

function fixtureGate(overrides: Partial<GateResponse> = {}): GateResponse {
  return {
    pr: { owner: 'acme', repo: 'widget', number: 42, headSha: 'abc123', baseRef: 'main', baselineNote: "the repository's default branch (main)" },
    newVendors: [],
    entrypointsAffected: [],
    concentration: {
      before: { vendorCount: 2, substrateCount: 2, bySubstrate: [], mostConcentrated: { substrate: 'aws', vendorKeys: ['a'], vendorNames: ['A'], share: 0.5 } },
      after: { vendorCount: 2, substrateCount: 2, bySubstrate: [], mostConcentrated: { substrate: 'aws', vendorKeys: ['a'], vendorNames: ['A'], share: 0.5 } },
    },
    exposure: { before: 0, after: 0, delta: 0, currency: 'USD' },
    policy: { status: 'info', violations: [] },
    markdown: '<!-- blast-radius-mapper -->\n...',
    truncated: false,
    ...overrides,
  }
}

describe('GateVerdictCard', () => {
  it('shows an error state instead of the card when the gate call failed', () => {
    render(<GateVerdictCard gate={fixtureGate()} error="Could not reach the gate API." />)
    expect(screen.getByText(/could not reach the gate api/i)).toBeInTheDocument()
    expect(screen.queryByText('PR Resilience Gate')).not.toBeInTheDocument()
  })

  it('renders "Report only" when there is no policy', () => {
    render(<GateVerdictCard gate={fixtureGate()} error={null} />)
    expect(screen.getByText('Report only')).toBeInTheDocument()
  })

  it('renders "Pass" for a policy with no violations', () => {
    render(<GateVerdictCard gate={fixtureGate({ policy: { status: 'pass', violations: [] } })} error={null} />)
    expect(screen.getByText('Pass')).toBeInTheDocument()
  })

  it('renders "Fail" and lists each violation message', () => {
    const gate = fixtureGate({
      policy: {
        status: 'fail',
        violations: [
          { rule: 'maxNewVendorsPerPr', actual: 2, limit: 1, message: 'This PR introduces 2 new vendor(s), above the limit of 1 per PR.' },
        ],
      },
    })
    render(<GateVerdictCard gate={gate} error={null} />)
    expect(screen.getByText('Fail')).toBeInTheDocument()
    expect(screen.getByText(/introduces 2 new vendor/i)).toBeInTheDocument()
  })

  it('lists new vendors with their substrate', () => {
    const gate = fixtureGate({
      newVendors: [{ key: 'stripe', vendor: 'Stripe', substrate: ['aws'], category: 'payments', detectedVia: ['import:stripe'], files: ['src/pay.ts'] }],
    })
    render(<GateVerdictCard gate={gate} error={null} />)
    expect(screen.getByText('New vendors (1)')).toBeInTheDocument()
    expect(screen.getByText(/Stripe on aws/)).toBeInTheDocument()
  })

  it('shows "None detected." when there are no new vendors', () => {
    render(<GateVerdictCard gate={fixtureGate()} error={null} />)
    expect(screen.getByText('None detected.')).toBeInTheDocument()
  })

  it('shows the before/after concentration numbers', () => {
    const gate = fixtureGate({
      concentration: {
        before: { vendorCount: 2, substrateCount: 2, bySubstrate: [], mostConcentrated: { substrate: 'aws', vendorKeys: ['a'], vendorNames: ['A'], share: 0.5 } },
        after: { vendorCount: 3, substrateCount: 2, bySubstrate: [], mostConcentrated: { substrate: 'aws', vendorKeys: ['a', 'b'], vendorNames: ['A', 'B'], share: 0.67 } },
      },
    })
    render(<GateVerdictCard gate={gate} error={null} />)
    expect(screen.getByText(/2 → 3/)).toBeInTheDocument()
    expect(screen.getByText(/67% on aws/)).toBeInTheDocument()
  })

  it('never implies a guarantee — always shows the modeled-estimate footer', () => {
    render(<GateVerdictCard gate={fixtureGate()} error={null} />)
    expect(screen.getByText(/modeled estimate under editable assumptions/i)).toBeInTheDocument()
    expect(screen.getByText(/never a guarantee/i)).toBeInTheDocument()
  })
})
