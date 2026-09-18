import type { GraphData } from './types'

export type ValidationResult =
  | { valid: true; data: GraphData }
  | { valid: false; error: string }

export function validateGraphData(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: 'Input must be a JSON object with "nodes" and "edges" arrays.' }
  }

  const obj = input as Record<string, unknown>

  if (!Array.isArray(obj.nodes)) {
    return { valid: false, error: 'Missing or invalid "nodes" array.' }
  }
  if (!Array.isArray(obj.edges)) {
    return { valid: false, error: 'Missing or invalid "edges" array.' }
  }

  const nodeIds = new Set<string>()
  for (const [i, node] of obj.nodes.entries()) {
    if (typeof node !== 'object' || node === null) {
      return { valid: false, error: `Node at index ${i} is not an object.` }
    }
    const n = node as Record<string, unknown>
    if (typeof n.id !== 'string' || n.id.length === 0) {
      return { valid: false, error: `Node at index ${i} is missing a valid "id".` }
    }
    if (nodeIds.has(n.id)) {
      return { valid: false, error: `Duplicate node id "${n.id}".` }
    }
    nodeIds.add(n.id)
    if (typeof n.label !== 'string' || n.label.length === 0) {
      return { valid: false, error: `Node "${n.id}" is missing a valid "label".` }
    }
    if (typeof n.type !== 'string' || n.type.length === 0) {
      return { valid: false, error: `Node "${n.id}" is missing a valid "type".` }
    }
  }

  for (const [i, edge] of obj.edges.entries()) {
    if (typeof edge !== 'object' || edge === null) {
      return { valid: false, error: `Edge at index ${i} is not an object.` }
    }
    const e = edge as Record<string, unknown>
    if (typeof e.from !== 'string' || !nodeIds.has(e.from)) {
      return { valid: false, error: `Edge at index ${i} has an unknown "from" node id.` }
    }
    if (typeof e.to !== 'string' || !nodeIds.has(e.to)) {
      return { valid: false, error: `Edge at index ${i} has an unknown "to" node id.` }
    }
  }

  return { valid: true, data: obj as unknown as GraphData }
}
