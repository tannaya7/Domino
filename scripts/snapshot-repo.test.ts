import { describe, expect, it } from 'vitest'
import { checkScanIsGoodEnoughToSnapshot, SnapshotRefusedError } from './snapshot-repo'
import type { AnalyzeRepoResult } from '../server/src/repoParser'

function fixtureResult(overrides: Partial<AnalyzeRepoResult> = {}): AnalyzeRepoResult {
  return {
    graph: { nodes: [], edges: [] },
    truncated: false,
    filesScanned: 100,
    filesSelected: 100,
    vendors: [],
    iacSubstrates: [],
    entrypoints: [],
    importResolution: { total: 0, resolved: 0 },
    unclassified: { packages: [], envVars: [], hosts: [], totalCount: 0 },
    own: { regions: [], findings: [], unresolved: [], filesScanned: 0 },
    owner: 'octocat',
    repo: 'hello',
    branch: 'main',
    ...overrides,
  }
}

describe('checkScanIsGoodEnoughToSnapshot', () => {
  it('accepts a full, untruncated scan', () => {
    expect(() => checkScanIsGoodEnoughToSnapshot(fixtureResult())).not.toThrow()
  })

  it('accepts a mildly truncated scan at or above the 90% floor', () => {
    const result = fixtureResult({ filesScanned: 95, filesSelected: 100, truncated: true, truncatedReason: 'time_budget' })
    expect(() => checkScanIsGoodEnoughToSnapshot(result)).not.toThrow()
  })

  it('refuses a scan below the 90% floor, naming the reason', () => {
    const result = fixtureResult({ filesScanned: 40, filesSelected: 100, truncated: true, truncatedReason: 'time_budget' })
    expect(() => checkScanIsGoodEnoughToSnapshot(result)).toThrow(SnapshotRefusedError)
    expect(() => checkScanIsGoodEnoughToSnapshot(result)).toThrow(/40 of 100/)
    expect(() => checkScanIsGoodEnoughToSnapshot(result)).toThrow(/time_budget/)
  })

  it('refuses a scan capped at the file limit that also fell short on fetching', () => {
    const result = fixtureResult({ filesScanned: 80, filesSelected: 1500, truncated: true, truncatedReason: 'file_cap' })
    expect(() => checkScanIsGoodEnoughToSnapshot(result)).toThrow(SnapshotRefusedError)
  })

  it('never divides by zero for a repo with no selected files', () => {
    const result = fixtureResult({ filesScanned: 0, filesSelected: 0 })
    expect(() => checkScanIsGoodEnoughToSnapshot(result)).not.toThrow()
  })
})
