// Differential tests: the production algorithm (Tarjan articulation points, reachability-loss
// BFS) checked against a deliberately dumb, obviously-correct brute-force reference on hundreds of
// random graphs — not just the handful of hand-picked fixtures in criticality.test.ts. This is
// evidence the algorithm is right on graph SHAPES nobody thought to hand-write a fixture for
// (disconnected components, self-loops, duplicate edges), not just a claim that it is.
import { describe, expect, it } from 'vitest'
import { findArticulationPoints, reachabilityLoss } from './criticality'
import { buildAdjacencyMap } from './graph'
import type { GraphEdge, GraphNode } from './types'

const TRIALS = 500
const MAX_NODES = 14

/** Deterministic seeded PRNG (mulberry32) — same generator already used in
 * src/engine/correlated.test.ts and src/lib/availability.test.ts for reproducible random trials. */
function mulberry32(seed: number): () => number {
  let state = seed
  return function next() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface RandomGraph {
  nodeIds: string[]
  edges: [string, string][]
}

/** Deliberately allows self-loops (a===b), duplicate edges, and disconnected components — the
 * exact edge cases the task calls out, and the ones a hand-written fixture is least likely to
 * cover. n is capped at MAX_NODES so brute force (O(n) BFS per node) stays fast across 500 trials. */
function randomGraph(rng: () => number): RandomGraph {
  const n = 1 + Math.floor(rng() * MAX_NODES)
  const nodeIds = Array.from({ length: n }, (_, i) => `n${i}`)
  // Biased toward sparse-to-medium density; occasionally denser or edgeless, both real cases.
  const edgeCount = Math.floor(rng() * rng() * n * n)
  const edges: [string, string][] = []
  for (let i = 0; i < edgeCount; i++) {
    const a = nodeIds[Math.floor(rng() * n)]
    const b = nodeIds[Math.floor(rng() * n)]
    edges.push([a, b])
  }
  return { nodeIds, edges }
}

function toAdjacencyMap(graph: RandomGraph) {
  const nodes: GraphNode[] = graph.nodeIds.map((id) => ({ id, label: id, type: 'file' }))
  const edges: GraphEdge[] = graph.edges.map(([from, to]) => ({ from, to }))
  return buildAdjacencyMap(nodes, edges)
}

// --- 1a: brute-force articulation points ---------------------------------------------------
// v is a cut vertex of undirected graph G iff components(G - v) > components(G) — true for any v
// with degree >= 1 (removing it splits its component into >=2 pieces) and provably false for an
// isolated v (removing it only ever drops the component count by exactly 1, never increases it).
// This needs no isolated-vertex special case, which is itself a nice property to lean on for an
// independent check: get it wrong and the isolated-vertex trials (edgeCount can be 0) will catch it.

function buildUndirectedSkeleton(nodeIds: string[], edges: [string, string][]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  for (const id of nodeIds) adjacency.set(id, new Set())
  for (const [a, b] of edges) {
    if (a === b) continue // a self-loop can't affect connectivity between two DIFFERENT vertices
    adjacency.get(a)!.add(b)
    adjacency.get(b)!.add(a)
  }
  return adjacency
}

function countComponents(nodeIds: string[], adjacency: Map<string, Set<string>>, exclude?: string): number {
  const visited = new Set<string>(exclude ? [exclude] : [])
  let count = 0
  for (const start of nodeIds) {
    if (visited.has(start)) continue
    count++
    visited.add(start)
    const queue = [start]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        queue.push(next)
      }
    }
  }
  return count
}

function bruteForceArticulationPoints(nodeIds: string[], edges: [string, string][]): Set<string> {
  const adjacency = buildUndirectedSkeleton(nodeIds, edges)
  const baseline = countComponents(nodeIds, adjacency)
  const result = new Set<string>()
  for (const node of nodeIds) {
    if (countComponents(nodeIds, adjacency, node) > baseline) result.add(node)
  }
  return result
}

describe('findArticulationPoints — differential vs brute force', () => {
  it(`agrees with brute-force "components(G-v) > components(G)" on ${TRIALS} random graphs (n<=${MAX_NODES}, incl. disconnected/self-loops/duplicate edges)`, () => {
    const rng = mulberry32(20260101)
    let disconnectedGraphsSeen = 0
    let selfLoopsSeen = 0
    let duplicateEdgesSeen = 0

    for (let trial = 0; trial < TRIALS; trial++) {
      const graph = randomGraph(rng)
      if (graph.edges.some(([a, b]) => a === b)) selfLoopsSeen++
      const edgeKeys = graph.edges.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`))
      if (new Set(edgeKeys).size < edgeKeys.length) duplicateEdgesSeen++
      if (countComponents(graph.nodeIds, buildUndirectedSkeleton(graph.nodeIds, graph.edges)) > 1) disconnectedGraphsSeen++

      const expected = bruteForceArticulationPoints(graph.nodeIds, graph.edges)
      const actual = findArticulationPoints(toAdjacencyMap(graph))

      expect(
        [...actual].sort(),
        `trial ${trial}: nodes=${JSON.stringify(graph.nodeIds)} edges=${JSON.stringify(graph.edges)}`,
      ).toEqual([...expected].sort())
    }

    // Assert the fixture generator actually exercised what this test claims to cover — a
    // differential test that never generates a disconnected graph isn't testing that case.
    expect(disconnectedGraphsSeen).toBeGreaterThan(0)
    expect(selfLoopsSeen).toBeGreaterThan(0)
    expect(duplicateEdgesSeen).toBeGreaterThan(0)
  })
})

// --- 1b: brute-force reachability loss ------------------------------------------------------
// Independent BFS over the raw edge list (not graph.ts's `traverse`) — deliberately not reusing
// the production traversal primitive, so this checks reachabilityLoss's higher-level aggregation
// (which entrypoints count as "affected", which nodes are "orphaned", the self-entrypoint
// exclusion) against a from-scratch recomputation, not the SUT validating itself.

function bruteForceReachableFrom(start: string, edges: [string, string][], exclude?: string): Set<string> {
  const forward = new Map<string, string[]>()
  for (const [a, b] of edges) {
    if (!forward.has(a)) forward.set(a, [])
    forward.get(a)!.push(b)
  }
  const visited = new Set<string>()
  if (start === exclude) return visited
  const queue = [start]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const next of forward.get(current) ?? []) {
      if (next === exclude || visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }
  return visited
}

function bruteForceReachabilityLoss(edges: [string, string][], entrypoints: string[], removedNodeId: string) {
  const otherEntrypoints = entrypoints.filter((e) => e !== removedNodeId)
  const affectedEntrypoints = otherEntrypoints.filter((e) => bruteForceReachableFrom(e, edges).has(removedNodeId))

  const reachableBefore = new Set<string>()
  const reachableAfter = new Set<string>()
  for (const entrypoint of otherEntrypoints) {
    reachableBefore.add(entrypoint)
    for (const n of bruteForceReachableFrom(entrypoint, edges)) reachableBefore.add(n)
    reachableAfter.add(entrypoint)
    for (const n of bruteForceReachableFrom(entrypoint, edges, removedNodeId)) reachableAfter.add(n)
  }
  const orphanedNodes = [...reachableBefore].filter((n) => n !== removedNodeId && !reachableAfter.has(n))

  return { affectedEntrypoints: affectedEntrypoints.sort(), orphanedNodes: orphanedNodes.sort() }
}

describe('reachabilityLoss — differential vs brute force', () => {
  it(`agrees with a from-scratch "delete node, recompute reachable set from entrypoints" on ${TRIALS} random graphs`, () => {
    const rng = mulberry32(20260202)

    for (let trial = 0; trial < TRIALS; trial++) {
      const graph = randomGraph(rng)
      const adjacencyMap = toAdjacencyMap(graph)

      // A random subset of nodes stands in for "entrypoints" — real callers pass an arbitrary
      // subset too (framework routes, package.json main/bin), not "every node".
      const entrypoints = graph.nodeIds.filter(() => rng() < 0.4)
      const removedNodeId = graph.nodeIds[Math.floor(rng() * graph.nodeIds.length)]

      const actual = reachabilityLoss(adjacencyMap, entrypoints, removedNodeId)
      const expected = bruteForceReachabilityLoss(graph.edges, entrypoints, removedNodeId)

      const context = `trial ${trial}: nodes=${JSON.stringify(graph.nodeIds)} edges=${JSON.stringify(graph.edges)} entrypoints=${JSON.stringify(entrypoints)} removed=${removedNodeId}`
      expect([...actual.affectedEntrypoints].sort(), context).toEqual(expected.affectedEntrypoints)
      expect([...actual.orphanedNodes].sort(), context).toEqual(expected.orphanedNodes)
    }
  })
})
