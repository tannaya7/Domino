// Pure layout math for the vendor graph — no rendering, no react-force-graph import, so every
// formula here is unit-testable without a canvas or a DOM.

export const MIN_VENDOR_RADIUS = 10
export const MAX_VENDOR_RADIUS = 28
export const HUB_RADIUS = 22

/** Log-scaled so one huge blast radius doesn't dwarf everything else on screen — clamped to a
 * fixed visual range regardless of how large `weight` (affected-file count) actually gets. */
export function vendorNodeRadius(weight: number, min = MIN_VENDOR_RADIUS, max = MAX_VENDOR_RADIUS): number {
  const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 0
  const scaled = min + (max - min) * (Math.log2(1 + safeWeight) / Math.log2(1 + 32))
  return Math.max(min, Math.min(max, scaled))
}

export interface Point {
  x: number
  y: number
}

/** Evenly spaced anchor points on a circle, one per substrate — the "islands" vendors cluster around. */
export function computeClusterAnchors(substrates: string[], radius: number, center: Point = { x: 0, y: 0 }): Map<string, Point> {
  const anchors = new Map<string, Point>()
  const n = substrates.length
  substrates.forEach((substrate, i) => {
    // A single substrate anchors at the center — no reason to orbit alone.
    const angle = n <= 1 ? 0 : (2 * Math.PI * i) / n - Math.PI / 2
    anchors.set(substrate, {
      x: center.x + (n <= 1 ? 0 : radius * Math.cos(angle)),
      y: center.y + (n <= 1 ? 0 : radius * Math.sin(angle)),
    })
  })
  return anchors
}

interface ForceNode {
  id: string | number
  x?: number
  y?: number
  vx?: number
  vy?: number
}

/**
 * A d3-force-compatible custom force: a PLAIN function (no `d3-force` import), registered on the
 * graph instance via its own `d3Force(name, fn)` accessor (react-force-graph-2d already depends on
 * d3-force internally and exposes that accessor — this doesn't add a new dependency). Each tick,
 * nudges every node toward its substrate's anchor point, scaled by the simulation's cooling `alpha`
 * so it settles like every other d3-force rather than fighting the charge/link forces forever.
 */
export function createClusterForce(getSubstrate: (nodeId: string) => string | null, anchors: Map<string, Point>, strength = 0.12) {
  let nodes: ForceNode[] = []

  function force(alpha: number): void {
    for (const node of nodes) {
      const substrate = getSubstrate(String(node.id))
      if (!substrate) continue
      const anchor = anchors.get(substrate)
      if (!anchor || node.x === undefined || node.y === undefined) continue
      node.vx = (node.vx ?? 0) + (anchor.x - node.x) * strength * alpha
      node.vy = (node.vy ?? 0) + (anchor.y - node.y) * strength * alpha
    }
  }

  force.initialize = (initializedNodes: ForceNode[]) => {
    nodes = initializedNodes
  }

  return force
}

export interface HullCircle {
  substrate: string
  x: number
  y: number
  radius: number
}

/** The smallest circle (center + padding) covering every member node of a substrate cluster — the
 * "translucent padded hull" drawn behind each island. `null` for a substrate with no positioned members. */
export function computeHullCircle(substrate: string, memberPositions: Point[], padding = 26): HullCircle | null {
  if (memberPositions.length === 0) return null
  const cx = memberPositions.reduce((sum, p) => sum + p.x, 0) / memberPositions.length
  const cy = memberPositions.reduce((sum, p) => sum + p.y, 0) / memberPositions.length
  let maxDist = 0
  for (const p of memberPositions) {
    const d = Math.hypot(p.x - cx, p.y - cy)
    if (d > maxDist) maxDist = d
  }
  return { substrate, x: cx, y: cy, radius: maxDist + padding }
}

/** Show a label only when zoomed in enough to read it, or for the highest-weight nodes regardless
 * of zoom — so the graph reads as "names" up close and "shapes" from afar, never a label soup. */
export function shouldShowLabel(rank: number, zoomLevel: number, zoomThreshold: number, topN: number): boolean {
  return zoomLevel >= zoomThreshold || rank < topN
}

/** Ranks node ids by descending weight (ties broken by id for a stable order across renders). */
export function rankByWeight(weights: Map<string, number>): Map<string, number> {
  const sorted = [...weights.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return new Map(sorted.map(([id], rank) => [id, rank]))
}
