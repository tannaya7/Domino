export type VendorConfidence = 'high' | 'medium' | 'low'

/** Deterministic thresholds, shown verbatim in the UI tooltip — keep this string and the logic
 * below in sync if either changes. */
export const VENDOR_CONFIDENCE_RULE =
  'High: manifest dependency AND (import or env var). Medium: import only, or manifest only. Low: env var only, or hostname-in-code only.'

/**
 * Confidence is derived purely from which `detectedVia` provenance prefixes are present — no new
 * data, no fuzzy scoring, same evidence the vendor panel already shows. A manifest entry means the
 * team deliberately added the dependency; an import/env reference means it's actually used; a bare
 * hostname match is the weakest signal (could be a docs link, a copied example, a comment).
 */
export function computeVendorConfidence(detectedVia: string[]): VendorConfidence {
  const hasManifest = detectedVia.some((v) => v.startsWith('manifest:'))
  const hasImport = detectedVia.some((v) => v.startsWith('import:'))
  const hasEnv = detectedVia.some((v) => v.startsWith('env:'))
  const hasHostname = detectedVia.some((v) => v.startsWith('hostname:'))

  if (hasManifest && (hasImport || hasEnv)) return 'high'
  if (hasImport || hasManifest) return 'medium'
  if (hasEnv || hasHostname) return 'low'
  return 'low'
}

export const CONFIDENCE_LABEL: Record<VendorConfidence, string> = { high: 'High', medium: 'Medium', low: 'Low' }

export const CONFIDENCE_STYLES: Record<VendorConfidence, string> = {
  high: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  medium: 'border border-amber-500/30 bg-amber-500/10 text-amber-300',
  low: 'border border-[var(--border-subtle)] bg-white/5 text-[var(--text-muted)]',
}
