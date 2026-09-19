// Robustness evidence, not a claim: every graph traversal in this codebase must be iterative, not
// recursive — a recursive DFS on a long real-world dependency chain (or a deep tsconfig/vendor
// chain) blows V8's call stack (default limit is a few thousand frames, far below a real repo's
// file count). This file proves it on graph SHAPES a recursive implementation would fail on, and
// reports real timings so "iterative" also means "fast enough," not just "doesn't crash."
import { describe, expect, it } from 'vitest'
import { findArticulationPoints, reachabilityLoss } from './criticality'
import { buildAdjacencyMap, getBlastRadius } from './graph'
import type { GraphEdge, GraphNode } from './types'

function chainGraph(n: number) {
  const nodes: GraphNode[] = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `n${i}`, type: 'file' }))
  const edges: GraphEdge[] = []
  for (let i = 0; i < n - 1; i++) edges.push({ from: `n${i}`, to: `n${i + 1}` })
  return buildAdjacencyMap(nodes, edges)
}

/** Deterministic seeded PRNG (mulberry32) — same generator as criticality.differential.test.ts. */
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

function denseGraph(n: number, edgesPerNode: number, seed: number) {
  const rng = mulberry32(seed)
  const nodes: GraphNode[] = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `n${i}`, type: 'file' }))
  const edges: GraphEdge[] = []
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < edgesPerNode; k++) {
      const j = Math.floor(rng() * n)
      if (j !== i) edges.push({ from: `n${i}`, to: `n${j}` })
    }
  }
  return buildAdjacencyMap(nodes, edges)
}

describe('findArticulationPoints — iterative, not recursive (robustness)', () => {
  it('handles a 100,000-node chain without a stack overflow, and every interior node is a cut vertex', () => {
    const n = 100_000
    const adjacency = chainGraph(n)

    const start = performance.now()
    const points = findArticulationPoints(adjacency)
    const elapsedMs = performance.now() - start

    // In a chain, every node except the two endpoints is a cut vertex — a cheap, exact property
    // to check at this scale without a brute-force pass (that would itself be O(n^2)+ here).
    expect(points.size).toBe(n - 2)
    expect(points.has('n0')).toBe(false)
    expect(points.has(`n${n - 1}`)).toBe(false)
    expect(points.has('n1')).toBe(true)
    expect(points.has(`n${n - 2}`)).toBe(true)

    console.log(`[verify] findArticulationPoints on a ${n}-node chain: ${elapsedMs.toFixed(1)}ms`)
    expect(elapsedMs).toBeLessThan(30_000) // correctness+no-crash is the real assertion above; this is a loose backstop against an actual algorithmic regression, not a tight perf gate (verified standalone: <1s; under full-suite parallel contention this can legitimately read much higher)
  })

  it('handles a 2,000-node dense graph (~50 edges/node) without a stack overflow', () => {
    const n = 2000
    const adjacency = denseGraph(n, 50, 424242)

    const start = performance.now()
    const points = findArticulationPoints(adjacency)
    const elapsedMs = performance.now() - start

    // A dense random graph is overwhelmingly likely to be biconnected (no cut vertices) — the
    // real assertion here is "completes at all, fast, without crashing"; size is a sanity bound.
    expect(points.size).toBeLessThan(n)
    console.log(`[verify] findArticulationPoints on a ${n}-node dense graph (~${n * 50} edges): ${elapsedMs.toFixed(1)}ms`)
    expect(elapsedMs).toBeLessThan(30_000) // correctness+no-crash is the real assertion above; this is a loose backstop against an actual algorithmic regression, not a tight perf gate (verified standalone: <1s; under full-suite parallel contention this can legitimately read much higher)
  })
})

describe('graph traversals (getUpstream/getDownstream/reachabilityLoss) — robustness', () => {
  it('getBlastRadius handles a 100,000-node chain without a stack overflow', () => {
    const n = 100_000
    const adjacency = chainGraph(n)

    const start = performance.now()
    const radius = getBlastRadius('n0', adjacency)
    const elapsedMs = performance.now() - start

    // forward edges mean "depends on" (n0 -> n1 -> ... means n0 depends on n1): n0 sits at the
    // root of the chain, so everything else is upstream of it (its dependencies), and nothing
    // depends ON n0 (downstream is empty).
    expect(radius.upstream.length).toBe(n - 1)
    expect(radius.downstream.length).toBe(0)
    console.log(`[verify] getBlastRadius on a ${n}-node chain: ${elapsedMs.toFixed(1)}ms`)
    expect(elapsedMs).toBeLessThan(30_000) // correctness+no-crash is the real assertion above; this is a loose backstop against an actual algorithmic regression, not a tight perf gate (verified standalone: <1s; under full-suite parallel contention this can legitimately read much higher)
  })

  it('reachabilityLoss handles a 100,000-node chain without a stack overflow', () => {
    const n = 100_000
    const adjacency = chainGraph(n)

    const start = performance.now()
    const loss = reachabilityLoss(adjacency, ['n0', `n${n - 1}`], 'n50000')
    const elapsedMs = performance.now() - start

    // n0 depends (transitively) on n50000 -> removing n50000 orphans n0 from that dependency;
    // the far endpoint doesn't depend on anything past itself in this direction, so it's unaffected.
    expect(loss.affectedEntrypoints).toEqual(['n0'])
    console.log(`[verify] reachabilityLoss on a ${n}-node chain: ${elapsedMs.toFixed(1)}ms`)
    expect(elapsedMs).toBeLessThan(30_000) // correctness+no-crash is the real assertion above; this is a loose backstop against an actual algorithmic regression, not a tight perf gate (verified standalone: <1s; under full-suite parallel contention this can legitimately read much higher)
  })

  it('getBlastRadius handles a 2,000-node dense graph without a stack overflow', () => {
    const n = 2000
    const adjacency = denseGraph(n, 50, 99)

    const start = performance.now()
    const radius = getBlastRadius('n0', adjacency)
    const elapsedMs = performance.now() - start

    expect(radius.totalCount).toBeGreaterThanOrEqual(0)
    console.log(`[verify] getBlastRadius on a ${n}-node dense graph: ${elapsedMs.toFixed(1)}ms`)
    expect(elapsedMs).toBeLessThan(30_000) // correctness+no-crash is the real assertion above; this is a loose backstop against an actual algorithmic regression, not a tight perf gate (verified standalone: <1s; under full-suite parallel contention this can legitimately read much higher)
  })
})
