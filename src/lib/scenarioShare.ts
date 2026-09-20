import type { ScenarioKnownIds, ScenarioSelection } from '../engine/scenario'
import { DEFAULT_SCENARIO_HOURS } from '../engine/scenario'

interface ShareablePayload {
  s: string[]
  v: string[]
  h: number
}

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(input: string): string | null {
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/')
    const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4)
    const binary = atob(withPadding)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/** Encodes a scenario selection for a `?scenario=` URL param — base64url of a compact JSON shape. */
export function encodeScenarioSelection(selection: Pick<ScenarioSelection, 'substrates' | 'vendors' | 'hours'>): string {
  const payload: ShareablePayload = { s: selection.substrates, v: selection.vendors, h: selection.hours }
  return base64UrlEncode(JSON.stringify(payload))
}

/**
 * Decodes a `?scenario=` value against this analysis's known ids. Never throws: an unparseable
 * payload, or one that decodes to nothing usable, returns null. Any id not in `known` is silently
 * dropped rather than rejected — a stale/foreign link degrades to "select what's still valid" (or
 * to nothing), never an error the recipient can't act on.
 */
export function decodeScenarioSelection(encoded: string, known: ScenarioKnownIds): ScenarioSelection | null {
  const json = base64UrlDecode(encoded)
  if (json === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Partial<ShareablePayload>

  const substrateSet = new Set(known.substrateIds)
  const vendorSet = new Set(known.vendorIds)
  const substrates = Array.isArray(obj.s)
    ? obj.s.filter((id): id is string => typeof id === 'string' && substrateSet.has(id))
    : []
  const vendors = Array.isArray(obj.v) ? obj.v.filter((id): id is string => typeof id === 'string' && vendorSet.has(id)) : []
  if (substrates.length === 0 && vendors.length === 0) return null

  const hours = typeof obj.h === 'number' && Number.isFinite(obj.h) ? obj.h : DEFAULT_SCENARIO_HOURS
  return { substrates, vendors, hours }
}
