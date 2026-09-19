/** A deterministic (not cryptographic) hash of the assumptions an analysis was computed under —
 * for display/dedup only ("was this snapshot taken under the same assumptions as that one?"),
 * never a security boundary. Pure JS so it works identically in the browser and in Node without a
 * crypto dependency — both sides need to agree on the same hash for the same input. */

export interface HashableAssumptions {
  costPerHourOfDowntime: number
  vendorSlaOverrides: Record<string, number>
  substrateOutageProbabilities: Record<string, number>
}

/** Canonical JSON: object keys sorted recursively, so {a:1,b:2} and {b:2,a:1} hash identically. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

/** FNV-1a, 32-bit — small, fast, dependency-free, plenty of collision resistance for a display
 * hash covering a handful of numeric overrides. Returns 8 lowercase hex characters. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function computeAssumptionsHash(assumptions: HashableAssumptions): string {
  return fnv1a(JSON.stringify(canonicalize(assumptions)))
}
