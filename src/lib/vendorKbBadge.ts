import type { VendorKbEntry } from './types'

export interface SubstrateBadge {
  label: string
  style: string
  /** First evidence URL, when confidence is verified/reported and evidence exists. */
  href?: string
}

const VERIFIED_STYLE = 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
const REPORTED_STYLE = 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
const UNVERIFIED_STYLE = 'border border-[var(--border-subtle)] bg-white/5 text-[var(--text-muted)]'

/**
 * One badge per substrate entry: "aws (verified)" [linked to its evidence], "azure (reported)"
 * [linked], or plain "unverified" for confidence=unknown (never repeating a value nobody actually
 * confirmed). `kb` is undefined when this vendor has no knowledge-base record at all (shouldn't
 * happen for anything in VENDOR_MAP today, but every detected vendor still gets an honest badge).
 */
export function formatSubstrateBadges(kb: VendorKbEntry | undefined): SubstrateBadge[] {
  if (!kb || kb.substrate.length === 0) return [{ label: 'unverified', style: UNVERIFIED_STYLE }]

  return kb.substrate.map((s) => {
    if (s.confidence === 'verified') {
      return { label: `${s.value} (verified)`, style: VERIFIED_STYLE, href: s.evidence[0]?.url }
    }
    if (s.confidence === 'reported') {
      return { label: `${s.value} (reported)`, style: REPORTED_STYLE, href: s.evidence[0]?.url }
    }
    return { label: 'unverified', style: UNVERIFIED_STYLE }
  })
}
