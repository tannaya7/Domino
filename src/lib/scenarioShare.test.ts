import { describe, expect, it } from 'vitest'
import type { ScenarioKnownIds } from '../engine/scenario'
import { decodeScenarioSelection, encodeScenarioSelection } from './scenarioShare'

const known: ScenarioKnownIds = { substrateIds: ['aws', 'gcp'], vendorIds: ['stripe', 'sendgrid'] }

describe('encodeScenarioSelection / decodeScenarioSelection — URL round-trip', () => {
  it('round-trips a selection through encode -> decode unchanged', () => {
    const selection = { substrates: ['aws'], vendors: ['stripe'], hours: 6.5 }
    const encoded = encodeScenarioSelection(selection)
    expect(decodeScenarioSelection(encoded, known)).toEqual(selection)
  })

  it('round-trips an empty-substrates, vendors-only selection', () => {
    const selection = { substrates: [], vendors: ['stripe', 'sendgrid'], hours: 1 }
    expect(decodeScenarioSelection(encodeScenarioSelection(selection), known)).toEqual(selection)
  })

  it('produces a URL-safe string (no +, /, or = padding)', () => {
    const encoded = encodeScenarioSelection({ substrates: ['aws', 'gcp'], vendors: ['stripe', 'sendgrid'], hours: 100.25 })
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('drops unknown ids instead of failing the whole decode', () => {
    const encoded = encodeScenarioSelection({ substrates: ['aws', 'azure'], vendors: ['stripe', 'made-up'], hours: 4 })
    expect(decodeScenarioSelection(encoded, known)).toEqual({ substrates: ['aws'], vendors: ['stripe'], hours: 4 })
  })

  it('returns null when every id in the payload is unknown', () => {
    const encoded = encodeScenarioSelection({ substrates: ['azure'], vendors: ['made-up'], hours: 4 })
    expect(decodeScenarioSelection(encoded, known)).toBeNull()
  })

  it('returns null for garbage input rather than throwing', () => {
    expect(decodeScenarioSelection('not-valid-base64url!!!', known)).toBeNull()
    expect(decodeScenarioSelection('', known)).toBeNull()
  })

  it('falls back to the default duration when hours is missing or invalid in the payload', () => {
    const encoded = encodeScenarioSelection({ substrates: ['aws'], vendors: [], hours: NaN })
    expect(decodeScenarioSelection(encoded, known)?.hours).toBeGreaterThan(0)
  })
})
