// Pure timing/easing math for the Simulate cascade animation — island lights up, then vendors
// stagger in, then the counters climb. Kept separate from the RAF loop itself (in
// VendorGraphView.tsx) so the timing logic is testable without a canvas or a browser.

/** The substrate island itself lights up first, immediately. */
export const ISLAND_REVEAL_MS = 0
/** Gap between each vendor lighting up, in order. */
export const VENDOR_STAGGER_MS = 130
/** Counters start climbing only once every vendor has had a chance to light up. */
export const COUNTER_START_MS = 700
export const COUNTER_DURATION_MS = 1100
/** Total animation length — matches the "~2s" cascade the task asks for. */
export const TOTAL_CASCADE_MS = COUNTER_START_MS + COUNTER_DURATION_MS

/** Which of the ordered vendor keys have "lit up" by `elapsedMs`. */
export function revealedVendorKeys(orderedVendorKeys: string[], elapsedMs: number): Set<string> {
  const revealed = new Set<string>()
  orderedVendorKeys.forEach((key, i) => {
    if (elapsedMs >= i * VENDOR_STAGGER_MS) revealed.add(key)
  })
  return revealed
}

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/** Eased 0 -> target climb for a single counter, starting only after COUNTER_START_MS. */
export function counterValueAt(elapsedMs: number, target: number): number {
  if (elapsedMs <= COUNTER_START_MS) return 0
  const t = Math.min(1, (elapsedMs - COUNTER_START_MS) / COUNTER_DURATION_MS)
  return target * easeOutQuad(t)
}

export function isCascadeComplete(elapsedMs: number): boolean {
  return elapsedMs >= TOTAL_CASCADE_MS
}
