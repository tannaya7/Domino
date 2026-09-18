import type { GraphData, Vendor, VendorGraph, VendorWithBlastRadius } from './types'

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

/** `exclude` simulates that node being removed from the graph — used to answer "what's still reachable if X dies?" */
function traverse(nodeId: string, adjacency: Map<string, string[]>, exclude?: string): string[] {
  const visited = new Set<string>()
  const queue = [...(adjacency.get(nodeId) ?? [])].filter((n) => n !== exclude)

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current) || current === exclude) continue
    visited.add(current)
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next) && next !== exclude) queue.push(next)
    }
  }

  return [...visited]
}

/** Everything that depends on this node, directly or transitively — breaks if this node breaks. */
export function getDownstream(nodeId: string, adjacencyMap: AdjacencyMap, exclude?: string): string[] {
  return traverse(nodeId, adjacencyMap.reverse, exclude)
}

/** Everything this node depends on, directly or transitively. */
export function getUpstream(nodeId: string, adjacencyMap: AdjacencyMap, exclude?: string): string[] {
  return traverse(nodeId, adjacencyMap.forward, exclude)
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

/** Synthetic id for "this application" in a VendorGraph — the node every vendor edge originates from. */
export const VENDOR_GRAPH_ROOT_ID = '__app__'

/**
 * Rolls a repo's file graph up into a vendor graph: each detected vendor's `detectedInFiles` are
 * the files that reference it directly; `affectedFiles` extends that with everything downstream of
 * those files in the existing file-import graph — the real answer to "what breaks if this vendor
 * fails," reusing the same BFS this app already uses for file-level blast radius.
 */
export function buildVendorGraph(vendors: Vendor[], fileAdjacency: AdjacencyMap): VendorGraph {
  const withBlastRadius: VendorWithBlastRadius[] = vendors.map((vendor) => {
    // Manifest/env files (e.g. package.json, .env.example) aren't file-graph nodes, so they
    // wouldn't have an adjacency entry — only real source files can seed a downstream traversal.
    const directFiles = vendor.detectedInFiles.filter((file) => fileAdjacency.reverse.has(file))

    const affected = new Set<string>(directFiles)
    for (const file of directFiles) {
      for (const downstream of getDownstream(file, fileAdjacency)) affected.add(downstream)
    }

    return { ...vendor, directFiles, affectedFiles: [...affected] }
  })

  return { rootId: VENDOR_GRAPH_ROOT_ID, vendors: withBlastRadius }
}
