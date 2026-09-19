export interface ResolveTargetOptions {
  retries?: number
  intervalMs?: number
}

/**
 * Polls the DOM for `selector` a few times before giving up — a step's `run()` (e.g. selecting a
 * vendor, switching the graph view) often needs a render tick before its target element exists.
 * Never throws: returns null so the caller can skip the step with a console warning rather than
 * spotlight nothing or crash, per the tour's "only real features" rule.
 */
export async function resolveTargetElement(
  selector: string,
  { retries = 10, intervalMs = 50 }: ResolveTargetOptions = {},
): Promise<Element | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const el = document.querySelector(selector)
    if (el) return el
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return null
}
