import type { GraphData } from './types'

export interface AdjacencyMap {
  /** node id -> ids of nodes it depends on (forward edges, from -> to) */
  forward: Map<string, string[]>
  /** node id -> ids of nodes that depend on it (reverse edges, to -> from) */
  reverse: Map<string, string[]>
}

export interface BlastRadius {
  downstream: string[]
  upstream: string[]
  totalCount: number
}

export function buildAdjacencyMap(nodes: GraphData['nodes'], edges: GraphData['edges']): AdjacencyMap {
  const forward = new Map<string, string[]>()
  const reverse = new Map<string, string[]>()

  for (const node of nodes) {
    forward.set(node.id, [])
    reverse.set(node.id, [])
  }

  for (const edge of edges) {
    forward.get(edge.from)?.push(edge.to)
    reverse.get(edge.to)?.push(edge.from)
  }

  return { forward, reverse }
}

function traverse(nodeId: string, adjacency: Map<string, string[]>): string[] {
  const visited = new Set<string>()
  const queue = [...(adjacency.get(nodeId) ?? [])]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next)
    }
  }

  return [...visited]
}

/** Everything that depends on this node, directly or transitively — breaks if this node breaks. */
export function getDownstream(nodeId: string, adjacencyMap: AdjacencyMap): string[] {
  return traverse(nodeId, adjacencyMap.reverse)
}

/** Everything this node depends on, directly or transitively. */
export function getUpstream(nodeId: string, adjacencyMap: AdjacencyMap): string[] {
  return traverse(nodeId, adjacencyMap.forward)
}

export function getBlastRadius(nodeId: string, adjacencyMap: AdjacencyMap): BlastRadius {
  const downstream = getDownstream(nodeId, adjacencyMap)
  const upstream = getUpstream(nodeId, adjacencyMap)
  return {
    downstream,
    upstream,
    totalCount: downstream.length + upstream.length,
  }
}
