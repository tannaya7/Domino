import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { BlastRadius } from '../lib/graph'
import {
  colorForType,
  DIMMED_COLOR,
  DOWNSTREAM_COLOR,
  SELECTED_COLOR,
  UPSTREAM_COLOR,
} from '../lib/colors'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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
        <p className="text-sm text-gray-400">This graph has no nodes to display.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-full w-full" data-testid="graph-view">
      <ForceGraph2D
        graphData={forceGraphData}
        width={size.width}
        height={size.height}
        nodeId="id"
        nodeLabel="label"
        nodeColor={(node) => getNodeColor(String(node.id), (node as { type: string }).type)}
        nodeRelSize={5}
        linkColor={() => '#cbd5e1'}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        onNodeClick={(node) => onNodeClick(String(node.id))}
      />
    </div>
  )
}

export default GraphView
