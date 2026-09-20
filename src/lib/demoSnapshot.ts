import type { AnalyzeRepoResponse } from './api'
import type { SubstrateVerificationData } from './substrateVerification'
import type { AnalysisSnapshotSummary, RecommendedMove, WhatIfResult } from './types'

export interface DemoSnapshot extends Omit<AnalyzeRepoResponse, 'unclassified' | 'own'> {
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
  /** Optional, not required like the live response's — a snapshot file is a static artifact that
   * can predate this field (regenerating one needs a real GitHub scan, which can itself get
   * rate-limited/throttled). Absent means "not computed for this snapshot", same honest meaning as
   * AnalyzedRepo.unclassified === null elsewhere — never treated as "checked, found zero". */
  unclassified?: AnalyzeRepoResponse['unclassified']
  /** Frozen copy of public/substrate-verification.json at the moment this snapshot was generated
   * (see scripts/snapshot-repo.ts) — the snapshot never re-fetches it live, so it always reflects
   * the DNS evidence as of `substrateVerification.generatedAt`, not whatever the script most
   * recently produced. Optional for the same reason as `unclassified` above: older snapshots
   * predate this field entirely. */
  substrateVerification?: SubstrateVerificationData
  /** Precomputed analysis-history samples for the History tab, so it works with zero network calls
   * in demo mode — see scripts/snapshot-repo.ts. Optional/absent for the same reason as the two
   * fields above: nothing here is ever fabricated just to fill the field. */
  history?: AnalysisSnapshotSummary[]
  /** Static IaC resilience linter result, frozen at snapshot time — optional/absent for the same
   * reason as the fields above: an older snapshot predates this field, and absence is never
   * treated as "scanned, found nothing". */
  own?: AnalyzeRepoResponse['own']
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
