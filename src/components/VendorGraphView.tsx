import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { useElementSize } from '../hooks/useElementSize'
import { colorForSubstrate, DIMMED_COLOR, FAILED_COLOR, SELECTED_COLOR, SUBSTRATE_LEGEND } from '../lib/colors'
import { VENDOR_GRAPH_ROOT_ID } from '../lib/graph'
import { prefersReducedMotion } from '../lib/motion'
import { escapeHtml } from '../lib/sanitize'
import type { VendorGraph } from '../lib/types'

const ROOT_ID = VENDOR_GRAPH_ROOT_ID
const ROOT_COLOR = '#f4f5f7'
const ROOT_FAILED_COLOR = '#f0b429'

interface VendorGraphViewProps {
  vendorGraph: VendorGraph
  selectedVendorKey: string | null
  onSelectVendor: (key: string | null) => void
  /** Vendor keys whose blast radius touches a file-graph articulation point — a structural warning flag. */
  criticalVendorKeys?: Set<string>
  /** Vendor keys affected by the current failure simulation, if any. Drives the propagation animation. */
  failedVendorKeys?: Set<string>
}

interface VendorNodeDatum {
  id: string
  label: string
  substrate: string
  tier: string
  sla: number
  affectedCount: number
  isRoot: boolean
}

function VendorGraphView({
  vendorGraph,
  selectedVendorKey,
  onSelectVendor,
  criticalVendorKeys,
  failedVendorKeys,
}: VendorGraphViewProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const graphRef = useRef<{ zoomToFit: (ms?: number, padding?: number) => void; zoom: (k?: number) => number } | null>(
    null,
  )
  const [revealedFailed, setRevealedFailed] = useState<Set<string>>(new Set())

  const forceGraphData = useMemo(() => {
    const nodes: VendorNodeDatum[] = [
      { id: ROOT_ID, label: 'Your application', substrate: 'self', tier: 'app', sla: 1, affectedCount: 0, isRoot: true },
      ...vendorGraph.vendors.map((v) => ({
        id: v.key,
        label: v.vendor,
        substrate: v.substrate[0] ?? 'other',
        tier: v.tier,
        sla: v.sla,
        affectedCount: v.affectedFiles.length,
        isRoot: false,
      })),
    ]
    const links = vendorGraph.vendors.map((v) => ({ source: ROOT_ID, target: v.key }))
    return { nodes, links }
  }, [vendorGraph])

  useEffect(() => {
    // Every setRevealedFailed call is deferred into a timer (even the "reset" ones, at 0ms) so
    // none of them fire synchronously within the effect body — only from the scheduled callback.
    const timers: ReturnType<typeof setTimeout>[] = []

    if (!failedVendorKeys || failedVendorKeys.size === 0) {
      timers.push(setTimeout(() => setRevealedFailed(new Set()), 0))
    } else if (prefersReducedMotion()) {
      timers.push(setTimeout(() => setRevealedFailed(new Set(failedVendorKeys)), 0))
    } else {
      timers.push(setTimeout(() => setRevealedFailed(new Set()), 0))
      ;[...failedVendorKeys].forEach((key, i) => {
        timers.push(
          setTimeout(
            () => setRevealedFailed((prev) => new Set(prev).add(key)),
            (i + 1) * 150,
          ),
        )
      })
    }

    return () => timers.forEach(clearTimeout)
  }, [failedVendorKeys])

  function getNodeColor(node: VendorNodeDatum): string {
    if (failedVendorKeys && failedVendorKeys.size > 0) {
      if (node.isRoot) return revealedFailed.size > 0 ? ROOT_FAILED_COLOR : ROOT_COLOR
      return revealedFailed.has(node.id) ? FAILED_COLOR : DIMMED_COLOR
    }
    if (node.isRoot) return ROOT_COLOR
    if (selectedVendorKey) return node.id === selectedVendorKey ? SELECTED_COLOR : DIMMED_COLOR
    return colorForSubstrate(node.substrate)
  }

  function handleResetView() {
    graphRef.current?.zoomToFit(400, 60)
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
        graphData={forceGraphData}
        width={size.width}
        height={size.height}
        nodeId="id"
        nodeVal={(node) => 3 + Math.min(8, Math.sqrt((node as VendorNodeDatum).affectedCount))}
        nodeLabel={(node) => {
          const n = node as VendorNodeDatum
          if (n.isRoot) return 'Your application'
          // Vendor fields are curated (vendorMap.ts), not repo-controlled — escaped anyway as
          // defense in depth, since this library renders nodeLabel's return value as raw innerHTML.
          return `<div style="font:12px system-ui;padding:2px 4px"><strong>${escapeHtml(n.label)}</strong><br/>${escapeHtml(n.tier)} · ${escapeHtml(n.substrate)}<br/>SLA ${(n.sla * 100).toFixed(2)}%<br/>${n.affectedCount} file(s) affected</div>`
        }}
        nodeColor={(node) => getNodeColor(node as VendorNodeDatum)}
        nodeCanvasObjectMode={(node) => (criticalVendorKeys?.has((node as VendorNodeDatum).id) ? 'after' : undefined)}
        nodeCanvasObject={(node, ctx) => {
          const n = node as VendorNodeDatum & { x: number; y: number }
          const radius = 3 + Math.min(8, Math.sqrt(n.affectedCount)) + 2.5
          ctx.beginPath()
          ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI)
          ctx.strokeStyle = '#f0b429'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }}
        linkColor={() => 'rgba(166,172,187,0.35)'}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        onNodeClick={(node) => {
          const n = node as VendorNodeDatum
          onSelectVendor(n.isRoot ? null : n.id === selectedVendorKey ? null : n.id)
        }}
        onBackgroundClick={() => onSelectVendor(null)}
        cooldownTicks={80}
        onEngineStop={() => graphRef.current?.zoomToFit(400, 60)}
      />

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
      </div>

      <div className="absolute top-3 right-3 flex gap-1">
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
