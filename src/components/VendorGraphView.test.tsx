// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { forwardRef, useImperativeHandle } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SimulateResponse } from '../lib/api'
import type { Vendor, VendorGraph, VendorWithBlastRadius } from '../lib/types'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)
vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))

const d3ForceMock = vi.fn()
const pauseAnimationMock = vi.fn()
const resumeAnimationMock = vi.fn()

function fakeCanvasContext() {
  let fillStyle = ''
  const ctx = {
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
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
  return ctx as unknown as CanvasRenderingContext2D
}

vi.mock('react-force-graph-2d', () => ({
  default: forwardRef(function MockForceGraph2D(props: Record<string, unknown>, ref) {
    useImperativeHandle(ref, () => ({
      zoomToFit: vi.fn(),
      zoom: vi.fn(),
      d3Force: d3ForceMock,
      d3ReheatSimulation: vi.fn(),
      pauseAnimation: pauseAnimationMock,
      resumeAnimation: resumeAnimationMock,
    }))
    const graphData = props.graphData as { nodes: Array<Record<string, unknown>> }
    const nodeCanvasObject = props.nodeCanvasObject as ((n: unknown, ctx: CanvasRenderingContext2D, scale: number) => void) | undefined
    const nodeLabel = props.nodeLabel as ((n: unknown) => string) | undefined
    const onNodeClick = props.onNodeClick as ((n: unknown) => void) | undefined
    const onEngineStop = props.onEngineStop as (() => void) | undefined

    function labelFor(n: Record<string, unknown>): string {
      if (typeof n.label === 'string') return n.label
      const vendor = n.vendor as { vendor?: string } | undefined
      return vendor?.vendor ?? String(n.id)
    }

    return (
      <div data-testid="mock-graph">
        <button data-testid="trigger-engine-stop" onClick={() => onEngineStop?.()}>
          trigger engine stop
        </button>
        {graphData.nodes.map((n) => {
          nodeCanvasObject?.(n, fakeCanvasContext(), 1)
          return (
            <button key={String(n.id)} data-testid={`node-${n.id}`} title={nodeLabel?.(n)} onClick={() => onNodeClick?.(n)}>
              {labelFor(n)}
            </button>
          )
        })}
      </div>
    )
  }),
}))

// eslint-disable-next-line import/first
import VendorGraphView from './VendorGraphView'

beforeEach(() => {
  d3ForceMock.mockClear()
  pauseAnimationMock.mockClear()
  resumeAnimationMock.mockClear()
})
afterEach(() => cleanup())

function fixtureVendor(overrides: Partial<VendorWithBlastRadius> = {}): VendorWithBlastRadius {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.9999,
    detectedVia: ['import:stripe'],
    detectedInFiles: ['src/pay.ts'],
    directFiles: ['src/pay.ts'],
    affectedFiles: ['src/pay.ts', 'src/index.ts'],
    ...overrides,
  }
}

function fixtureVendorGraph(vendors: VendorWithBlastRadius[]): VendorGraph {
  return { rootId: '__app__', vendors }
}

const noopProps = {
  repoLabel: 'octocat/hello',
  entrypoints: ['src/index.ts'],
  selectedVendorKey: null,
  onSelectVendor: vi.fn(),
  simulation: null,
  currency: 'USD' as const,
  costPerHour: 500,
  singleVendorTarget: null,
}

describe('VendorGraphView', () => {
  it('shows an empty state when there are no vendors', () => {
    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([])} />)
    expect(screen.getByText('No third-party vendors detected.')).toBeInTheDocument()
  })

  it('renders the hub node and every vendor node', () => {
    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([fixtureVendor()])} />)
    expect(screen.getByTestId('node-__app__')).toBeInTheDocument()
    expect(screen.getByTestId('node-stripe')).toBeInTheDocument()
  })

  it('tooltip includes category, substrate, files/entrypoints affected, and detection provenance', () => {
    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([fixtureVendor()])} />)
    const title = screen.getByTestId('node-stripe').getAttribute('title')!
    expect(title).toContain('Stripe')
    expect(title).toContain('payments')
    expect(title).toContain('aws')
    expect(title).toContain('2 file(s) affected')
    expect(title).toContain('1 entrypoint(s) affected')
    expect(title).toContain('import:stripe')
  })

  it('defaults "Group by substrate" to on, registering the cluster force', () => {
    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([fixtureVendor()])} />)
    expect(screen.getByLabelText(/group by substrate/i)).toBeChecked()
    expect(d3ForceMock).toHaveBeenCalledWith('cluster', expect.any(Function))
  })

  it('removes the cluster force when the toggle is switched off', async () => {
    const user = userEvent.setup()
    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([fixtureVendor()])} />)
    await user.click(screen.getByLabelText(/group by substrate/i))
    expect(d3ForceMock).toHaveBeenCalledWith('cluster', null)
  })

  it('shows an inline "no impact" message when the scenario affects no vendors', () => {
    const simulation = {
      scenario: {
        scenario: { id: 'gcp-outage', label: 'GCP regional outage', downSubstrates: ['gcp'] },
        affectedVendors: [],
        unaffectedVendors: [fixtureVendor()],
        affectedCount: 0,
        totalCount: 1,
        affectedShare: 0,
      },
      simulation: {} as never,
      presetScenarios: [],
      headline: { expectedLossPerYear: 0 } as never,
      whatIf: null,
      recommendedMoves: [],
    } satisfies SimulateResponse

    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([fixtureVendor()])} simulation={simulation} />)
    expect(screen.getByText(/no vendors on gcp — no impact/i)).toBeInTheDocument()
  })

  it('shows the outage banner, counters, and a Replay button when vendors are affected', () => {
    const stripe = fixtureVendor()
    const simulation = {
      scenario: {
        scenario: { id: 'aws-outage', label: 'AWS regional outage', downSubstrates: ['aws'] },
        affectedVendors: [stripe as Vendor],
        unaffectedVendors: [],
        affectedCount: 1,
        totalCount: 1,
        affectedShare: 1,
      },
      simulation: {} as never,
      presetScenarios: [],
      headline: { expectedLossPerYear: 12000 } as never,
      whatIf: null,
      recommendedMoves: [],
    } satisfies SimulateResponse

    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([stripe])} simulation={simulation} />)
    expect(screen.getByText(/AWS regional outage — outage/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /replay/i })).toBeInTheDocument()
  })

  it('runs a per-vendor cascade (loss PER HOUR, not annual) when singleVendorTarget is set', () => {
    const stripe = fixtureVendor()
    render(
      <VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([stripe])} singleVendorTarget="stripe" costPerHour={250} />,
    )
    expect(screen.getByText(/Stripe — outage/i)).toBeInTheDocument()
    expect(screen.getByText(/Loss per hour at your assumptions/i)).toBeInTheDocument()
  })

  it('snapshot mode shows an "as of" badge and never the word "live"', () => {
    const stripe = fixtureVendor()
    render(
      <VendorGraphView
        {...noopProps}
        vendorGraph={fixtureVendorGraph([stripe])}
        vendorStatuses={[{ vendorKey: 'stripe', indicator: 'outage', checkedAt: '2026-01-01T12:00:00Z', stale: false }]}
        isSnapshot
      />,
    )
    expect(screen.getByText(/\(snapshot\)/i)).toBeInTheDocument()
    expect(screen.getByText(/as of/i)).toBeInTheDocument()
    expect(screen.getByTestId('vendor-graph-view').textContent?.toLowerCase()).not.toContain('live')
  })
})

// force-graph's own render loop reschedules itself via requestAnimationFrame forever, with no
// built-in idle state — see VendorGraphView.tsx's resumeAndScheduleIdlePause for why and what it
// does about it. These tests exercise that debounce logic against the mocked pauseAnimation/
// resumeAnimation calls above, not the real force-graph library.
describe('VendorGraphView idle-pause', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not pause immediately once the physics engine settles — leaves room for the zoom-to-fit tween', () => {
    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([fixtureVendor()])} />)
    fireEvent.click(screen.getByTestId('trigger-engine-stop'))
    vi.advanceTimersByTime(300)
    expect(pauseAnimationMock).not.toHaveBeenCalled()
  })

  it('pauses after IDLE_PAUSE_MS of no further activity following engine-stop', () => {
    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([fixtureVendor()])} />)
    fireEvent.click(screen.getByTestId('trigger-engine-stop'))
    vi.advanceTimersByTime(650)
    expect(pauseAnimationMock).toHaveBeenCalled()
  })

  it('resumes when the pointer enters the canvas', () => {
    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([fixtureVendor()])} />)
    resumeAnimationMock.mockClear() // drop whatever mount-time resume already fired
    fireEvent.pointerEnter(screen.getByTestId('vendor-graph-view'))
    expect(resumeAnimationMock).toHaveBeenCalled()
  })

  it('resumes when "Group by substrate" is toggled — a reheat needs the loop alive to tick', () => {
    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([fixtureVendor()])} />)
    resumeAnimationMock.mockClear()
    fireEvent.click(screen.getByLabelText(/group by substrate/i))
    expect(resumeAnimationMock).toHaveBeenCalled()
  })

  it('resumes on Replay', () => {
    const stripe = fixtureVendor()
    const simulation = {
      scenario: {
        scenario: { id: 'aws-outage', label: 'AWS regional outage', downSubstrates: ['aws'] },
        affectedVendors: [stripe as Vendor],
        unaffectedVendors: [],
        affectedCount: 1,
        totalCount: 1,
        affectedShare: 1,
      },
      simulation: {} as never,
      presetScenarios: [],
      headline: { expectedLossPerYear: 12000 } as never,
      whatIf: null,
      recommendedMoves: [],
    } satisfies SimulateResponse

    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([stripe])} simulation={simulation} />)
    resumeAnimationMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /replay/i }))
    expect(resumeAnimationMock).toHaveBeenCalled()
  })

  it('pauses when the tab is hidden and resumes (re-scheduling the idle check) when it becomes visible again', () => {
    render(<VendorGraphView {...noopProps} vendorGraph={fixtureVendorGraph([fixtureVendor()])} />)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(pauseAnimationMock).toHaveBeenCalled()

    resumeAnimationMock.mockClear()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(resumeAnimationMock).toHaveBeenCalled()
  })
})
