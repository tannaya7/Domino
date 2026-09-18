import { getUpstream, type AdjacencyMap } from './graph'
import type { CriticalityResult, NodeCriticality } from './types'

/**
 * Finds articulation points via Tarjan's algorithm on the graph's undirected skeleton (an edge's
 * direction doesn't matter for "does removing this node disconnect the graph" — a dependency
 * either connects two nodes or it doesn't). Recursive DFS is fine at the node counts this app
 * handles (repo file graphs capped at 80 files, vendor graphs typically under 30 nodes).
 */
export function findArticulationPoints(adjacencyMap: AdjacencyMap): Set<string> {
  const undirected = new Map<string, Set<string>>()
  function addEdge(a: string, b: string): void {
    if (!undirected.has(a)) undirected.set(a, new Set())
    undirected.get(a)!.add(b)
  }
  for (const [from, tos] of adjacencyMap.forward) {
    for (const to of tos) {
      addEdge(from, to)
      addEdge(to, from)
    }
    if (!undirected.has(from)) undirected.set(from, new Set())
  }

  const disc = new Map<string, number>()
  const low = new Map<string, number>()
  const result = new Set<string>()
  let timer = 0

  function dfs(u: string, parent: string | null): void {
    disc.set(u, ++timer)
    low.set(u, timer)
    let children = 0
    for (const v of undirected.get(u) ?? []) {
      if (v === parent) continue
      if (disc.has(v)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!))
        continue
      }
      children++
      dfs(v, u)
      low.set(u, Math.min(low.get(u)!, low.get(v)!))
      if (parent !== null && low.get(v)! >= disc.get(u)!) result.add(u)
    }
    if (parent === null && children > 1) result.add(u)
  }

  for (const node of undirected.keys()) {
    if (!disc.has(node)) dfs(node, null)
  }

  return result
}

/**
 * Default entrypoint heuristic: a node nothing else in the graph depends on (empty downstream) is
 * a root of the dependency tree — for a file graph that's typically an app entry file or route
 * handler; for a vendor graph it's the synthetic app-root node. Callers with a better source of
 * truth (e.g. a manifest of actual routes) should pass their own `entrypoints` instead.
 */
export function inferEntrypoints(adjacencyMap: AdjacencyMap): string[] {
  return [...adjacencyMap.reverse.keys()].filter((id) => (adjacencyMap.reverse.get(id) ?? []).length === 0)
}

export interface ReachabilityLossResult {
  removedNodeId: string
  affectedEntrypoints: string[]
  orphanedNodes: string[]
  entrypointCount: number
  reachabilityLossRatio: number
}

/**
 * Simulates removing `removedNodeId` and measures the damage in two ways: which entrypoints
 * directly or transitively needed it (affectedEntrypoints), and which other nodes become
 * completely unreachable from every remaining entrypoint as collateral damage (orphanedNodes).
 */
export function reachabilityLoss(
  adjacencyMap: AdjacencyMap,
  entrypoints: string[],
  removedNodeId: string,
): ReachabilityLossResult {
  // An entrypoint trivially "depends on itself" — that's not a finding, so it's excluded from
  // both the numerator and the denominator here. Without this, every entrypoint node showed up
  // as "1/N entrypoints depend on it" (itself), which is meaningless self-reference, not signal.
  const otherEntrypoints = entrypoints.filter((e) => e !== removedNodeId)
  const affectedEntrypoints = otherEntrypoints.filter((e) => getUpstream(e, adjacencyMap).includes(removedNodeId))

  const reachableBefore = new Set<string>()
  const reachableAfter = new Set<string>()
  for (const entrypoint of otherEntrypoints) {
    reachableBefore.add(entrypoint)
    for (const n of getUpstream(entrypoint, adjacencyMap)) reachableBefore.add(n)
    reachableAfter.add(entrypoint)
    for (const n of getUpstream(entrypoint, adjacencyMap, removedNodeId)) reachableAfter.add(n)
  }
  const orphanedNodes = [...reachableBefore].filter((n) => n !== removedNodeId && !reachableAfter.has(n))

  return {
    removedNodeId,
    affectedEntrypoints,
    orphanedNodes,
    entrypointCount: otherEntrypoints.length,
    reachabilityLossRatio: otherEntrypoints.length > 0 ? affectedEntrypoints.length / otherEntrypoints.length : 0,
  }
}

/**
 * Runs both criticality signals for every node and reports them side by side, deliberately
 * un-merged: the highest-degree node and the articulation point are often different nodes, and
 * that disagreement is itself the finding, not something to average away into one score.
 */
export function analyzeCriticality(
  adjacencyMap: AdjacencyMap,
  nodeIds: string[],
  entrypoints?: string[],
): CriticalityResult {
  const resolvedEntrypoints = entrypoints ?? inferEntrypoints(adjacencyMap)
  const articulationPoints = findArticulationPoints(adjacencyMap)

  const byNode: NodeCriticality[] = nodeIds
    .map((nodeId) => {
      const loss = reachabilityLoss(adjacencyMap, resolvedEntrypoints, nodeId)
      return {
        nodeId,
        isArticulationPoint: articulationPoints.has(nodeId),
        affectedEntrypoints: loss.affectedEntrypoints,
        orphanedNodes: loss.orphanedNodes,
        entrypointCount: loss.entrypointCount,
        reachabilityLossRatio: loss.reachabilityLossRatio,
      }
    })
    // Ranked by the number of OTHER entrypoints/files that depend on this node (both already
    // exclude the node itself) — a plain count, not a ratio, so a node affecting 10 of 200
    // entrypoints outranks one affecting 1 of 2.
    .sort((a, b) => {
      const bImpact = b.affectedEntrypoints.length + b.orphanedNodes.length
      const aImpact = a.affectedEntrypoints.length + a.orphanedNodes.length
      return bImpact - aImpact
    })

  return { entrypoints: resolvedEntrypoints, articulationPoints: [...articulationPoints], byNode }
}
