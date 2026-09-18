// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import StatusBadge from './StatusBadge'

afterEach(() => cleanup())

describe('StatusBadge', () => {
  it.each([
    ['operational', 'Operational'],
    ['degraded', 'Degraded'],
    ['outage', 'Outage'],
    ['unknown', 'Unknown'],
  ] as const)('renders the correct label for indicator "%s"', (indicator, label) => {
    render(<StatusBadge indicator={indicator} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('never renders "Operational" or any healthy label for an unknown status', () => {
    render(<StatusBadge indicator="unknown" />)
    expect(screen.queryByText(/operational/i)).not.toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('shows a stale marker for a stale non-unknown status', () => {
    render(<StatusBadge indicator="degraded" stale />)
    expect(screen.getByText(/stale/i)).toBeInTheDocument()
  })

  it('does not show a redundant stale marker for an unknown status', () => {
    render(<StatusBadge indicator="unknown" stale />)
    expect(screen.queryByText(/stale/i)).not.toBeInTheDocument()
  })
})
