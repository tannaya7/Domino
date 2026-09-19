/** One step of the guided tour. `caption` is a fully-resolved string (computed once, from real
 * analyzed data, when the tour is built) — never a template re-evaluated live, so what the tour
 * says always matches what was true when it started, even if the underlying data is mutated by a
 * step's own `run()` (e.g. step 4 running a scenario). `targetSelector: null` means no spotlight
 * (the overlay just dims the screen and shows the caption bar). */
export interface TourStep {
  id: string
  targetSelector: string | null
  caption: string
  dwellMs: number
  run?: () => void
}

export type TourStatus = 'idle' | 'playing' | 'paused'
