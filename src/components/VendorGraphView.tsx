import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import type { SimulateResponse } from '../lib/api'
import { cascadeReducer } from '../lib/cascadeStateMachine'
import { colorForSubstrate, DIMMED_COLOR, FAILED_COLOR, SELECTED_COLOR, STATUS_COLORS, SUBSTRATE_LEGEND } from '../lib/colors'
import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import { UNSHAREABLE_SUBSTRATE_TAGS } from '../engine/correlated'
import { VENDOR_GRAPH_ROOT_ID } from '../lib/graph'
import { useElementSize } from '../hooks/useElementSize'
import { prefersReducedMotion } from '../lib/motion'
import { escapeHtml } from '../lib/sanitize'
import { formatAsOf, STATUS_MARKER } from '../lib/statusMarker'
import { counterValueAt, isCascadeComplete, revealedVendorKeys } from '../lib/vendorGraphCascade'
import {
  computeClusterAnchors,
  createClusterForce,
  HUB_RADIUS,
  rankByWeight,
  shouldShowLabel,
  vendorNodeRadius,
} from '../lib/vendorGraphLayout'
import type { VendorGraph, VendorStatus, VendorWithBlastRadius } from '../lib/types'

const ROOT_ID = VENDOR_GRAPH_ROOT_ID
const ROOT_COLOR = '#f4f5f7'
const ROOT_FAILED_COLOR = STATUS_COLORS.outage
const ZOOM_LABEL_THRESHOLD = 2.2
const TOP_N_LABELS = 5
const CLUSTER_RADIUS = 220

interface HubNodeDatum {
  id: string
  kind: 'hub'
  label: string
  x?: number
  y?: number
}

interface VendorNodeDatum {
  id: string
  kind: 'vendor'
  vendor: VendorWithBlastRadius
  substrate: string | null // primary shareable substrate — null for self-hosted/unknown hosting
  weight: number
  entrypointsAffectedCount: number
  x?: number
  y?: number
}

type GraphNodeDatum = HubNodeDatum | VendorNodeDatum

interface VendorGraphViewProps {
  vendorGraph: VendorGraph
  repoLabel: string
  /** Entrypoint file paths (from criticality analysis) — used for tooltip + cascade counters. */
  entrypoints: string[]
  selectedVendorKey: string | null
  onSelectVendor: (key: string | null) => void
  /** Vendor keys whose blast radius touches a file-graph articulation point — a structural warning flag. */
  criticalVendorKeys?: Set<string>
  simulation: SimulateResponse | null
  currency: Currency
  costPerHour: number
  /** Live status per vendor, once fetched — drawn as an icon+color marker on each node, never color alone. */
  vendorStatuses?: VendorStatus[] | null
  /** Set when the checked-at timestamps are from a captured/replayed snapshot rather than this
   * session's own fetch — forces every status display to say "as of <time>", never look live. */
  isSnapshot?: boolean
  /** Vendor key to run a single-vendor cascade for (from VendorDetailPanel's "Simulate this
   * vendor's outage", or the status banner's "Show blast radius") — independent of `simulation`. */
  singleVendorTarget: string | null
}

function primaryShareableSubstrate(substrates: string[]): string | null {
  const real = substrates.find((s) => !UNSHAREABLE_SUBSTRATE_TAGS.has(s.toLowerCase()))
  return real ?? null
}

function VendorGraphView({
  vendorGraph,
  repoLabel,
  entrypoints,
  selectedVendorKey,
  onSelectVendor,
  criticalVendorKeys,
  simulation,
  currency,
  costPerHour,
  vendorStatuses,
  isSnapshot,
  singleVendorTarget,
}: VendorGraphViewProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const graphRef = useRef<ForceGraphMethods<GraphNodeDatum> | undefined>(undefined)
  const [groupBySubstrate, setGroupBySubstrate] = useState(true)
  const [revealedVendors, setRevealedVendors] = useState<Set<string>>(new Set())
  const [replayTick, setReplayTick] = useState(0)
  const [cascadeState, dispatchCascade] = useReducer(cascadeReducer, 'idle')
  const entrypointsCounterRef = useRef<HTMLSpanElement>(null)
  const lossCounterRef = useRef<HTMLSpanElement>(null)

  const statusByVendorKey = useMemo(() => new Map((vendorStatuses ?? []).map((s) => [s.vendorKey, s])), [vendorStatuses])
  const mostRecentStatusCheckedAt = useMemo(() => {
    if (!vendorStatuses || vendorStatuses.length === 0) return null
    return vendorStatuses.reduce((latest, s) => (s.checkedAt > latest ? s.checkedAt : latest), vendorStatuses[0].checkedAt)
  }, [vendorStatuses])

  const entrypointSet = useMemo(() => new Set(entrypoints), [entrypoints])

  const forceGraphData = useMemo(() => {
    const hub: HubNodeDatum = { id: ROOT_ID, kind: 'hub', label: repoLabel }
    const vendors: VendorNodeDatum[] = vendorGraph.vendors.map((v) => ({
      id: v.key,
      kind: 'vendor',
      vendor: v,
      substrate: primaryShareableSubstrate(v.substrate),
      weight: v.affectedFiles.length,
      entrypointsAffectedCount: v.affectedFiles.filter((f) => entrypointSet.has(f)).length,
    }))
    const nodes: GraphNodeDatum[] = [hub, ...vendors]
    const links = vendors.map((v) => ({ source: ROOT_ID, target: v.id }))
    return { nodes, links }
  }, [vendorGraph, repoLabel, entrypointSet])

  const vendorNodes = useMemo(
    () => forceGraphData.nodes.filter((n): n is VendorNodeDatum => n.kind === 'vendor'),
    [forceGraphData],
  )

  const weightRanks = useMemo(
    () => rankByWeight(new Map(vendorNodes.map((n) => [n.id, n.weight]))),
    [vendorNodes],
  )

  const substrates = useMemo(
    () => [...new Set(vendorNodes.map((n) => n.substrate).filter((s): s is string => s !== null))].sort(),
    [vendorNodes],
  )

  // Stable per-substrate node lists, referencing the SAME node objects react-force-graph mutates
  // in place each physics tick — reading .x/.y off these at draw time needs no extra allocation.
  const nodesBySubstrate = useMemo(() => {
    const map = new Map<string, VendorNodeDatum[]>()
    for (const s of substrates) map.set(s, [])
    for (const n of vendorNodes) {
      if (n.substrate) map.get(n.substrate)?.push(n)
    }
    return map
  }, [vendorNodes, substrates])

  const clusterAnchors = useMemo(() => computeClusterAnchors(substrates, CLUSTER_RADIUS), [substrates])

  // A plain function, not a d3-force import — registered via the graph's own d3Force() accessor.
  const clusterForce = useMemo(
    () =>
      createClusterForce((nodeId) => {
        const node = vendorNodes.find((n) => n.id === nodeId)
        return node?.substrate ?? null
      }, clusterAnchors),
    [vendorNodes, clusterAnchors],
  )

  useEffect(() => {
    const fg = graphRef.current
    if (!fg) return
    fg.d3Force('cluster', groupBySubstrate ? clusterForce : null)
    fg.d3ReheatSimulation()
  }, [groupBySubstrate, clusterForce])

  // Pause the physics/render loop entirely while the tab isn't visible — the #1 way to blow a
  // frame-rate budget you're not even being watched for.
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) graphRef.current?.pauseAnimation()
      else graphRef.current?.resumeAnimation()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const scenario = singleVendorTarget ? null : (simulation?.scenario ?? null)
  const vendorGraphByKey = useMemo(() => new Map(vendorGraph.vendors.map((v) => [v.key, v])), [vendorGraph])
  const affectedVendorKeys = useMemo(() => {
    if (singleVendorTarget) return vendorGraphByKey.has(singleVendorTarget) ? [singleVendorTarget] : []
    if (!scenario) return []
    return [...scenario.affectedVendors.map((v) => v.key)].sort((a, b) => {
      const wa = vendorGraphByKey.get(a)?.affectedFiles.length ?? 0
      const wb = vendorGraphByKey.get(b)?.affectedFiles.length ?? 0
      return wb - wa
    })
  }, [singleVendorTarget, scenario, vendorGraphByKey])
  const affectedEntrypointsCount = useMemo(() => {
    const affected = new Set<string>()
    for (const key of affectedVendorKeys) {
      for (const f of vendorGraphByKey.get(key)?.affectedFiles ?? []) {
        if (entrypointSet.has(f)) affected.add(f)
      }
    }
    return affected.size
  }, [affectedVendorKeys, vendorGraphByKey, entrypointSet])
  // Per-vendor cascades report loss PER HOUR (not probability-weighted — see VendorDetailPanel);
  // substrate-scenario cascades keep the existing annual-exposure framing from the headline.
  const cascadeLossTarget = singleVendorTarget ? costPerHour : (simulation?.headline.expectedLossPerYear ?? 0)
  const cascadeLossLabel = singleVendorTarget ? 'Loss per hour at your assumptions' : 'Annual exposure at your assumptions'
  const cascadeSourceLabel = singleVendorTarget
    ? `${vendorGraphByKey.get(singleVendorTarget)?.vendor ?? singleVendorTarget} — outage`
    : scenario
      ? `${scenario.scenario.label} — outage`
      : null

  // One requestAnimationFrame loop drives the whole cascade: which vendors have "lit up" (island
  // is implicit — it's drawn red as soon as any vendor is revealed, see nodeFillColor/drawHulls)
  // and the two counters. Vendor reveals go through React state (they gate canvas fill color, and
  // are coarse-grained — one change per ~130ms); counters mutate their ref's textContent directly
  // so a smooth ~60fps climb never triggers a React re-render.
  useEffect(() => {
    // Every setRevealedVendors call is scheduled from a timer (even the t=0 / reset ones) so none
    // fire synchronously within the effect body itself.
    const timers: ReturnType<typeof setTimeout>[] = []

    if (affectedVendorKeys.length === 0) {
      timers.push(setTimeout(() => setRevealedVendors(new Set()), 0))
      timers.push(setTimeout(() => dispatchCascade('reset'), 0))
      return () => timers.forEach(clearTimeout)
    }
    timers.push(setTimeout(() => dispatchCascade('start'), 0))
    const setCounters = (entrypointsValue: number, lossValue: number) => {
      if (entrypointsCounterRef.current) {
        entrypointsCounterRef.current.textContent = `${Math.round(entrypointsValue)}/${entrypoints.length}`
      }
      if (lossCounterRef.current) lossCounterRef.current.textContent = formatCurrency(lossValue, currency)
    }

    if (prefersReducedMotion()) {
      timers.push(setTimeout(() => setRevealedVendors(new Set(affectedVendorKeys)), 0))
      timers.push(setTimeout(() => setCounters(affectedEntrypointsCount, cascadeLossTarget), 0))
      timers.push(setTimeout(() => dispatchCascade('complete'), 0))
      return () => timers.forEach(clearTimeout)
    }

    timers.push(setTimeout(() => setRevealedVendors(new Set()), 0))
    setCounters(0, 0)
    let lastRevealedCount = 0
    const start = performance.now()
    let frame: number
    function tick(now: number) {
      const elapsed = now - start
      const revealed = revealedVendorKeys(affectedVendorKeys, elapsed)
      if (revealed.size !== lastRevealedCount) {
        lastRevealedCount = revealed.size
        setRevealedVendors(revealed)
      }
      setCounters(counterValueAt(elapsed, affectedEntrypointsCount), counterValueAt(elapsed, cascadeLossTarget))
      if (!isCascadeComplete(elapsed)) {
        frame = requestAnimationFrame(tick)
      } else {
        dispatchCascade('complete')
      }
    }
    frame = requestAnimationFrame(tick)
    return () => {
      timers.forEach(clearTimeout)
      cancelAnimationFrame(frame)
    }
  }, [affectedVendorKeys, affectedEntrypointsCount, cascadeLossTarget, entrypoints.length, currency, replayTick])

  const nodeFillColor = useCallback(
    (node: GraphNodeDatum): string => {
      if (node.kind === 'hub') return revealedVendors.size > 0 ? ROOT_FAILED_COLOR : ROOT_COLOR
      if (scenario && affectedVendorKeys.length > 0) {
        return revealedVendors.has(node.id) ? FAILED_COLOR : DIMMED_COLOR
      }
      if (selectedVendorKey) return node.id === selectedVendorKey ? SELECTED_COLOR : DIMMED_COLOR
      return node.substrate ? colorForSubstrate(node.substrate) : DIMMED_COLOR
    },
    [revealedVendors, scenario, affectedVendorKeys, selectedVendorKey],
  )

  const drawNode = useCallback(
    (node: GraphNodeDatum, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const radius = node.kind === 'hub' ? HUB_RADIUS : vendorNodeRadius(node.weight)

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = nodeFillColor(node)
      ctx.fill()

      if (node.kind === 'vendor' && node.substrate) {
        ctx.lineWidth = 1.5
        ctx.strokeStyle = colorForSubstrate(node.substrate)
        ctx.stroke()
      }

      if (node.kind === 'vendor' && criticalVendorKeys?.has(node.id)) {
        ctx.beginPath()
        ctx.arc(x, y, radius + 3.5, 0, 2 * Math.PI)
        ctx.strokeStyle = '#f0b429'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Live status marker: color AND an icon glyph, never color alone. Drawn at every zoom level
      // (unlike labels) since "is this vendor actually up" matters more than its name up close.
      if (node.kind === 'vendor') {
        const status = statusByVendorKey.get(node.id)
        if (status) {
          const marker = STATUS_MARKER[status.indicator]
          const badgeX = x + radius * 0.72
          const badgeY = y - radius * 0.72
          ctx.beginPath()
          ctx.arc(badgeX, badgeY, 5, 0, 2 * Math.PI)
          ctx.fillStyle = STATUS_COLORS[status.indicator]
          ctx.fill()
          ctx.lineWidth = 1
          ctx.strokeStyle = '#0a0b0e'
          ctx.stroke()
          ctx.fillStyle = '#0a0b0e'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.font = '600 7px system-ui, sans-serif'
          ctx.fillText(marker.icon, badgeX, badgeY + 0.5)
        }
      }

      const rank = node.kind === 'vendor' ? (weightRanks.get(node.id) ?? Infinity) : -1
      const showLabel = node.kind === 'hub' || shouldShowLabel(rank, globalScale, ZOOM_LABEL_THRESHOLD, TOP_N_LABELS)
      if (!showLabel) return

      const fontSize = Math.max(3, 11 / globalScale)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#e7e9ee'
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`
      ctx.fillText(node.kind === 'hub' ? node.label : node.vendor.vendor, x, y + radius + 2)

      if (node.kind === 'vendor') {
        ctx.fillStyle = '#a6acbb'
        ctx.font = `${fontSize * 0.85}px system-ui, sans-serif`
        ctx.fillText(node.vendor.tier, x, y + radius + 2 + fontSize + 1)
      }
    },
    [criticalVendorKeys, weightRanks, nodeFillColor, statusByVendorKey],
  )

  const drawHulls = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!groupBySubstrate) return
      for (const [substrate, nodes] of nodesBySubstrate) {
        // Allocation-free centroid + max-radius pass — this runs every animation frame, so no
        // intermediate arrays/objects are built here (see computeHullCircle for the tested,
        // array-based equivalent used by unit tests off the hot path).
        let sumX = 0
        let sumY = 0
        let count = 0
        for (const n of nodes) {
          if (n.x === undefined || n.y === undefined) continue
          sumX += n.x
          sumY += n.y
          count++
        }
        if (count === 0) continue
        const cx = sumX / count
        const cy = sumY / count
        let maxDist = 0
        for (const n of nodes) {
          if (n.x === undefined || n.y === undefined) continue
          const d = Math.hypot(n.x - cx, n.y - cy)
          if (d > maxDist) maxDist = d
        }
        const radius = maxDist + 26
        const isFailedIsland = scenario?.scenario.downSubstrates.includes(substrate) && affectedVendorKeys.length > 0

        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
        ctx.fillStyle = isFailedIsland ? 'rgba(208,59,59,0.12)' : `${colorForSubstrate(substrate)}1a`
        ctx.fill()
        ctx.strokeStyle = isFailedIsland ? 'rgba(208,59,59,0.5)' : `${colorForSubstrate(substrate)}55`
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = isFailedIsland ? STATUS_COLORS.outage : '#a6acbb'
        ctx.font = '600 12px system-ui, sans-serif'
        const label = `${substrate.toUpperCase()} · ${nodes.length} vendor${nodes.length === 1 ? '' : 's'}${isFailedIsland ? ' — outage' : ''}`
        ctx.fillText(label, cx - radius + 8, cy - radius + 16)
      }
    },
    [groupBySubstrate, nodesBySubstrate, scenario, affectedVendorKeys],
  )

  function handleResetView() {
    graphRef.current?.zoomToFit(400, 60)
  }

  function handleReplay() {
    setReplayTick((t) => t + 1)
  }

  if (vendorGraph.vendors.length === 0) {
    return (
      <div ref={containerRef} className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-[var(--text-secondary)]">No third-party vendors detected.</p>
        <p className="max-w-sm text-xs text-[var(--text-muted)]">
          This repo's imports, env vars, manifests, and IaC files didn't match anything in the curated vendor
          knowledge base — or this graph was loaded from manual JSON, which carries no vendor data.
        </p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative h-full w-full" data-testid="vendor-graph-view">
      <ForceGraph2D
        ref={graphRef as never}
        graphData={forceGraphData as never}
        width={size.width}
        height={size.height}
        nodeId="id"
        nodeLabel={(node) => {
          const n = node as GraphNodeDatum
          if (n.kind === 'hub') return `<div style="font:12px system-ui;padding:2px 4px"><strong>${escapeHtml(n.label)}</strong></div>`
          const v = n.vendor
          const detectedVia = v.detectedVia.length > 0 ? v.detectedVia.map(escapeHtml).join(', ') : 'unknown'
          return `<div style="font:12px system-ui;padding:4px 6px;max-width:220px">
            <strong>${escapeHtml(v.vendor)}</strong><br/>
            ${escapeHtml(v.tier)} · ${escapeHtml(n.substrate ?? 'self-hosted/unknown')}<br/>
            ${v.affectedFiles.length} file(s) affected · ${n.entrypointsAffectedCount} entrypoint(s) affected<br/>
            Detected via: ${detectedVia}
          </div>`
        }}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => 'replace'}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as GraphNodeDatum
          const radius = n.kind === 'hub' ? HUB_RADIUS : vendorNodeRadius(n.weight)
          ctx.beginPath()
          ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI)
          ctx.fillStyle = color
          ctx.fill()
        }}
        linkColor={() => 'rgba(166,172,187,0.35)'}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        onRenderFramePre={drawHulls}
        onNodeClick={(node) => {
          const n = node as GraphNodeDatum
          if (n.kind === 'hub') return onSelectVendor(null)
          onSelectVendor(n.id === selectedVendorKey ? null : n.id)
        }}
        onBackgroundClick={() => onSelectVendor(null)}
        cooldownTicks={80}
        onEngineStop={() => graphRef.current?.zoomToFit(400, 60)}
      />

      {(scenario || singleVendorTarget) && (
        <div className="pointer-events-none absolute top-3 left-3 max-w-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/90 p-3 text-xs">
          {affectedVendorKeys.length === 0 && scenario ? (
            <p className="flex items-center gap-1.5 font-medium text-amber-300">
              <span aria-hidden="true">⚠</span>
              No vendors on {scenario.scenario.downSubstrates.join(', ')} — no impact.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 font-medium" style={{ color: STATUS_COLORS.outage }}>
                <span aria-hidden="true">●</span>
                {cascadeSourceLabel}
              </p>
              <p className="text-[var(--text-secondary)]">
                Entrypoints down: <span ref={entrypointsCounterRef} className="tabular-nums text-[var(--text-primary)]">0/{entrypoints.length}</span>
              </p>
              <p className="text-[var(--text-secondary)]">
                {cascadeLossLabel}:{' '}
                <span ref={lossCounterRef} className="tabular-nums text-[var(--text-primary)]">
                  {formatCurrency(0, currency)}
                </span>
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={handleReplay}
            disabled={cascadeState === 'propagating'}
            className="pointer-events-auto mt-2 rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
          >
            Replay
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs text-[var(--text-secondary)]">
        {SUBSTRATE_LEGEND.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
        {criticalVendorKeys && criticalVendorKeys.size > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-[#f0b429]" aria-hidden="true" />
            Touches a structurally critical file
          </span>
        )}
        {mostRecentStatusCheckedAt && (
          <span className="ml-auto">
            Status {formatAsOf(mostRecentStatusCheckedAt)}
            {isSnapshot ? ' (snapshot)' : ''}
          </span>
        )}
      </div>

      <div className="absolute top-3 right-3 flex gap-1">
        <label className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 px-2 py-1 text-xs font-medium text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={groupBySubstrate}
            onChange={(e) => setGroupBySubstrate(e.target.checked)}
            className="h-3 w-3"
          />
          Group by substrate
        </label>
        <button
          type="button"
          onClick={handleResetView}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          Reset view
        </button>
      </div>
    </div>
  )
}

export default VendorGraphView
