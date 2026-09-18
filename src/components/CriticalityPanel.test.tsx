// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CriticalityPanel from './CriticalityPanel'
import type { CriticalityResult } from '../lib/types'

afterEach(() => cleanup())

describe('CriticalityPanel', () => {
  it('shows an empty state when nothing is structurally critical', () => {
    const criticality: CriticalityResult = { entrypoints: [], articulationPoints: [], byNode: [] }
    render(<CriticalityPanel criticality={criticality} />)
    expect(screen.getByText(/no structurally critical files/i)).toBeInTheDocument()
  })

  it('labels an articulation point distinctly from a merely-affected node', () => {
    const criticality: CriticalityResult = {
      entrypoints: ['main.ts'],
      articulationPoints: ['hub.ts'],
      byNode: [
        {
          nodeId: 'hub.ts',
          isArticulationPoint: true,
          affectedEntrypoints: ['main.ts'],
          orphanedNodes: ['leaf.ts'],
          entrypointCount: 1,
          reachabilityLossRatio: 1,
        },
        {
          nodeId: 'other.ts',
          isArticulationPoint: false,
          affectedEntrypoints: ['main.ts'],
          orphanedNodes: [],
          entrypointCount: 1,
          reachabilityLossRatio: 1,
        },
      ],
    }
    render(<CriticalityPanel criticality={criticality} />)

    expect(screen.getByText('Articulation point')).toBeInTheDocument()
    expect(screen.getByText(/disconnects 1 other required path/i)).toBeInTheDocument()
    // other.ts is shown (has reachability loss) but is never labeled an articulation point.
    expect(screen.getByText('other.ts')).toBeInTheDocument()
  })

  it('calls onSelectFile when a listed node is clicked', async () => {
    const onSelectFile = vi.fn()
    const criticality: CriticalityResult = {
      entrypoints: ['main.ts'],
      articulationPoints: ['hub.ts'],
      byNode: [
        {
          nodeId: 'hub.ts',
          isArticulationPoint: true,
          affectedEntrypoints: ['main.ts'],
          orphanedNodes: [],
          entrypointCount: 1,
          reachabilityLossRatio: 1,
        },
      ],
    }
    const user = userEvent.setup()
    render(<CriticalityPanel criticality={criticality} onSelectFile={onSelectFile} />)

    await user.click(screen.getByRole('button', { name: 'hub.ts' }))
    expect(onSelectFile).toHaveBeenCalledWith('hub.ts')
  })
})
