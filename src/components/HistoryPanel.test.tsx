// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HistoryPanel from './HistoryPanel'
import type { AnalysisSnapshotSummary } from '../lib/types'

const { fetchHistoryMock, saveSnapshotMock } = vi.hoisted(() => ({
  fetchHistoryMock: vi.fn(),
  saveSnapshotMock: vi.fn(),
}))
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, fetchHistory: fetchHistoryMock, saveSnapshot: saveSnapshotMock }
})

afterEach(() => cleanup())

function snapshot(overrides: Partial<AnalysisSnapshotSummary> = {}): AnalysisSnapshotSummary {
  return {
    repo: 'octocat/hello',
    sk: '2026-01-01T00:00:00.000Z#aaaaaaa',
    sha: 'aaaaaaa1111',
    analyzedAt: '2026-01-01T00:00:00.000Z',
    vendors: [{ id: 'stripe', substrate: ['aws'], category: 'payments' }],
    substrateShares: [{ substrate: 'aws', share: 1 }],
    tailRisk: [{ k: 2, correlated: 0.001, multiplier: 1.5 }],
    worstSingleEvent: null,
    topCriticality: [],
    unclassifiedCount: 0,
    ownInfraFindingsCount: 0,
    ownInfraRegionCount: 0,
    entrypointCount: 2,
    engineVersion: '1.0.0',
    kbVersion: 'v1',
    assumptionsHash: 'h1',
    ...overrides,
  }
}

const defaultProps = {
  repo: 'octocat/hello',
  repoUrl: 'https://github.com/octocat/hello',
  embeddedHistory: null,
  isSnapshotMode: false,
  costPerHour: 500,
  vendorSlaOverrides: {},
  substrateOutageProbabilities: {},
}

describe('HistoryPanel', () => {
  it('fetches and shows history for a live (non-snapshot) repo', async () => {
    fetchHistoryMock.mockResolvedValue([snapshot()])
    render(<HistoryPanel {...defaultProps} />)
    expect(await screen.findByText(/1 vendor$/)).toBeInTheDocument()
    expect(fetchHistoryMock).toHaveBeenCalledWith('octocat/hello')
  })

  it('uses embedded history with zero network calls in snapshot/demo mode', async () => {
    render(<HistoryPanel {...defaultProps} isSnapshotMode embeddedHistory={[snapshot()]} />)
    expect(await screen.findByText(/1 vendor$/)).toBeInTheDocument()
    expect(fetchHistoryMock).not.toHaveBeenCalled()
  })

  it('shows an honest empty state rather than fabricating a chart from nothing', async () => {
    fetchHistoryMock.mockResolvedValue([])
    render(<HistoryPanel {...defaultProps} />)
    expect(await screen.findByText(/no snapshots saved/i)).toBeInTheDocument()
  })

  it('selecting two snapshots computes and shows a real diff verdict', async () => {
    const a = snapshot({ sk: 'sk-a', sha: 'aaa1111', analyzedAt: '2026-01-01T00:00:00.000Z', substrateShares: [{ substrate: 'aws', share: 0.4 }] })
    const b = snapshot({ sk: 'sk-b', sha: 'bbb2222', analyzedAt: '2026-02-01T00:00:00.000Z', substrateShares: [{ substrate: 'aws', share: 0.62 }] })
    fetchHistoryMock.mockResolvedValue([b, a]) // newest-first, as the API returns it
    const user = userEvent.setup()
    render(<HistoryPanel {...defaultProps} />)

    await screen.findByText(/2 vendor/i).catch(() => {}) // just wait for load
    const checkboxes = await screen.findAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    await user.click(checkboxes[0])
    await user.click(checkboxes[1])

    expect(await screen.findByText('aws share rose 40% -> 62%')).toBeInTheDocument()
  })

  it('Save snapshot calls the API and prepends the result to the list', async () => {
    fetchHistoryMock.mockResolvedValue([])
    const saved = snapshot({ note: 'my note' })
    saveSnapshotMock.mockResolvedValue(saved)
    const user = userEvent.setup()
    render(<HistoryPanel {...defaultProps} />)

    await screen.findByText(/no snapshots saved/i)
    await user.type(screen.getByPlaceholderText(/optional note/i), 'my note')
    await user.click(screen.getByRole('button', { name: /save snapshot/i }))

    await waitFor(() => expect(saveSnapshotMock).toHaveBeenCalledWith(expect.objectContaining({ repoUrl: 'https://github.com/octocat/hello', note: 'my note' })))
    expect(await screen.findByText(/1 vendor$/)).toBeInTheDocument()
  })

  it('does not show the Save snapshot control in snapshot/demo mode', () => {
    render(<HistoryPanel {...defaultProps} isSnapshotMode embeddedHistory={[]} />)
    expect(screen.queryByRole('button', { name: /save snapshot/i })).not.toBeInTheDocument()
  })
})
