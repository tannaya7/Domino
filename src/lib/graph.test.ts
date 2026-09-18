import { describe, expect, it } from 'vitest'
import sampleData from '../data/sample.json'
import { buildAdjacencyMap, buildVendorGraph, getBlastRadius, getDownstream, getUpstream } from './graph'
import type { GraphData, Vendor } from './types'

function fixtureVendor(overrides: Partial<Vendor>): Vendor {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.9999,
    detectedVia: ['import:stripe'],
    detectedInFiles: [],
    ...overrides,
  }
}

const data = sampleData as GraphData
const adjacencyMap = buildAdjacencyMap(data.nodes, data.edges)

describe('graph engine (sample dataset)', () => {
  it('order-service: computes upstream, downstream, and blast radius', () => {
    const upstream = getUpstream('order-service', adjacencyMap)
    const downstream = getDownstream('order-service', adjacencyMap)

    expect(new Set(upstream)).toEqual(
      new Set(['payment-service', 'inventory-service', 'orders-db', 'notification-service']),
    )
    expect(new Set(downstream)).toEqual(new Set(['api-gateway', 'web-app']))

    const radius = getBlastRadius('order-service', adjacencyMap)
    expect(radius.totalCount).toBe(6)
  })

  it('orders-db: has no upstream and a multi-hop downstream', () => {
    const upstream = getUpstream('orders-db', adjacencyMap)
    const downstream = getDownstream('orders-db', adjacencyMap)

    expect(upstream).toEqual([])
    expect(new Set(downstream)).toEqual(
      new Set(['order-service', 'inventory-service', 'api-gateway', 'web-app']),
    )

    const radius = getBlastRadius('orders-db', adjacencyMap)
    expect(radius.totalCount).toBe(4)
  })

  it('web-app: has no downstream (nothing depends on it)', () => {
    const downstream = getDownstream('web-app', adjacencyMap)
    expect(downstream).toEqual([])
  })
})

describe('graph engine (edge cases)', () => {
  it('empty graph: builds an empty adjacency map without throwing', () => {
    const map = buildAdjacencyMap([], [])
    expect(map.forward.size).toBe(0)
    expect(map.reverse.size).toBe(0)
  })

  it('single-node graph: blast radius is zero', () => {
    const map = buildAdjacencyMap([{ id: 'solo', label: 'Solo', type: 'service' }], [])
    const radius = getBlastRadius('solo', map)
    expect(radius).toEqual({ downstream: [], upstream: [], totalCount: 0 })
  })

  it('disconnected nodes: an isolated node has an empty blast radius even when other nodes have edges', () => {
    const nodes = [
      { id: 'a', label: 'A', type: 'service' },
      { id: 'b', label: 'B', type: 'service' },
      { id: 'isolated', label: 'Isolated', type: 'service' },
    ]
    const edges = [{ from: 'a', to: 'b' }]
    const map = buildAdjacencyMap(nodes, edges)

    const radius = getBlastRadius('isolated', map)
    expect(radius).toEqual({ downstream: [], upstream: [], totalCount: 0 })
  })
})

describe('buildVendorGraph', () => {
  it("extends a vendor's direct files with everything downstream in the file graph", () => {
    // order-service's downstream (from the sample dataset) is api-gateway, web-app.
    const vendor = fixtureVendor({ detectedInFiles: ['order-service'] })
    const vendorGraph = buildVendorGraph([vendor], adjacencyMap)

    expect(vendorGraph.vendors).toHaveLength(1)
    expect(vendorGraph.vendors[0].directFiles).toEqual(['order-service'])
    expect(new Set(vendorGraph.vendors[0].affectedFiles)).toEqual(
      new Set(['order-service', 'api-gateway', 'web-app']),
    )
  })

  it('excludes a detectedInFiles entry that is not an actual file-graph node (e.g. package.json)', () => {
    const vendor = fixtureVendor({ detectedInFiles: ['package.json'] })
    const vendorGraph = buildVendorGraph([vendor], adjacencyMap)

    expect(vendorGraph.vendors[0].directFiles).toEqual([])
    expect(vendorGraph.vendors[0].affectedFiles).toEqual([])
  })

  it('merges affected files across multiple direct files without duplicates', () => {
    const vendor = fixtureVendor({ detectedInFiles: ['order-service', 'orders-db'] })
    const vendorGraph = buildVendorGraph([vendor], adjacencyMap)

    expect(new Set(vendorGraph.vendors[0].affectedFiles)).toEqual(
      new Set(['order-service', 'orders-db', 'api-gateway', 'web-app', 'inventory-service']),
    )
  })

  it('returns an empty vendor list for an empty input without throwing', () => {
    expect(buildVendorGraph([], adjacencyMap)).toEqual({ rootId: '__app__', vendors: [] })
  })
})
