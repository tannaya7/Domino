// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { forwardRef, useImperativeHandle } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workspace, { type AnalyzedRepo } from './Workspace'
import type { AnalyzePrResponse } from '../lib/api'
import type { GraphData, Vendor } from '../lib/types'

// jsdom doesn't implement ResizeObserver — useElementSize (used by GraphView/VendorGraphView) needs a stub.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

// jsdom doesn't implement matchMedia — prefersReducedMotion() (useCountUp, VendorGraphView) needs
// it. Reporting reduced-motion here also makes StatTile's count-up jump instantly, keeping
// assertions deterministic instead of racing a real rAF animation.
vi.stubGlobal(
  'matchMedia',
  vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
)

// A minimal fake CanvasRenderingContext2D — just enough for VendorGraphView's nodeCanvasObject to
// run without throwing, capturing the FIRST fillStyle set before .fill() (the node body's color;
// later strokes for rings don't overwrite it).
function fakeCanvasContext() {
  let fillStyle = ''
  let capturedFill: string | undefined
  const ctx = {
    beginPath: () => {},
    arc: () => {},
    fill: () => {
      if (capturedFill === undefined) capturedFill = fillStyle
    },
    stroke: () => {},
    fillText: () => {},
    set fillStyle(v: string) {
      fillStyle = v
    },
    get fillStyle() {
      return fillStyle
    },
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, getCapturedFill: () => capturedFill }
}

vi.mock('react-force-graph-2d', () => ({
  default: forwardRef(function MockForceGraph2D(props: Record<string, unknown>, ref) {
    useImperativeHandle(ref, () => ({
      zoomToFit: vi.fn(),
      zoom: vi.fn(),
      d3Force: vi.fn(),
      d3ReheatSimulation: vi.fn(),
      pauseAnimation: vi.fn(),
      resumeAnimation: vi.fn(),
    }))
    const graphData = props.graphData as { nodes: Array<Record<string, unknown>> }
    const nodeColor = props.nodeColor as ((n: unknown) => string) | undefined
    const nodeCanvasObject = props.nodeCanvasObject as
      | ((n: unknown, ctx: CanvasRenderingContext2D, scale: number) => void)
      | undefined
    const onNodeClick = props.onNodeClick as ((n: unknown) => void) | undefined

    function colorFor(n: Record<string, unknown>): string | undefined {
      if (nodeColor) return nodeColor(n)
      if (nodeCanvasObject) {
        const { ctx, getCapturedFill } = fakeCanvasContext()
        nodeCanvasObject(n, ctx, 1)
        return getCapturedFill()
      }
      return undefined
    }

    function labelFor(n: Record<string, unknown>): string {
      if (typeof n.label === 'string') return n.label
      const vendor = n.vendor as { vendor?: string } | undefined
      return vendor?.vendor ?? String(n.id)
    }

    return (
      <div data-testid="mock-graph">
        {graphData.nodes.map((n) => (
          <button
            key={String(n.id)}
            data-testid={`node-${n.id}`}
            data-color={colorFor(n)}
            onClick={() => onNodeClick?.(n)}
          >
            {labelFor(n)}
          </button>
        ))}
      </div>
    )
  }),
}))

const { simulateMock, fetchStatusMock, fetchRunbookMock } = vi.hoisted(() => ({
  simulateMock: vi.fn(),
  fetchStatusMock: vi.fn(),
  fetchRunbookMock: vi.fn(),
}))

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, simulate: simulateMock, fetchStatus: fetchStatusMock, fetchRunbook: fetchRunbookMock }
})

function fixtureVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.9999,
    statusUrl: 'https://status.stripe.com/api/v2/status.json',
    fallbacks: ['Razorpay'],
    detectedVia: ['import:stripe'],
    detectedInFiles: ['src/pay.ts'],
    ...overrides,
  }
}

const graph: GraphData = {
  nodes: [
    { id: 'src/pay.ts', label: 'src/pay.ts', type: 'file' },
    { id: 'src/index.ts', label: 'src/index.ts', type: 'file' },
  ],
  edges: [{ from: 'src/index.ts', to: 'src/pay.ts' }],
}

function fixtureAnalyzed(overrides: Partial<AnalyzedRepo> = {}): AnalyzedRepo {
  const vendor = fixtureVendor()
  return {
    graph,
    vendors: [vendor],
    vendorGraph: {
      rootId: '__app__',
      vendors: [{ ...vendor, directFiles: ['src/pay.ts'], affectedFiles: ['src/pay.ts', 'src/index.ts'] }],
    },
    concentration: {
      vendorCount: 1,
      substrateCount: 1,
      bySubstrate: [{ substrate: 'aws', vendorKeys: ['stripe'], vendorNames: ['Stripe'], share: 1 }],
      mostConcentrated: { substrate: 'aws', vendorKeys: ['stripe'], vendorNames: ['Stripe'], share: 1 },
    },
    criticality: { entrypoints: ['src/index.ts'], articulationPoints: [], byNode: [] },
    meta: {
      owner: 'octocat',
      repo: 'hello',
      branch: 'main',
      truncated: false,
      filesScanned: 2,
      importResolution: { total: 2, resolved: 2 },
    },
    repoUrl: 'https://github.com/octocat/hello',
    snapshot: null,
    unclassified: null,
    ...overrides,
  }
}

beforeEach(() => {
  simulateMock.mockReset()
  fetchStatusMock.mockReset()
  fetchRunbookMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('Workspace — vendor graph and selection', () => {
  it('shows the vendor graph by default and summary stat tiles', () => {
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)
    expect(screen.getByTestId('node-stripe')).toBeInTheDocument()
    expect(screen.getByTestId('node-__app__')).toBeInTheDocument()
    expect(screen.getAllByText('Vendors').length).toBeGreaterThan(0)
  })

  it('selecting a vendor shows its detail panel', async () => {
    const user = userEvent.setup()
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByTestId('node-stripe'))

    expect(screen.getByRole('heading', { name: 'Stripe' })).toBeInTheDocument()
    expect(screen.getByText(/Affects/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view affected files/i })).toBeEnabled()
    expect(screen.getByTestId('node-stripe')).toHaveAttribute('data-color', '#e66767')
  })

  it('drilling into affected files switches to the file graph and highlights them', async () => {
    const user = userEvent.setup()
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByTestId('node-stripe'))
    await user.click(screen.getByRole('button', { name: /view affected files/i }))

    expect(screen.getByTestId('node-src/pay.ts')).toBeInTheDocument()
    expect(screen.getByTestId('node-src/index.ts')).toBeInTheDocument()
  })

  it('clicking a file node shows its blast radius in the side panel', async () => {
    const user = userEvent.setup()
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /file graph/i }))
    await user.click(screen.getByTestId('node-src/index.ts'))

    expect(screen.getByText('affected components')).toBeInTheDocument()
  })
})

describe('Workspace — simulation', () => {
  it('runs a scenario simulation and shows the failed vendor in the graph plus availability numbers', async () => {
    simulateMock.mockResolvedValue({
      scenario: {
        scenario: { id: 'aws-outage', label: 'AWS regional outage', downSubstrates: ['aws'] },
        affectedVendors: [fixtureVendor()],
        unaffectedVendors: [],
        affectedCount: 1,
        totalCount: 1,
        affectedShare: 1,
      },
      simulation: {
        naiveAvailability: 0.9999,
        independentSameMarginalsAvailability: 0.9995,
        correlatedAvailability: 0.9995,
        expectedDowntimeHoursPerYear: { naive: 0.9, independentSameMarginals: 4.4, correlated: 4.4 },
        expectedAnnualExposure: { naive: 0, independentSameMarginals: 0, correlated: 0 },
        assumptions: {
          costPerHourOfDowntime: 0,
          substrateOutageProbabilities: { aws: 0.0001 },
          vendorSlaOverrides: {},
        },
      },
      presetScenarios: [],
      headline: {
        vendors: 1,
        substrates: 1,
        unknownHostingVendorCount: 0,
        tailRisk: [{ k: 2, naive: 0, independentSameMarginals: 0, correlated: 0, multiplier: 1 }],
        hiddenUpstreamHoursPerYear: 3.5,
        concentrationEffectHoursPerYear: 0,
        worstSingleEvent: null,
        redundancyGroups: [],
        expectedLossPerYear: 0,
      },
    })

    const user = userEvent.setup()
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /^simulate$/i }))

    // The Assumptions panel prefills an illustrative, editable cost/hr and empty override maps —
    // every /simulate call carries them, so "estimated exposure" is never silently zero-by-default.
    await waitFor(() =>
      expect(simulateMock).toHaveBeenCalledWith({
        repoUrl: 'https://github.com/octocat/hello',
        scenarioId: 'aws-outage',
        costPerHourOfDowntime: 602,
        vendorSlaOverrides: {},
        substrateFailureProbabilities: {},
      }),
    )
    // "99.95%" appears twice: the hero stat strip and the AvailabilityPanel's own tile.
    expect((await screen.findAllByText('99.95%')).length).toBeGreaterThanOrEqual(2)
    expect(await screen.findByTestId('node-stripe')).toHaveAttribute('data-color', '#d03b3b')
  })

  it('shows a simulation error instead of a stuck loading state', async () => {
    simulateMock.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /^simulate$/i }))

    expect(await screen.findByText('Could not run the simulation.')).toBeInTheDocument()
  })
})

describe('Workspace — live status', () => {
  it('auto-fetches on load (non-blocking) and displays vendor status without fabricating a healthy state', async () => {
    fetchStatusMock.mockResolvedValue({
      vendorStatuses: [{ vendorKey: 'stripe', indicator: 'unknown', checkedAt: '2026-01-01', stale: true }],
      awsHealth: { source: 'unknown', indicator: 'unknown', checkedAt: '2026-01-01' },
    })
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    // No click needed — item 5's whole point is that this fires automatically on load.
    await waitFor(() => expect(fetchStatusMock).toHaveBeenCalledWith('https://github.com/octocat/hello'))
    const statusPanel = screen.getByText('Live status').closest('section')!
    expect(await within(statusPanel).findByText('Stripe')).toBeInTheDocument()
    expect(within(statusPanel).getAllByText('Unknown').length).toBeGreaterThanOrEqual(1)
  })

  it('shows per-vendor skeleton rows while the auto-fetch is in flight', () => {
    fetchStatusMock.mockReturnValue(new Promise(() => {})) // never resolves — asserts the loading state
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    const statusPanel = screen.getByText('Live status').closest('section')!
    expect(within(statusPanel).getByRole('list', { name: /loading vendor status/i })).toBeInTheDocument()
    expect(within(statusPanel).getByText('Stripe')).toBeInTheDocument()
  })

  it('shows a status error instead of a stuck loading state', async () => {
    fetchStatusMock.mockRejectedValue(new Error('boom'))
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    const statusPanel = screen.getByText('Live status').closest('section')!
    expect(await within(statusPanel).findByText('Could not fetch live status.')).toBeInTheDocument()
  })

  it('re-fetches when Refresh is clicked after the initial auto-fetch resolves', async () => {
    fetchStatusMock.mockResolvedValue({ vendorStatuses: [], awsHealth: null })
    const user = userEvent.setup()
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await waitFor(() => expect(fetchStatusMock).toHaveBeenCalledTimes(1))
    const statusPanel = screen.getByText('Live status').closest('section')!
    await user.click(within(statusPanel).getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(fetchStatusMock).toHaveBeenCalledTimes(2))
  })
})

describe('Workspace — runbook', () => {
  it('generates a runbook for the selected vendor and shows the generatedBy badge', async () => {
    fetchRunbookMock.mockResolvedValue({
      summary: 'Stripe failing affects 1 file.',
      riskLevel: 'Low',
      recommendedActions: ['Check status page'],
      suggestedFallbacks: ['Razorpay'],
      generatedBy: 'deterministic',
    })
    const user = userEvent.setup()
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByTestId('node-stripe'))
    const runbookPanel = screen.getByText('Runbook').closest('section')!
    await user.click(within(runbookPanel).getByRole('button', { name: /generate/i }))

    await waitFor(() => expect(fetchRunbookMock).toHaveBeenCalledWith('https://github.com/octocat/hello', 'stripe', undefined))
    expect(await within(runbookPanel).findByText('Stripe failing affects 1 file.')).toBeInTheDocument()
    expect(within(runbookPanel).getByText('Deterministic')).toBeInTheDocument()
  })
})

describe('Workspace — data-quality badge', () => {
  it('shows the import-resolution percentage on the File graph tab', async () => {
    const user = userEvent.setup()
    render(
      <Workspace
        analyzed={fixtureAnalyzed({
          meta: {
            owner: 'octocat',
            repo: 'hello',
            branch: 'main',
            truncated: false,
            filesScanned: 2,
            importResolution: { total: 10, resolved: 8 },
          },
        })}
        prResult={null}
        onReset={vi.fn()}
        onClearPr={vi.fn()}
        onLiveAnalysisComplete={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /file graph/i }))
    expect(screen.getByText('80% of internal imports resolved')).toBeInTheDocument()
  })

  it('shows no badge when there is no import-resolution data (manual/PR-mode graph)', async () => {
    const user = userEvent.setup()
    render(
      <Workspace
        analyzed={fixtureAnalyzed({ repoUrl: null, meta: null, vendors: [], vendorGraph: { rootId: '__app__', vendors: [] } })}
        prResult={null}
        onReset={vi.fn()}
        onClearPr={vi.fn()}
        onLiveAnalysisComplete={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /file graph/i }))
    expect(screen.queryByText(/% of internal imports resolved/)).not.toBeInTheDocument()
  })
})

describe('Workspace — truncated scan banner', () => {
  it('shows a visible banner when the scan was truncated', () => {
    render(
      <Workspace
        analyzed={fixtureAnalyzed({
          meta: {
            owner: 'octocat',
            repo: 'hello',
            branch: 'main',
            truncated: true,
            filesScanned: 8,
            importResolution: { total: 10, resolved: 8 },
          },
        })}
        prResult={null}
        onReset={vi.fn()}
        onClearPr={vi.fn()}
        onLiveAnalysisComplete={vi.fn()}
      />,
    )
    expect(screen.getByText(/scan stopped early/i)).toBeInTheDocument()
    expect(screen.getByText(/8 file\(s\)/)).toBeInTheDocument()
  })

  it('shows no banner when the scan completed fully', () => {
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)
    expect(screen.queryByText(/scan stopped early/i)).not.toBeInTheDocument()
  })
})

describe('Workspace — manual/PR data (no vendor data)', () => {
  it('does not show vendor-only panels when repoUrl is null', () => {
    render(
      <Workspace
        analyzed={fixtureAnalyzed({ repoUrl: null, meta: null, vendors: [], vendorGraph: { rootId: '__app__', vendors: [] } })}
        prResult={null}
        onReset={vi.fn()}
        onClearPr={vi.fn()}
        onLiveAnalysisComplete={vi.fn()}
      />,
    )
    expect(screen.queryByText('Live status')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^simulate$/i })).not.toBeInTheDocument()
  })

  it('renders PR summary panel and file graph highlights in PR mode', () => {
    const prResult: AnalyzePrResponse = {
      owner: 'octocat',
      repo: 'hello',
      branch: 'main',
      prNumber: 42,
      graph,
      changedNodes: [{ id: 'src/pay.ts', label: 'src/pay.ts', type: 'file', blastRadiusCount: 1 }],
      unmatchedFiles: [],
      combinedBlastRadius: { downstream: ['src/index.ts'], upstream: [], totalCount: 1 },
      highestRisk: null,
    }
    render(
      <Workspace
        analyzed={fixtureAnalyzed({ repoUrl: null, meta: null, vendors: [], vendorGraph: { rootId: '__app__', vendors: [] } })}
        prResult={prResult}
        onReset={vi.fn()}
        onClearPr={vi.fn()}
        onLiveAnalysisComplete={vi.fn()}
      />,
    )
    expect(screen.getByText('octocat/hello #42')).toBeInTheDocument()
  })
})

describe('Workspace — WHY drawer', () => {
  function twoVendorAnalyzed(): AnalyzedRepo {
    const stripe = fixtureVendor()
    const paypal = fixtureVendor({ key: 'paypal', vendor: 'PayPal', substrate: ['aws'] })
    return fixtureAnalyzed({
      vendors: [stripe, paypal],
      vendorGraph: {
        rootId: '__app__',
        vendors: [
          { ...stripe, directFiles: ['src/pay.ts'], affectedFiles: ['src/pay.ts', 'src/index.ts'] },
          { ...paypal, directFiles: ['src/pay.ts'], affectedFiles: ['src/pay.ts'] },
        ],
      },
      concentration: {
        vendorCount: 2,
        substrateCount: 1,
        bySubstrate: [{ substrate: 'aws', vendorKeys: ['stripe', 'paypal'], vendorNames: ['Stripe', 'PayPal'], share: 1 }],
        mostConcentrated: { substrate: 'aws', vendorKeys: ['stripe', 'paypal'], vendorNames: ['Stripe', 'PayPal'], share: 1 },
      },
      criticality: {
        entrypoints: ['src/index.ts'],
        articulationPoints: ['src/pay.ts'],
        byNode: [
          {
            nodeId: 'src/pay.ts',
            isArticulationPoint: true,
            affectedEntrypoints: ['src/index.ts'],
            orphanedNodes: [],
            entrypointCount: 1,
            reachabilityLossRatio: 1,
          },
        ],
      },
    })
  }

  it('opens with vendors→substrates content, is keyboard accessible, and closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Workspace analyzed={twoVendorAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /why this vendor\/substrate count/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/2 vendor\(s\) detected/)).toBeInTheDocument()
    expect(within(dialog).getByText(/substrates =/)).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens with expected-loss content from a separate trigger', async () => {
    const user = userEvent.setup()
    render(<Workspace analyzed={twoVendorAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /why this expected annual loss/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('expectedLossPerYear = correlatedDowntimeHoursPerYear × costPerHourOfDowntime')).toBeInTheDocument()
  })

  it('opens with a risk-register row\'s content, naming the vendor and its risk level', async () => {
    const user = userEvent.setup()
    render(<Workspace analyzed={twoVendorAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /risk register/i }))
    await user.click(screen.getAllByRole('button', { name: /^why is stripe/i })[0])

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Stripe is/)).toBeInTheDocument()
  })

  it('opens with a criticality item\'s content, distinguishing the articulation-point claim', async () => {
    const user = userEvent.setup()
    render(<Workspace analyzed={twoVendorAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /why does src\/pay\.ts matter/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/structural bottleneck/)).toBeInTheDocument()
  })
})

describe('Workspace — scenario builder', () => {
  it('opens, toggling a substrate chip updates the live summary, and Run feeds the cascade + closes the drawer', async () => {
    localStorage.clear()
    const user = userEvent.setup()
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /scenario builder/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /^run$/i })).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: 'aws' }))
    expect(within(dialog).getByText(/1 selected/)).toBeInTheDocument()
    expect(within(dialog).getByText(/1 vendor\(s\) down/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^run$/i })).toBeEnabled()

    await user.click(within(dialog).getByRole('button', { name: /^run$/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('node-stripe')).toHaveAttribute('data-color', '#d03b3b')
  })

  it('Clear resets the selection back to nothing selected', async () => {
    localStorage.clear()
    const user = userEvent.setup()
    render(<Workspace analyzed={fixtureAnalyzed()} prResult={null} onReset={vi.fn()} onClearPr={vi.fn()} onLiveAnalysisComplete={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /scenario builder/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'aws' }))
    expect(within(dialog).getByRole('button', { name: /^run$/i })).toBeEnabled()

    await user.click(within(dialog).getByRole('button', { name: /^clear$/i }))
    expect(within(dialog).getByRole('button', { name: /^run$/i })).toBeDisabled()
  })
})
