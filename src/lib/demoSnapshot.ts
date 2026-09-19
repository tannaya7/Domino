import type { AnalyzeRepoResponse } from './api'

export interface DemoSnapshot extends AnalyzeRepoResponse {
  owner: string
  repo: string
  branch: string
  commitSha: string
  generatedAt: string
  riskSummary: { subject: string; text: string } | null
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
