import type { VerifiedFisAction, VerifiedFisActionsFile } from '../engine/fisTemplate'

/**
 * Fetches the verified-FIS-actions static asset (scripts/verify-fis-actions.ts's output, mirrored
 * to public/fis-actions.json the same way public/substrate-verification.json is) — a static fetch,
 * never a live AWS call at runtime. Returns null on any failure; callers must treat that the same
 * as "no actions available", never fabricate a fallback list.
 */
export async function loadVerifiedFisActions(url = '/fis-actions.json'): Promise<VerifiedFisActionsFile | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as VerifiedFisActionsFile
  } catch {
    return null
  }
}

export function actionsList(file: VerifiedFisActionsFile | null): VerifiedFisAction[] {
  return file?.actions ?? []
}
