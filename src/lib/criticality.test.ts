import { describe, expect, it } from 'vitest'
import sampleData from '../data/sample.json'
import { analyzeCriticality, findArticulationPoints, inferEntrypoints, reachabilityLoss } from './criticality'
import { buildAdjacencyMap } from './graph'
import type { GraphData, GraphEdge, GraphNode } from './types'

function graphFrom(edges: [string, string][]): ReturnType<typeof buildAdjacencyMap> {
  const nodeIds = new Set(edges.flat())
  const nodes: GraphNode[] = [...nodeIds].map((id) => ({ id, label: id, type: 'file' }))
  const graphEdges: GraphEdge[] = edges.map(([from, to]) => ({ from, to }))
  return buildAdjacencyMap(nodes, graphEdges)
}

describe('findArticulationPoints', () => {
  it('identifies both middle nodes of a 4-node chain', () => {
    const adjacency = graphFrom([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ])
    expect(findArticulationPoints(adjacency)).toEqual(new Set(['b', 'c']))
  })

  it('identifies a hub as an articulation point but not its leaves', () => {
    const adjacency = graphFrom([
      ['hub', 'leaf1'],
      ['hub', 'leaf2'],
      ['hub', 'leaf3'],
    ])
    expect(findArticulationPoints(adjacency)).toEqual(new Set(['hub']))
  })

  it('finds no articulation points in a fully connected triangle', () => {
    const adjacency = graphFrom([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ])
    expect(findArticulationPoints(adjacency)).toEqual(new Set())
  })

  it('computes articulation points independently across disconnected components', () => {
    const adjacency = graphFrom([
      ['a', 'b'],
      ['b', 'c'],
      ['x', 'y'],
      ['y', 'z'],
    ])
    expect(findArticulationPoints(adjacency)).toEqual(new Set(['b', 'y']))
  })

  it('returns an empty set for an empty graph without throwing', () => {
    expect(findArticulationPoints(buildAdjacencyMap([], []))).toEqual(new Set())
  })
})

describe('inferEntrypoints', () => {
  it('treats a node nothing else depends on as an entrypoint', () => {
    const adjacency = graphFrom([
      ['main', 'a'],
      ['a', 'b'],
    ])
    expect(inferEntrypoints(adjacency)).toEqual(['main'])
  })

  it('finds web-app as an entrypoint in the sample dataset (nothing depends on it)', () => {
    const data = sampleData as GraphData
    const adjacency = buildAdjacencyMap(data.nodes, data.edges)
    expect(inferEntrypoints(adjacency)).toContain('web-app')
  })
})

describe('reachabilityLoss', () => {
  const adjacency = graphFrom([
    ['main', 'a'],
    ['a', 'b'],
    ['main', 'c'],
  ])

  it('flags entrypoints that transitively depend on the removed node', () => {
    const result = reachabilityLoss(adjacency, ['main'], 'b')
    expect(result.affectedEntrypoints).toEqual(['main'])
    expect(result.reachabilityLossRatio).toBe(1)
  })

  it('does not flag an entrypoint that never depended on the removed node', () => {
    const isolated = graphFrom([
      ['main', 'a'],
      ['other', 'z'],
    ])
    const result = reachabilityLoss(isolated, ['main', 'other'], 'z')
    expect(result.affectedEntrypoints).toEqual(['other'])
    expect(result.reachabilityLossRatio).toBe(0.5)
  })

  it('reports a node only reachable through the removed node as orphaned', () => {
    // b is only reachable from main via a; removing a orphans b.
    const result = reachabilityLoss(adjacency, ['main'], 'a')
    expect(result.orphanedNodes).toEqual(['b'])
  })

  it('does not orphan a node still reachable through another path', () => {
    const diamond = graphFrom([
      ['main', 'a'],
      ['main', 'b'],
      ['a', 'shared'],
      ['b', 'shared'],
    ])
    const result = reachabilityLoss(diamond, ['main'], 'a')
    expect(result.orphanedNodes).toEqual([])
  })

  it('returns a zero ratio for an empty entrypoint list without dividing by zero', () => {
    const result = reachabilityLoss(adjacency, [], 'a')
    expect(result.reachabilityLossRatio).toBe(0)
  })
})

describe('analyzeCriticality', () => {
  it('shows the hub as an articulation point with the highest reachability loss', () => {
    const adjacency = graphFrom([
      ['main', 'hub'],
      ['hub', 'leaf1'],
      ['hub', 'leaf2'],
    ])
    const result = analyzeCriticality(adjacency, ['main', 'hub', 'leaf1', 'leaf2'])

    expect(result.entrypoints).toEqual(['main'])
    expect(result.articulationPoints).toContain('hub')
    expect(result.byNode[0].nodeId).toBe('hub')
    expect(result.byNode[0].isArticulationPoint).toBe(true)
    expect(result.byNode[0].reachabilityLossRatio).toBe(1)
  })

  it('lets a caller override the inferred entrypoints', () => {
    const adjacency = graphFrom([['a', 'b']])
    const result = analyzeCriticality(adjacency, ['a', 'b'], ['a'])
    expect(result.entrypoints).toEqual(['a'])
  })

  it('demonstrates that the two signals can disagree: a leaf can be an articulation point without being a hub', () => {
    // c bridges two otherwise-separate clusters even though it has low "degree".
    const adjacency = graphFrom([
      ['main', 'a'],
      ['a', 'c'],
      ['c', 'd'],
    ])
    const result = analyzeCriticality(adjacency, ['main', 'a', 'c', 'd'])
    expect(new Set(result.articulationPoints)).toEqual(new Set(['a', 'c']))
  })

  it('REGRESSION: an entrypoint never appears critical purely via self-dependence', () => {
    // Reproduces the SkillSprint bug: many disconnected entrypoints (page.tsx/layout.tsx style
    // files with no real edges between them) each trivially "depend on themselves", which used to
    // surface as "1/N entrypoints depend on it" for every single one — meaningless self-reference,
    // not a real finding.
    const adjacency = graphFrom([
      ['unrelated-a', 'shared-util'], // gives the fixture at least one real edge to build a graph from
    ])
    const entrypoints = ['page-1', 'page-2', 'page-3', 'unrelated-a']
    const allNodeIds = [...entrypoints, 'shared-util']

    const result = analyzeCriticality(adjacency, allNodeIds, entrypoints)

    for (const entrypointId of entrypoints) {
      const node = result.byNode.find((n) => n.nodeId === entrypointId)!
      // It must never count itself as one of the entrypoints affected by its own removal.
      expect(node.affectedEntrypoints).not.toContain(entrypointId)
      // entrypointCount excludes the node itself from the denominator too.
      expect(node.entrypointCount).toBe(entrypoints.length - 1)
    }

    // A page with zero real dependents shows a genuine zero, not a trivial "1/N" self-match.
    const isolatedPage = result.byNode.find((n) => n.nodeId === 'page-1')!
    expect(isolatedPage.affectedEntrypoints).toEqual([])
    expect(isolatedPage.reachabilityLossRatio).toBe(0)
  })
})
