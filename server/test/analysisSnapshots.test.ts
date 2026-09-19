import { beforeEach, describe, expect, it } from 'vitest'
import type { AnalysisSnapshotSummary } from '../../src/lib/types'
import {
  assertWithinSizeCap,
  buildSnapshotSummary,
  clearSnapshotStore,
  getHistory,
  getSnapshotBySk,
  saveSnapshot,
  SnapshotTooLargeError,
  summaryByteSize,
  type BuildSnapshotSummaryInput,
} from '../src/analysisSnapshots'

beforeEach(() => clearSnapshotStore())

function baseInput(overrides: Partial<BuildSnapshotSummaryInput> = {}): BuildSnapshotSummaryInput {
  return {
    repo: 'octocat/hello',
    sha: 'abc123',
    vendors: [{ key: 'stripe', vendor: 'Stripe', tier: 'payments', substrate: ['aws'], sla: 0.999, detectedVia: [], detectedInFiles: [] }],
    concentration: { vendorCount: 1, substrateCount: 1, bySubstrate: [{ substrate: 'aws', vendorKeys: ['stripe'], vendorNames: ['Stripe'], share: 1 }], mostConcentrated: null },
    criticality: { entrypoints: ['src/index.ts'], articulationPoints: [], byNode: [] },
    headline: {
      vendors: 1,
      substrates: 1,
      unknownHostingVendorCount: 0,
      tailRisk: [{ k: 2, naive: 0, independentSameMarginals: 0, correlated: 0.001, multiplier: 2 }],
      hiddenUpstreamHoursPerYear: 0,
      concentrationEffectHoursPerYear: 0,
      worstSingleEvent: { substrate: 'aws', vendorKeys: ['stripe'], vendorNames: ['Stripe'], entrypointsAffected: [], probabilityPerYear: 0.001 },
      redundancyGroups: [],
      expectedLossPerYear: 0,
    },
    unclassifiedCount: 0,
    assumptionsHash: 'abc12345',
    ...overrides,
  }
}

describe('100 KB/item guard', () => {
  it('accepts a normal-sized summary', () => {
    const summary = buildSnapshotSummary(baseInput())
    expect(summaryByteSize(summary)).toBeLessThan(100_000)
    expect(() => assertWithinSizeCap(summary)).not.toThrow()
  })

  it('throws SnapshotTooLargeError (never silently truncates) for an oversized summary', () => {
    const hugeVendors = Array.from({ length: 3000 }, (_, i) => ({
      key: `vendor-${i}-${'x'.repeat(50)}`,
      vendor: `Vendor ${i}`,
      tier: 'payments' as const,
      substrate: ['aws', 'gcp', 'azure'],
      sla: 0.999,
      detectedVia: [],
      detectedInFiles: [],
    }))
    const summary = buildSnapshotSummary(baseInput({ vendors: hugeVendors }))
    expect(summaryByteSize(summary)).toBeGreaterThan(100_000)
    expect(() => assertWithinSizeCap(summary)).toThrow(SnapshotTooLargeError)
  })

  it('saveSnapshot rejects an oversized summary rather than writing a truncated one', async () => {
    const hugeVendors = Array.from({ length: 3000 }, (_, i) => ({
      key: `vendor-${i}-${'x'.repeat(50)}`,
      vendor: `Vendor ${i}`,
      tier: 'payments' as const,
      substrate: ['aws'],
      sla: 0.999,
      detectedVia: [],
      detectedInFiles: [],
    }))
    const summary = buildSnapshotSummary(baseInput({ vendors: hugeVendors, repo: 'octocat/huge' }))
    await expect(saveSnapshot(summary)).rejects.toThrow(SnapshotTooLargeError)
    expect(await getHistory('octocat/huge')).toEqual([])
  })
})

describe('cache immutability by sha', () => {
  it('a saved snapshot is retrievable byte-identical by its exact sk', async () => {
    const summary = buildSnapshotSummary(baseInput())
    await saveSnapshot(summary)
    const fetched = await getSnapshotBySk(summary.repo, summary.sk)
    expect(fetched).toEqual(summary)
  })

  it('saving a second snapshot for the same repo under a different sk never mutates the first', async () => {
    const first = buildSnapshotSummary(baseInput({ sha: 'sha-one' }))
    await saveSnapshot(first)
    const second = buildSnapshotSummary(baseInput({ sha: 'sha-two', vendors: [] }))
    await saveSnapshot(second)

    const refetchedFirst = await getSnapshotBySk(first.repo, first.sk)
    expect(refetchedFirst).toEqual(first)
    expect(refetchedFirst!.sha).toBe('sha-one')
  })

  it('two snapshots for the same sha but taken at different times get distinct, independently retrievable sk keys', async () => {
    const a = buildSnapshotSummary(baseInput({ sha: 'same-sha' }))
    await saveSnapshot(a)
    await new Promise((r) => setTimeout(r, 2))
    const b = buildSnapshotSummary(baseInput({ sha: 'same-sha', vendors: [] }))
    await saveSnapshot(b)

    expect(a.sk).not.toBe(b.sk)
    expect(await getSnapshotBySk(a.repo, a.sk)).toEqual(a)
    expect(await getSnapshotBySk(b.repo, b.sk)).toEqual(b)
  })

  it('getSnapshotBySk returns null (never a wrong snapshot) for an sk that was never saved', async () => {
    await saveSnapshot(buildSnapshotSummary(baseInput()))
    expect(await getSnapshotBySk('octocat/hello', 'not-a-real-sk')).toBeNull()
  })
})

describe('getHistory', () => {
  it('returns snapshots newest-first', async () => {
    const first = buildSnapshotSummary(baseInput({ repo: 'octocat/order-test' }))
    await saveSnapshot(first)
    await new Promise((r) => setTimeout(r, 2))
    const second = buildSnapshotSummary(baseInput({ repo: 'octocat/order-test', sha: 'newer' }))
    await saveSnapshot(second)

    const history = await getHistory('octocat/order-test')
    expect(history[0].sha).toBe('newer')
    expect(history[1].sha).toBe(first.sha)
  })

  it('caps at 50 even if more were saved, and clamps a larger requested limit', async () => {
    for (let i = 0; i < 55; i++) {
      await saveSnapshot(buildSnapshotSummary(baseInput({ repo: 'octocat/many', sha: `sha-${i}` })))
    }
    expect(await getHistory('octocat/many')).toHaveLength(50)
    expect(await getHistory('octocat/many', 1000)).toHaveLength(50)
  })

  it('returns [] for a repo with no snapshots', async () => {
    expect(await getHistory('octocat/never-snapshotted')).toEqual([])
  })
})

describe('buildSnapshotSummary — compact shape', () => {
  it('never includes the file graph — only the fields this task specifies', () => {
    const summary: AnalysisSnapshotSummary = buildSnapshotSummary(baseInput())
    expect(Object.keys(summary).sort()).toEqual(
      [
        'repo',
        'sk',
        'sha',
        'analyzedAt',
        'vendors',
        'substrateShares',
        'tailRisk',
        'worstSingleEvent',
        'topCriticality',
        'unclassifiedCount',
        'entrypointCount',
        'engineVersion',
        'kbVersion',
        'assumptionsHash',
      ].sort(),
    )
  })

  it('caps topCriticality at 5', () => {
    const byNode = Array.from({ length: 20 }, (_, i) => ({
      nodeId: `src/file-${i}.ts`,
      isArticulationPoint: false,
      affectedEntrypoints: [],
      orphanedNodes: [],
      entrypointCount: 1,
      reachabilityLossRatio: 1 - i * 0.01,
    }))
    const summary = buildSnapshotSummary(baseInput({ criticality: { entrypoints: [], articulationPoints: [], byNode } }))
    expect(summary.topCriticality).toHaveLength(5)
  })

  it('honestly carries unclassifiedCount as null rather than fabricating 0 when scanning did not run', () => {
    const summary = buildSnapshotSummary(baseInput({ unclassifiedCount: null }))
    expect(summary.unclassifiedCount).toBeNull()
  })
})
