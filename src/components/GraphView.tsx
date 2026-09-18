import { useMemo, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { useElementSize } from '../hooks/useElementSize'
import type { BlastRadius } from '../lib/graph'
import {
  colorForType,
  DIMMED_COLOR,
  DOWNSTREAM_COLOR,
  SELECTED_COLOR,
  UPSTREAM_COLOR,
} from '../lib/colors'
import { escapeHtml } from '../lib/sanitize'
import type { GraphData } from '../lib/types'

interface GraphViewProps {
  graphData: GraphData
  selectedNodeId: string | null
  blastRadius: BlastRadius | null
  onNodeClick: (nodeId: string) => void
  /** PR mode (optional): multiple nodes highlighted at once, e.g. all files a PR changed. */
  highlightedNodeIds?: string[]
  combinedBlastRadius?: { downstream: string[]; upstream: string[] }
}

function GraphView({
  graphData,
  selectedNodeId,
  blastRadius,
  onNodeClick,
  highlightedNodeIds,
  combinedBlastRadius,
}: GraphViewProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>()
  const graphRef = useRef<{ zoomToFit: (ms?: number, padding?: number) => void } | null>(null)

  const forceGraphData = useMemo(
    () => ({
      nodes: graphData.nodes.map((n) => ({ ...n })),
      links: graphData.edges.map((e) => ({ source: e.from, target: e.to })),
    }),
    [graphData],
  )

  const downstreamSet = useMemo(() => new Set(blastRadius?.downstream ?? []), [blastRadius])
  const upstreamSet = useMemo(() => new Set(blastRadius?.upstream ?? []), [blastRadius])

  const highlightedSet = useMemo(() => new Set(highlightedNodeIds ?? []), [highlightedNodeIds])
  const combinedDownstreamSet = useMemo(
    () => new Set(combinedBlastRadius?.downstream ?? []),
    [combinedBlastRadius],
  )
  const combinedUpstreamSet = useMemo(
    () => new Set(combinedBlastRadius?.upstream ?? []),
    [combinedBlastRadius],
  )

  function getNodeColor(nodeId: string, nodeType: string): string {
    if (highlightedSet.size > 0) {
      if (highlightedSet.has(nodeId)) return SELECTED_COLOR
      if (combinedDownstreamSet.has(nodeId)) return DOWNSTREAM_COLOR
      if (combinedUpstreamSet.has(nodeId)) return UPSTREAM_COLOR
      return DIMMED_COLOR
    }
    if (!selectedNodeId) return colorForType(nodeType)
    if (nodeId === selectedNodeId) return SELECTED_COLOR
    if (downstreamSet.has(nodeId)) return DOWNSTREAM_COLOR
    if (upstreamSet.has(nodeId)) return UPSTREAM_COLOR
    return DIMMED_COLOR
  }

  if (graphData.nodes.length === 0) {
    return (
      <div ref={containerRef} className="flex h-full w-full items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">This graph has no nodes to display.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative h-full w-full" data-testid="graph-view">
      <ForceGraph2D
        ref={graphRef as never}
        graphData={forceGraphData}
        width={size.width}
        height={size.height}
        nodeId="id"
        nodeLabel={(node) => {
          const n = node as { label: string; type: string }
          // n.label/n.type are file-graph data straight from a scanned (untrusted) repo — this
          // library renders nodeLabel's return value as raw innerHTML, so it must be escaped.
          return `<div style="font:12px system-ui;padding:2px 4px"><strong>${escapeHtml(n.label)}</strong><br/>${escapeHtml(n.type)}</div>`
        }}
        nodeColor={(node) => getNodeColor(String(node.id), (node as { type: string }).type)}
        nodeRelSize={5}
        linkColor={() => 'rgba(166,172,187,0.35)'}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        onNodeClick={(node) => onNodeClick(String(node.id))}
        cooldownTicks={80}
        onEngineStop={() => graphRef.current?.zoomToFit(400, 60)}
      />
      <div className="absolute top-3 right-3 flex gap-1">
        <button
          type="button"
          onClick={() => graphRef.current?.zoomToFit(400, 60)}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          Reset view
        </button>
      </div>
    </div>
  )
}

export default GraphView
