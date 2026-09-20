import type { HostObservation, SubstrateVerdict } from '../engine/substrateEvidence'

export interface VendorVerificationResult {
  vendorKey: string
  vendor: string
  curatedSubstrate: string[]
  verdict: SubstrateVerdict
  checkedAt: string
  hosts: HostObservation[]
}

export interface SubstrateVerificationData {
  generatedAt: string
  /** False when scripts/verify-substrates.ts's Team Cymru self-test failed in that run — every
   * HostObservation.detail then honestly has no ASN line, rather than silently omitting it. */
  asnLookupAvailable: boolean
  results: VendorVerificationResult[]
}

/**
 * Fetches the offline-generated verification JSON (scripts/verify-substrates.ts's output) — a
 * static asset fetch, never a live DNS/network call at runtime. Returns null on any failure
 * (missing file, bad JSON, network hiccup) instead of throwing: this is enrichment data, and every
 * badge already has an honest "unverified" fallback for exactly this case.
 */
export async function loadSubstrateVerification(url = '/substrate-verification.json'): Promise<SubstrateVerificationData | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as SubstrateVerificationData
  } catch {
    return null
  }
}

export function indexVerificationByVendorKey(data: SubstrateVerificationData | null): Map<string, VendorVerificationResult> {
  if (!data) return new Map()
  return new Map(data.results.map((r) => [r.vendorKey, r]))
}

export interface SubstrateVerificationSummary {
  /** Verdict agrees/agrees-edge only — this is what "Verified by DNS" means; a conflict or an
   * inconclusive result is NOT "verified", even though a check was attempted. */
  verifiedCount: number
  totalCount: number
  conflictCount: number
  /** Checked (had a known global host) but neither confirmed nor contradicted — e.g. no usable DNS
   * observation, or an edge-only mismatch that isn't a proven hosting-layer conflict. */
  inconclusiveCount: number
}

/** "Verified by DNS for N of M vendors; K conflicts; J inconclusive" — N counts ONLY verdict
 * agrees/agrees-edge, matching exactly what `formatVerificationBadge` labels "DNS-verified" per
 * vendor in the register; conflicts and inconclusive results are reported separately so the
 * headline can never claim a vendor is verified while the register calls it "unverified" or
 * "differs". A vendor with no checkable host was never attempted at all, which is out of scope —
 * not counted as checked, verified, conflicting, or inconclusive. */
export function summarizeSubstrateVerification(
  data: SubstrateVerificationData | null,
  detectedVendorKeys: string[],
): SubstrateVerificationSummary | null {
  if (!data) return null
  const byKey = indexVerificationByVendorKey(data)
  const relevant = detectedVendorKeys.map((k) => byKey.get(k)).filter((r): r is VendorVerificationResult => r !== undefined)
  return {
    verifiedCount: relevant.filter((r) => r.verdict === 'agrees' || r.verdict === 'agrees-edge').length,
    totalCount: detectedVendorKeys.length,
    conflictCount: relevant.filter((r) => r.verdict === 'conflict').length,
    inconclusiveCount: relevant.filter((r) => r.verdict === 'inconclusive').length,
  }
}

export const SUBSTRATE_VERDICT_STYLES: Record<SubstrateVerdict, string> = {
  agrees: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'agrees-edge': 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  conflict: 'border border-red-500/30 bg-red-500/10 text-red-300',
  inconclusive: 'border border-[var(--border-subtle)] bg-white/5 text-[var(--text-muted)]',
}
const EDGE_MISMATCH_STYLE = 'border border-amber-500/30 bg-amber-500/10 text-amber-300'

function formatDate(iso: string): string {
  return iso.slice(0, 10) // YYYY-MM-DD — precise enough for a badge, avoids locale/timezone noise
}

/**
 * The badge text/style for one vendor. `result` is undefined when this vendor was never checked
 * (no curated global host, or not in the verification run at all) — always "unverified", never a
 * blank badge that could be misread as "checked, found nothing wrong".
 *
 * A hosting-layer mismatch (`conflict`) and an edge-layer-only mismatch (still `inconclusive` in
 * the verdict, per the "never claim an origin from an edge observation" rule) both surface as a
 * "differs: curated X, DNS shows Y[ edge]" label — the edge case just gets a softer (amber, not
 * red) style and the trailing " edge" qualifier, since it's a real discrepancy worth showing, not a
 * proven contradiction.
 */
export function formatVerificationBadge(result: VendorVerificationResult | undefined): { label: string; style: string } {
  if (!result) return { label: 'unverified', style: SUBSTRATE_VERDICT_STYLES.inconclusive }
  const date = formatDate(result.checkedAt)

  if (result.verdict === 'agrees') return { label: `DNS-verified ${date}`, style: SUBSTRATE_VERDICT_STYLES.agrees }
  if (result.verdict === 'agrees-edge') {
    return { label: `DNS-verified ${date} (edge)`, style: SUBSTRATE_VERDICT_STYLES['agrees-edge'] }
  }

  const curated = new Set(result.curatedSubstrate.map((s) => s.toLowerCase()))
  const mismatchHosting = result.hosts.find(
    (h) => h.layer === 'hosting' && h.observedProvider && !curated.has(h.observedProvider.toLowerCase()),
  )
  const mismatchEdge = result.hosts.find((h) => h.layer === 'edge' && h.observedProvider && !curated.has(h.observedProvider.toLowerCase()))
  const mismatch = mismatchHosting ?? mismatchEdge
  if (mismatch) {
    const curatedLabel = result.curatedSubstrate.join('/') || 'none'
    return {
      label: `differs: curated ${curatedLabel}, DNS shows ${mismatch.observedProvider}${mismatch.layer === 'edge' ? ' edge' : ''}`,
      style: mismatchHosting ? SUBSTRATE_VERDICT_STYLES.conflict : EDGE_MISMATCH_STYLE,
    }
  }

  return { label: 'unverified', style: SUBSTRATE_VERDICT_STYLES.inconclusive }
}
