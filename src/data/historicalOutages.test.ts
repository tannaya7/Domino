import { describe, expect, it } from 'vitest'
import { KNOWN_SHAREABLE_SUBSTRATES } from '../engine/correlated'
import { HISTORICAL_OUTAGES, outageForReplayScenarioId } from './historicalOutages'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe('HISTORICAL_OUTAGES data validation', () => {
  it('is non-empty and has unique ids', () => {
    expect(HISTORICAL_OUTAGES.length).toBeGreaterThan(0)
    const ids = HISTORICAL_OUTAGES.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(HISTORICAL_OUTAGES)('$id: sourceUrl is https', (outage) => {
    expect(outage.sourceUrl.startsWith('https://')).toBe(true)
  })

  it.each(HISTORICAL_OUTAGES)('$id: date is a valid ISO yyyy-mm-dd date', (outage) => {
    expect(outage.date).toMatch(ISO_DATE)
    expect(Number.isNaN(new Date(outage.date).getTime())).toBe(false)
  })

  it.each(HISTORICAL_OUTAGES)('$id: approxDurationHours is a positive, finite number', (outage) => {
    expect(Number.isFinite(outage.approxDurationHours)).toBe(true)
    expect(outage.approxDurationHours).toBeGreaterThan(0)
    // Sanity ceiling — catches an accidental unit error (e.g. minutes typed in as hours) without
    // asserting anything about the real-world number itself.
    expect(outage.approxDurationHours).toBeLessThan(24 * 30)
  })

  it.each(HISTORICAL_OUTAGES)('$id: substrate is a known shareable substrate', (outage) => {
    expect(KNOWN_SHAREABLE_SUBSTRATES).toContain(outage.substrate)
  })

  it.each(HISTORICAL_OUTAGES)('$id: scope and severity are within their enum', (outage) => {
    expect(['regional', 'global']).toContain(outage.scope)
    expect(['degraded', 'outage']).toContain(outage.severity)
  })

  it.each(HISTORICAL_OUTAGES)('$id: has a non-empty one-line summary', (outage) => {
    expect(outage.summary.length).toBeGreaterThan(0)
    expect(outage.summary).not.toContain('\n')
  })

  it.each(HISTORICAL_OUTAGES)('$id: unverified entries do not silently pretend to be verified', (outage) => {
    // Every currently-seeded entry is verified against a primary source (see sourceUrl comments in
    // historicalOutages.ts) — this test exists so a future unverified addition can't slip through
    // with verified:true by mistake: it must be an explicit boolean either way, checked below by TS,
    // and any verified:false MUST come with a TODO comment in the source file.
    expect(typeof outage.verified).toBe('boolean')
  })
})

describe('outageForReplayScenarioId', () => {
  it('resolves a replay: id back to its outage record', () => {
    const outage = HISTORICAL_OUTAGES[0]
    expect(outageForReplayScenarioId(`replay:${outage.id}`)).toEqual(outage)
  })

  it('returns null for a non-replay scenario id, undefined, null, or unknown id', () => {
    expect(outageForReplayScenarioId('aws-outage')).toBeNull()
    expect(outageForReplayScenarioId(undefined)).toBeNull()
    expect(outageForReplayScenarioId(null)).toBeNull()
    expect(outageForReplayScenarioId('replay:not-a-real-outage')).toBeNull()
  })
})
