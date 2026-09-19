// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TopBar, { type StatusChipInfo } from './TopBar'

afterEach(() => cleanup())

const okChip: StatusChipInfo = { label: '2/2 operational', color: '#0ca30c', pulsing: false }

describe('TopBar', () => {
  it('pre-selects the default scenario', () => {
    render(
      <TopBar
        repoLabel="octocat/hello"
        branch="main"
        hasVendorData={true}
        statusChip={okChip}
        isSimulating={false}
        defaultScenarioId="gcp-outage"
        onSimulate={vi.fn()}
        onReset={vi.fn()}
        snapshotInfo={null}
        onAnalyzeLive={vi.fn()}
        isAnalyzingLive={false}
      />,
    )
    expect(screen.getByLabelText('Failure scenario')).toHaveValue('gcp-outage')
  })

  it('runs the currently selected scenario, not necessarily the default, when Simulate is clicked', async () => {
    const onSimulate = vi.fn()
    const user = userEvent.setup()
    render(
      <TopBar
        repoLabel={null}
        branch={null}
        hasVendorData={true}
        statusChip={okChip}
        isSimulating={false}
        defaultScenarioId="aws-outage"
        onSimulate={onSimulate}
        onReset={vi.fn()}
        snapshotInfo={null}
        onAnalyzeLive={vi.fn()}
        isAnalyzingLive={false}
      />,
    )
    await user.selectOptions(screen.getByLabelText('Failure scenario'), 'cloudflare-outage')
    await user.click(screen.getByRole('button', { name: /simulate/i }))
    expect(onSimulate).toHaveBeenCalledWith('cloudflare-outage')
  })

  it('shows the given status chip label, not a hardcoded one', () => {
    render(
      <TopBar
        repoLabel={null}
        branch={null}
        hasVendorData={false}
        statusChip={{ label: 'Status unknown', color: '#6b7280', pulsing: false }}
        isSimulating={false}
        defaultScenarioId="aws-outage"
        onSimulate={vi.fn()}
        onReset={vi.fn()}
        snapshotInfo={null}
        onAnalyzeLive={vi.fn()}
        isAnalyzingLive={false}
      />,
    )
    expect(screen.getByText('Status unknown')).toBeInTheDocument()
  })

  it('hides the scenario picker and Simulate button when there is no vendor data', () => {
    render(
      <TopBar
        repoLabel={null}
        branch={null}
        hasVendorData={false}
        statusChip={okChip}
        isSimulating={false}
        defaultScenarioId="aws-outage"
        onSimulate={vi.fn()}
        onReset={vi.fn()}
        snapshotInfo={null}
        onAnalyzeLive={vi.fn()}
        isAnalyzingLive={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /simulate/i })).not.toBeInTheDocument()
  })

  it('shows a "snapshot @ sha on date" badge and an Analyze live button instead of the status chip', () => {
    render(
      <TopBar
        repoLabel="documenso/documenso"
        branch="main"
        hasVendorData={false}
        statusChip={okChip}
        isSimulating={false}
        defaultScenarioId="aws-outage"
        onSimulate={vi.fn()}
        onReset={vi.fn()}
        snapshotInfo={{ sha: 'e658cc5abcdef', generatedAt: '2026-09-19T03:43:37.001Z' }}
        onAnalyzeLive={vi.fn()}
        isAnalyzingLive={false}
      />,
    )
    expect(screen.getByText(/snapshot @ e658cc5 on/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /analyze live/i })).toBeInTheDocument()
    expect(screen.queryByText('2/2 operational')).not.toBeInTheDocument()
  })

  it('calls onAnalyzeLive when the button is clicked', async () => {
    const onAnalyzeLive = vi.fn()
    const user = userEvent.setup()
    render(
      <TopBar
        repoLabel="documenso/documenso"
        branch="main"
        hasVendorData={false}
        statusChip={okChip}
        isSimulating={false}
        defaultScenarioId="aws-outage"
        onSimulate={vi.fn()}
        onReset={vi.fn()}
        snapshotInfo={{ sha: 'e658cc5abcdef', generatedAt: '2026-09-19T03:43:37.001Z' }}
        onAnalyzeLive={onAnalyzeLive}
        isAnalyzingLive={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: /analyze live/i }))
    expect(onAnalyzeLive).toHaveBeenCalled()
  })
})
