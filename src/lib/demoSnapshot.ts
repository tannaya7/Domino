import type { AnalyzeRepoResponse } from './api'
import type { RecommendedMove, WhatIfResult } from './types'

export interface DemoSnapshot extends AnalyzeRepoResponse {
  owner: string
  repo: string
  branch: string
  commitSha: string
  generatedAt: string
  riskSummary: { subject: string; text: string } | null
  /**
   * Precomputed by scripts/snapshot-repo.ts using the SAME deterministic ranking
   * (server/src/whatIf.ts `rankRecommendedMoves`) a live /simulate call would return — baked in so
   * the guided tour (src/tour/) can show a real "recommended move" step with the API down. Only
   * curated-vendor-map-dependent data needs this; everything else the tour shows (vendor/substrate
   * counts, the headline, a scenario cascade) is already pure/client-computable, see
   * src/lib/offlineSimulate.ts. Optional/undefined on older or hand-authored snapshots — the tour
   * skips that one step rather than fabricating a recommendation.
   */
  topRecommendedMove?: RecommendedMove
  /** The exact baseline/mitigated/delta for `topRecommendedMove`, precomputed the same way. */
  topRecommendedMoveWhatIf?: WhatIfResult
}

export class DemoSnapshotError extends Error {}

/** Fetches a pre-generated demo snapshot from public/demo/ — same-origin static asset, not the
 * live GitHub/analysis backend. This is the one network call an example card makes, and it can't
 * hit GitHub rate limits, a private-repo 404, or a cold Lambda: it's just a static file. */
export async function loadDemoSnapshot(file: string): Promise<DemoSnapshot> {
  let res: Response
  try {
    res = await fetch(file)
  } catch {
    throw new DemoSnapshotError(`Could not load the example snapshot at ${file}.`)
  }
  if (!res.ok) throw new DemoSnapshotError(`Example snapshot ${file} is missing (${res.status}).`)
  return (await res.json()) as DemoSnapshot
}
