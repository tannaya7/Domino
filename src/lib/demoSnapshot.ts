import type { AnalyzeRepoResponse } from './api'

export interface DemoSnapshot extends Omit<AnalyzeRepoResponse, 'unclassified'> {
  owner: string
  repo: string
  branch: string
  commitSha: string
  generatedAt: string
  riskSummary: { subject: string; text: string } | null
  /** Optional, not required like the live response's — a snapshot file is a static artifact that
   * can predate this field (regenerating one needs a real GitHub scan, which can itself get
   * rate-limited/throttled). Absent means "not computed for this snapshot", same honest meaning as
   * AnalyzedRepo.unclassified === null elsewhere — never treated as "checked, found zero". */
  unclassified?: AnalyzeRepoResponse['unclassified']
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
