import { describe, expect, it } from 'vitest'
import type { AnalysisSnapshotSummary } from '../lib/types'
import { diffAnalyses } from './snapshotDiff'

function snapshot(overrides: Partial<AnalysisSnapshotSummary> = {}): AnalysisSnapshotSummary {
  return {
    repo: 'octocat/hello',
    sk: '2026-01-01T00:00:00.000Z#abc123',
    sha: 'abc123',
    analyzedAt: '2026-01-01T00:00:00.000Z',
    vendors: [{ id: 'stripe', substrate: ['aws'], category: 'payments' }],
    substrateShares: [{ substrate: 'aws', share: 1 }],
    tailRisk: [{ k: 2, correlated: 0.001, multiplier: 1.5 }],
    worstSingleEvent: { substrate: 'aws', vendorKeys: ['stripe'], probabilityPerYear: 0.001 },
    topCriticality: [],
    unclassifiedCount: 0,
    entrypointCount: 3,
    engineVersion: '1.0.0',
    kbVersion: 'v1',
    assumptionsHash: 'hash1',
    ...overrides,
  }
}

describe('diffAnalyses — the diff matrix', () => {
  it('identical snapshots produce an empty diff and "No material change."', () => {
    const a = snapshot()
    const b = snapshot({ sk: '2026-02-01T00:00:00.000Z#abc123', analyzedAt: '2026-02-01T00:00:00.000Z' })
    const diff = diffAnalyses(a, b)
    expect(diff.vendorsAdded).toEqual([])
    expect(diff.vendorsRemoved).toEqual([])
    expect(diff.substrateChanges).toEqual([])
    expect(diff.substrateShareChanges).toEqual([])
    expect(diff.tailRiskChanges).toEqual([])
    expect(diff.worstSingleEventChange.changed).toBe(false)
    expect(diff.unclassifiedDelta).toBe(0)
    expect(diff.entrypointDelta).toBe(0)
    expect(diff.verdict).toBe('No material change.')
  })

  it('detects vendors added', () => {
    const a = snapshot({ vendors: [{ id: 'stripe', substrate: ['aws'], category: 'payments' }] })
    const b = snapshot({
      vendors: [
        { id: 'stripe', substrate: ['aws'], category: 'payments' },
        { id: 'sentry', substrate: ['gcp'], category: 'observability' },
        { id: 'datadog', substrate: ['aws'], category: 'observability' },
      ],
    })
    const diff = diffAnalyses(a, b)
    expect(diff.vendorsAdded).toEqual(['datadog', 'sentry'])
    expect(diff.vendorsRemoved).toEqual([])
    expect(diff.verdict).toContain('2 vendors added')
  })

  it('detects vendors removed, correctly pluralized for exactly 1', () => {
    const a = snapshot({
      vendors: [
        { id: 'stripe', substrate: ['aws'], category: 'payments' },
        { id: 'sentry', substrate: ['gcp'], category: 'observability' },
      ],
    })
    const b = snapshot({ vendors: [{ id: 'stripe', substrate: ['aws'], category: 'payments' }] })
    const diff = diffAnalyses(a, b)
    expect(diff.vendorsRemoved).toEqual(['sentry'])
    expect(diff.verdict).toContain('1 vendor removed')
  })

  it('detects a substrate change on a vendor present in both snapshots', () => {
    const a = snapshot({ vendors: [{ id: 'sendgrid', substrate: ['azure'], category: 'email' }] })
    const b = snapshot({ vendors: [{ id: 'sendgrid', substrate: ['aws'], category: 'email' }] })
    const diff = diffAnalyses(a, b)
    expect(diff.substrateChanges).toEqual([{ id: 'sendgrid', from: ['azure'], to: ['aws'] }])
  })

  it('computes per-substrate share changes, including a substrate that appears/disappears entirely', () => {
    const a = snapshot({ substrateShares: [{ substrate: 'aws', share: 0.4 }, { substrate: 'gcp', share: 0.6 }] })
    const b = snapshot({ substrateShares: [{ substrate: 'aws', share: 0.62 }, { substrate: 'azure', share: 0.38 }] })
    const diff = diffAnalyses(a, b)
    expect(diff.substrateShareChanges).toHaveLength(3)
    const aws = diff.substrateShareChanges.find((c) => c.substrate === 'aws')!
    expect(aws.from).toBeCloseTo(0.4)
    expect(aws.to).toBeCloseTo(0.62)
    expect(aws.delta).toBeCloseTo(0.22)
    const gcp = diff.substrateShareChanges.find((c) => c.substrate === 'gcp')!
    expect(gcp.from).toBeCloseTo(0.6)
    expect(gcp.to).toBe(0) // disappeared entirely -> treated as 0, not omitted
    const azure = diff.substrateShareChanges.find((c) => c.substrate === 'azure')!
    expect(azure.from).toBe(0) // appeared from nothing
    expect(azure.to).toBeCloseTo(0.38)
  })

  it('the verdict names the single biggest share move, matching the task\'s own example shape', () => {
    const a = snapshot({ substrateShares: [{ substrate: 'aws', share: 0.4 }] })
    const b = snapshot({ substrateShares: [{ substrate: 'aws', share: 0.62 }] })
    const diff = diffAnalyses(a, b)
    expect(diff.verdict).toBe('aws share rose 40% -> 62%')
  })

  it('verdict combines a share move and a vendor-count change in one sentence, semicolon-joined', () => {
    const a = snapshot({
      vendors: [{ id: 'stripe', substrate: ['aws'], category: 'payments' }],
      substrateShares: [{ substrate: 'aws', share: 0.4 }],
    })
    const b = snapshot({
      vendors: [
        { id: 'stripe', substrate: ['aws'], category: 'payments' },
        { id: 'sentry', substrate: ['aws'], category: 'observability' },
        { id: 'datadog', substrate: ['aws'], category: 'observability' },
        { id: 'slack', substrate: ['aws'], category: 'messaging' },
      ],
      substrateShares: [{ substrate: 'aws', share: 0.62 }],
    })
    const diff = diffAnalyses(a, b)
    expect(diff.verdict).toBe('aws share rose 40% -> 62%; 3 vendors added')
  })

  it('a falling share is described as "fell", not "rose"', () => {
    const a = snapshot({ substrateShares: [{ substrate: 'gcp', share: 0.8 }] })
    const b = snapshot({ substrateShares: [{ substrate: 'gcp', share: 0.3 }] })
    expect(diffAnalyses(a, b).verdict).toBe('gcp share fell 80% -> 30%')
  })

  it('picks the biggest share move deterministically when several substrates change', () => {
    const a = snapshot({ substrateShares: [{ substrate: 'aws', share: 0.5 }, { substrate: 'gcp', share: 0.5 }] })
    const b = snapshot({ substrateShares: [{ substrate: 'aws', share: 0.55 }, { substrate: 'gcp', share: 0.45 }] })
    // Both moved by the same magnitude (0.05) — tie-broken by substrate name ascending -> "aws".
    expect(diffAnalyses(a, b).verdict).toBe('aws share rose 50% -> 55%')
  })

  it('detects a tailRisk change at a shared k', () => {
    const a = snapshot({ tailRisk: [{ k: 2, correlated: 0.001, multiplier: 1.5 }] })
    const b = snapshot({ tailRisk: [{ k: 2, correlated: 0.004, multiplier: 6 }] })
    const diff = diffAnalyses(a, b)
    expect(diff.tailRiskChanges).toEqual([{ k: 2, correlatedFrom: 0.001, correlatedTo: 0.004, multiplierFrom: 1.5, multiplierTo: 6 }])
  })

  it('ignores a k present in only one snapshot (nothing to diff)', () => {
    const a = snapshot({ tailRisk: [{ k: 2, correlated: 0.001, multiplier: 1.5 }] })
    const b = snapshot({ tailRisk: [{ k: 2, correlated: 0.001, multiplier: 1.5 }, { k: 3, correlated: 0.0001, multiplier: 8 }] })
    expect(diffAnalyses(a, b).tailRiskChanges).toEqual([])
  })

  it('detects a worstSingleEvent substrate change', () => {
    const a = snapshot({ worstSingleEvent: { substrate: 'aws', vendorKeys: ['stripe'], probabilityPerYear: 0.001 } })
    const b = snapshot({ worstSingleEvent: { substrate: 'gcp', vendorKeys: ['sentry'], probabilityPerYear: 0.002 } })
    expect(diffAnalyses(a, b).worstSingleEventChange.changed).toBe(true)
  })

  it('detects worstSingleEvent going from present to null and vice versa', () => {
    const a = snapshot({ worstSingleEvent: { substrate: 'aws', vendorKeys: ['stripe'], probabilityPerYear: 0.001 } })
    const b = snapshot({ worstSingleEvent: null })
    expect(diffAnalyses(a, b).worstSingleEventChange.changed).toBe(true)
    expect(diffAnalyses(b, a).worstSingleEventChange.changed).toBe(true)
  })

  it('does not flag worstSingleEvent as changed when vendorKeys are the same set in a different order', () => {
    const a = snapshot({ worstSingleEvent: { substrate: 'aws', vendorKeys: ['stripe', 'sentry'], probabilityPerYear: 0.001 } })
    const b = snapshot({ worstSingleEvent: { substrate: 'aws', vendorKeys: ['sentry', 'stripe'], probabilityPerYear: 0.001 } })
    expect(diffAnalyses(a, b).worstSingleEventChange.changed).toBe(false)
  })

  it('computes unclassifiedDelta honestly, and null when either side never scanned', () => {
    expect(diffAnalyses(snapshot({ unclassifiedCount: 2 }), snapshot({ unclassifiedCount: 5 })).unclassifiedDelta).toBe(3)
    expect(diffAnalyses(snapshot({ unclassifiedCount: null }), snapshot({ unclassifiedCount: 5 })).unclassifiedDelta).toBeNull()
    expect(diffAnalyses(snapshot({ unclassifiedCount: 2 }), snapshot({ unclassifiedCount: null })).unclassifiedDelta).toBeNull()
  })

  it('computes entrypointDelta (can be negative)', () => {
    expect(diffAnalyses(snapshot({ entrypointCount: 5 }), snapshot({ entrypointCount: 3 })).entrypointDelta).toBe(-2)
  })

  it('warns when engineVersion differs, and says so is not a repo change', () => {
    const diff = diffAnalyses(snapshot({ engineVersion: '1.0.0' }), snapshot({ engineVersion: '1.1.0' }))
    expect(diff.engineVersionChanged).toBe(true)
    expect(diff.warnings.some((w) => w.includes('engineVersion') && w.includes('not a repo change'))).toBe(true)
  })

  it('warns when kbVersion differs', () => {
    const diff = diffAnalyses(snapshot({ kbVersion: 'v1' }), snapshot({ kbVersion: 'v2' }))
    expect(diff.kbVersionChanged).toBe(true)
    expect(diff.warnings.some((w) => w.includes('kbVersion'))).toBe(true)
  })

  it('no warnings when engineVersion and kbVersion both match', () => {
    expect(diffAnalyses(snapshot(), snapshot()).warnings).toEqual([])
  })
})
