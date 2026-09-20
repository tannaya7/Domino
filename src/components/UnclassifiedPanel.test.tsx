// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import UnclassifiedPanel from './UnclassifiedPanel'
import type { UnclassifiedSummary } from '../lib/types'

afterEach(() => cleanup())

function fixtureSummary(overrides: Partial<UnclassifiedSummary> = {}): UnclassifiedSummary {
  return {
    packages: [{ name: '@acme/widgets', files: ['src/a.ts', 'src/b.ts'] }],
    envVars: [{ name: 'ACME_TOKEN', files: ['src/a.ts'] }],
    hosts: [{ name: 'api.mystery.io', files: ['src/c.ts'] }],
    totalCount: 3,
    ...overrides,
  }
}

describe('UnclassifiedPanel', () => {
  it('renders nothing when no scan ran (null)', () => {
    const { container } = render(<UnclassifiedPanel unclassified={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a positive "nothing unclassified" message when the scan ran and found none', () => {
    render(<UnclassifiedPanel unclassified={fixtureSummary({ packages: [], envVars: [], hosts: [], totalCount: 0 })} />)
    expect(screen.getByText(/nothing unclassified/i)).toBeInTheDocument()
  })

  it('shows the counts summary line', () => {
    render(<UnclassifiedPanel unclassified={fixtureSummary()} />)
    expect(screen.getByText(/1 package/)).toBeInTheDocument()
    expect(screen.getByText(/1 env var/)).toBeInTheDocument()
    expect(screen.getByText(/1 host/)).toBeInTheDocument()
  })

  it('lists top items with their file counts', () => {
    render(<UnclassifiedPanel unclassified={fixtureSummary()} />)
    expect(screen.getByText('@acme/widgets')).toBeInTheDocument()
    expect(screen.getByText('2 files')).toBeInTheDocument()
    expect(screen.getByText('ACME_TOKEN')).toBeInTheDocument()
    expect(screen.getByText('api.mystery.io')).toBeInTheDocument()
  })

  it('shows the "unknown != safe" line when there is anything unclassified', () => {
    render(<UnclassifiedPanel unclassified={fixtureSummary()} />)
    expect(screen.getByText(/unknown != safe/i)).toBeInTheDocument()
  })

  it('caps the item list at 5 and shows a "+N more" line', () => {
    const packages = Array.from({ length: 8 }, (_, i) => ({ name: `pkg-${i}`, files: ['x.ts'] }))
    render(<UnclassifiedPanel unclassified={fixtureSummary({ packages, envVars: [], hosts: [], totalCount: 8 })} />)
    expect(screen.getByText('+3 more')).toBeInTheDocument()
  })

  it('omits a group entirely when it has no items', () => {
    render(<UnclassifiedPanel unclassified={fixtureSummary({ envVars: [], hosts: [], totalCount: 1 })} />)
    expect(screen.queryByText('Env vars')).not.toBeInTheDocument()
    expect(screen.queryByText('Hosts')).not.toBeInTheDocument()
  })

  it('shows Hosts and Env vars above Packages — the strongest live-service evidence first', () => {
    render(<UnclassifiedPanel unclassified={fixtureSummary()} />)
    const labels = screen.getAllByText(/^(Hosts|Env vars|Packages)$/).map((el) => el.textContent)
    expect(labels).toEqual(['Hosts', 'Env vars', 'Packages'])
  })
})
