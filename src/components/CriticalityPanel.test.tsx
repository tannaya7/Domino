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
    expect(screen.getByText(/structural bottleneck.*disconnects 1 file.*cuts off 1 other route/i)).toBeInTheDocument()
    // other.ts is shown (has reachability loss) but is never labeled an articulation point.
    expect(screen.getByText('other.ts')).toBeInTheDocument()
    expect(screen.getByText(/1 other route depends on it/i)).toBeInTheDocument()
  })

  it('middle-truncates long paths and keeps the full path in a tooltip', () => {
    const longPath = 'frontend/src/components/nav/shell/AppShellNavigationHeader.tsx'
    const criticality: CriticalityResult = {
      entrypoints: ['main.ts'],
      articulationPoints: [longPath],
      byNode: [
        {
          nodeId: longPath,
          isArticulationPoint: true,
          affectedEntrypoints: ['main.ts'],
          orphanedNodes: [],
          entrypointCount: 1,
          reachabilityLossRatio: 1,
        },
      ],
    }
    render(<CriticalityPanel criticality={criticality} />)

    const button = screen.getByRole('button', { name: /AppShellNavigationHeader\.tsx/ })
    expect(button.textContent).not.toBe(longPath)
    expect(button.textContent?.startsWith('…/')).toBe(true)
    expect(button).toHaveAttribute('title', longPath)
  })

  it('shows short paths in full, with no truncation ellipsis', () => {
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
    render(<CriticalityPanel criticality={criticality} />)
    expect(screen.getByText('hub.ts')).toBeInTheDocument()
  })

  it('shows at most the top 5 notable nodes', () => {
    const byNode = Array.from({ length: 8 }, (_, i) => ({
      nodeId: `file${i}.ts`,
      isArticulationPoint: true,
      affectedEntrypoints: ['main.ts'],
      orphanedNodes: [],
      entrypointCount: 1,
      reachabilityLossRatio: 1,
    }))
    const criticality: CriticalityResult = {
      entrypoints: ['main.ts'],
      articulationPoints: byNode.map((n) => n.nodeId),
      byNode,
    }
    render(<CriticalityPanel criticality={criticality} />)
    expect(screen.getAllByRole('button')).toHaveLength(5)
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
