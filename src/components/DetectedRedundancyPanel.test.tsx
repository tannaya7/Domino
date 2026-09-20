// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import DetectedRedundancyPanel from './DetectedRedundancyPanel'
import type { DetectedRedundancyGroup } from '../lib/detectedRedundancy'

afterEach(() => cleanup())

function fixtureGroup(overrides: Partial<DetectedRedundancyGroup> = {}): DetectedRedundancyGroup {
  return {
    tier: 'payments',
    memberKeys: ['stripe', 'razorpay'],
    memberNames: ['Stripe', 'Razorpay'],
    groupDownProbabilityPerYear: 0.001,
    redundancyIllusion: false,
    sharedSubstrates: [],
    ...overrides,
  }
}

describe('DetectedRedundancyPanel', () => {
  it('renders nothing when there are no groups', () => {
    const { container } = render(<DetectedRedundancyPanel groups={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the category and member names', () => {
    render(<DetectedRedundancyPanel groups={[fixtureGroup()]} />)
    expect(screen.getByText(/payments/)).toBeInTheDocument()
    expect(screen.getByText(/Stripe \+ Razorpay/)).toBeInTheDocument()
  })

  it('shows the "possible redundancy" disclaimer', () => {
    render(<DetectedRedundancyPanel groups={[fixtureGroup()]} />)
    expect(screen.getByText(/we can't see whether your code actually fails over/i)).toBeInTheDocument()
  })

  it('shows the redundancy-illusion warning with shared substrates, when flagged', () => {
    render(
      <DetectedRedundancyPanel groups={[fixtureGroup({ redundancyIllusion: true, sharedSubstrates: ['aws'] })]} />,
    )
    expect(screen.getByText(/redundancy illusion/i)).toBeInTheDocument()
    expect(screen.getByText(/shares aws/i)).toBeInTheDocument()
  })

  it('does not show the illusion warning when not flagged', () => {
    render(<DetectedRedundancyPanel groups={[fixtureGroup({ redundancyIllusion: false })]} />)
    expect(screen.queryByText(/redundancy illusion/i)).not.toBeInTheDocument()
  })
})
