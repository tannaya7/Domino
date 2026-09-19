import { describe, expect, it } from 'vitest'
import {
  computeClusterAnchors,
  computeHullCircle,
  createClusterForce,
  MAX_VENDOR_RADIUS,
  MIN_VENDOR_RADIUS,
  rankByWeight,
  shouldShowLabel,
  vendorNodeRadius,
} from './vendorGraphLayout'

describe('vendorNodeRadius', () => {
  it('clamps to the minimum for zero weight', () => {
    expect(vendorNodeRadius(0)).toBe(MIN_VENDOR_RADIUS)
  })

  it('clamps to the maximum for a very large weight', () => {
    expect(vendorNodeRadius(10_000)).toBe(MAX_VENDOR_RADIUS)
  })

  it('is monotonically non-decreasing in weight', () => {
    const radii = [0, 1, 2, 5, 10, 20, 40].map((w) => vendorNodeRadius(w))
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThanOrEqual(radii[i - 1])
  })

  it('never goes outside [min, max] for negative or non-finite input', () => {
    expect(vendorNodeRadius(-5)).toBe(MIN_VENDOR_RADIUS)
    expect(vendorNodeRadius(NaN)).toBe(MIN_VENDOR_RADIUS)
  })
})

describe('computeClusterAnchors', () => {
  it('places a single substrate at the center', () => {
    const anchors = computeClusterAnchors(['aws'], 100)
    expect(anchors.get('aws')).toEqual({ x: 0, y: 0 })
  })

  it('spaces multiple substrates evenly around the circle at the given radius', () => {
    const anchors = computeClusterAnchors(['aws', 'gcp', 'azure'], 100)
    expect(anchors.size).toBe(3)
    for (const point of anchors.values()) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(100)
    }
    // No two anchors should coincide.
    const points = [...anchors.values()]
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeGreaterThan(1)
      }
    }
  })
})

describe('createClusterForce', () => {
  it('pulls a node toward its substrate anchor over repeated ticks', () => {
    const anchors = new Map([['aws', { x: 100, y: 0 }]])
    const force = createClusterForce(() => 'aws', anchors, 0.3)
    const node = { id: 'v1', x: 0, y: 0, vx: 0, vy: 0 }
    force.initialize([node])

    for (let i = 0; i < 50; i++) {
      force(1)
      node.x! += node.vx!
      node.y! += node.vy!
      node.vx = 0
      node.vy = 0
    }
    expect(Math.hypot(node.x! - 100, node.y! - 0)).toBeLessThan(5)
  })

  it('leaves a node with no substrate untouched', () => {
    const anchors = new Map([['aws', { x: 100, y: 0 }]])
    const force = createClusterForce(() => null, anchors, 0.3)
    const node = { id: 'v1', x: 5, y: 5, vx: 0, vy: 0 }
    force.initialize([node])
    force(1)
    expect(node.vx).toBe(0)
    expect(node.vy).toBe(0)
  })
})

describe('computeHullCircle', () => {
  it('returns null for an empty member list', () => {
    expect(computeHullCircle('aws', [])).toBeNull()
  })

  it('covers every member position within its radius', () => {
    const members = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: -10 },
    ]
    const hull = computeHullCircle('aws', members, 5)!
    for (const m of members) {
      expect(Math.hypot(m.x - hull.x, m.y - hull.y)).toBeLessThanOrEqual(hull.radius)
    }
  })

  it('includes the requested padding beyond the farthest member', () => {
    const members = [{ x: 0, y: 0 }]
    const hull = computeHullCircle('aws', members, 15)!
    expect(hull.radius).toBe(15) // distance 0 + padding
  })
})

describe('shouldShowLabel', () => {
  it('shows a label once zoomed past the threshold, regardless of rank', () => {
    expect(shouldShowLabel(50, 3, 2, 5)).toBe(true)
  })

  it('shows a label for a top-N rank even at low zoom', () => {
    expect(shouldShowLabel(0, 0.1, 2, 5)).toBe(true)
  })

  it('hides a label outside both the zoom threshold and the top-N', () => {
    expect(shouldShowLabel(10, 0.1, 2, 5)).toBe(false)
  })
})

describe('rankByWeight', () => {
  it('ranks descending by weight, 0 = heaviest', () => {
    const ranks = rankByWeight(new Map([['a', 1], ['b', 10], ['c', 5]]))
    expect(ranks.get('b')).toBe(0)
    expect(ranks.get('c')).toBe(1)
    expect(ranks.get('a')).toBe(2)
  })

  it('breaks ties by id for a stable order', () => {
    const ranks = rankByWeight(new Map([['b', 1], ['a', 1]]))
    expect(ranks.get('a')).toBe(0)
    expect(ranks.get('b')).toBe(1)
  })
})
