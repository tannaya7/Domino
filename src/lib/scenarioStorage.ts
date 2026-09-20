import type { ScenarioSelection } from '../engine/scenario'

export interface SavedScenario {
  id: string
  name: string
  selection: ScenarioSelection
  savedAt: string
}

const MAX_SAVED_SCENARIOS = 5

function storageKey(repoUrl: string | null): string {
  return `blast-radius:scenarios:v1:${repoUrl ?? 'default'}`
}

function isValidSelection(value: unknown): value is ScenarioSelection {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.substrates) &&
    v.substrates.every((s) => typeof s === 'string') &&
    Array.isArray(v.vendors) &&
    v.vendors.every((s) => typeof s === 'string') &&
    typeof v.hours === 'number' &&
    Number.isFinite(v.hours)
  )
}

function isValidSavedScenario(value: unknown): value is SavedScenario {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.savedAt === 'string' && isValidSelection(v.selection)
}

/** Best-effort read — same defensive try/catch as useAvailabilityAssumptions.ts. Any corrupt or
 * unexpected-shape entry is dropped rather than thrown on, since this is convenience state, not
 * anything the app depends on for correctness. */
export function loadSavedScenarios(repoUrl: string | null): SavedScenario[] {
  try {
    const raw = localStorage.getItem(storageKey(repoUrl))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidSavedScenario)
  } catch {
    return []
  }
}

/** Saves a new named scenario, keeping at most MAX_SAVED_SCENARIOS (5) — drops the oldest by
 * `savedAt` once already at the cap. Best-effort write: failures (private browsing, quota) are
 * silently ignored, same as useAvailabilityAssumptions.ts. */
export function saveScenario(repoUrl: string | null, name: string, selection: ScenarioSelection): SavedScenario[] {
  const existing = loadSavedScenarios(repoUrl)
  const entry: SavedScenario = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name,
    selection,
    savedAt: new Date().toISOString(),
  }
  let updated = [...existing, entry]
  if (updated.length > MAX_SAVED_SCENARIOS) {
    updated = [...updated].sort((a, b) => a.savedAt.localeCompare(b.savedAt)).slice(updated.length - MAX_SAVED_SCENARIOS)
  }
  try {
    localStorage.setItem(storageKey(repoUrl), JSON.stringify(updated))
  } catch {
    /* best-effort only */
  }
  return updated
}

export function deleteScenario(repoUrl: string | null, id: string): SavedScenario[] {
  const updated = loadSavedScenarios(repoUrl).filter((s) => s.id !== id)
  try {
    localStorage.setItem(storageKey(repoUrl), JSON.stringify(updated))
  } catch {
    /* best-effort only */
  }
  return updated
}
