import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import type { AvailabilityHeadline, ExactAvailabilityResult, Vendor } from '../lib/types'
import { computeVendorConfidence } from '../lib/vendorConfidence'
import type { SubstrateVerificationSummary } from '../lib/substrateVerification'

interface VendorHeadlineCardProps {
  headline: AvailabilityHeadline
  result: ExactAvailabilityResult
  currency: Currency
  vendors: Vendor[]
  /** Count of external dependencies found but not in the curated vendor knowledge base — see
   * findUnclassifiedDependencies. 0/undefined renders nothing (never implies "we checked and found
   * none" when unclassified scanning wasn't run for this analysis, e.g. a demo snapshot). */
  unclassifiedCount?: number
  /** "Verified by DNS for N of M vendors; K conflicts; J inconclusive" — undefined when verification
   * data hasn't loaded (or doesn't apply), which renders nothing rather than implying zero
   * conflicts. Curated substrates are still what every number above is computed from — this line
   * never changes that. */
  substrateVerificationSummary?: SubstrateVerificationSummary
  onWhyVendorsSubstrates?: () => void
  onWhyExpectedLoss?: () => void
}

function WhyButton({ onClick, label }: { onClick?: () => void; label: string }) {
  if (!onClick) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="text-[var(--text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      why?
    </button>
  )
}

/** Share of correlated downtime that comes from substrate risk a vendor's own SLA doesn't
 * capture — clamped for display; a pathological override could otherwise push this outside [0,100]. */
function hiddenSharePercent(headline: AvailabilityHeadline, result: ExactAvailabilityResult): number {
  const correlatedHours = result.expectedDowntimeHoursPerYear.correlated
  if (correlatedHours <= 0) return 0
  return Math.max(0, Math.min(100, (headline.hiddenUpstreamHoursPerYear / correlatedHours) * 100))
}

function VendorHeadlineCard({
  headline,
  result,
  currency,
  vendors,
  unclassifiedCount,
  substrateVerificationSummary,
  onWhyVendorsSubstrates,
  onWhyExpectedLoss,
}: VendorHeadlineCardProps) {
  if (headline.vendors === 0) return null

  const graceful = headline.vendors <= 1
  const substrateName = headline.worstSingleEvent?.substrate
  const highConfidenceCount = vendors.filter((v) => computeVendorConfidence(v.detectedVia) === 'high').length

  return (
    <div className="panel-glass animate-rise-in rounded-xl px-4 py-3" role="status">
      {graceful ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {headline.vendors} vendor on {headline.substrates} substrate{headline.substrates === 1 ? '' : 's'}
          {substrateName ? ` (${substrateName})` : ''}
          {headline.substrates === 0 && ' — self-hosted/unknown hosting'}, no shared infrastructure detected.
        </p>
      ) : headline.substrates === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {headline.vendors} vendors, no shared infrastructure detected (self-hosted/unknown hosting).
        </p>
      ) : (
        <p className="text-sm text-[var(--text-primary)]">
          <span className="font-semibold">{headline.vendors} vendors</span>
          <span className="text-[var(--text-muted)]"> → </span>
          <span className="font-semibold">{headline.substrates} substrates</span>{' '}
          <WhyButton onClick={onWhyVendorsSubstrates} label="Why this vendor/substrate count?" />
          <span className="text-[var(--text-muted)]"> · </span>
          <span
            title="Share of expected downtime coming from substrate (hosting) risk that a vendor's own SLA number doesn't capture."
          >
            {hiddenSharePercent(headline, result).toFixed(0)}% of expected downtime is invisible to SLA math
          </span>
          <span className="text-[var(--text-muted)]"> · </span>
          <span>~{formatCurrency(headline.expectedLossPerYear, currency)}/yr at your assumptions</span>{' '}
          <WhyButton onClick={onWhyExpectedLoss} label="Why this expected annual loss?" />
        </p>
      )}
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--text-muted)]">
        <span title="High confidence: a manifest dependency AND (an import or an env var). See the risk register for the full rule.">
          {highConfidenceCount} high-confidence
        </span>
        {!!unclassifiedCount && (
          <span
            className="font-medium text-amber-300"
            title="External dependencies found in this repo that aren't in our curated vendor knowledge base — see the Unclassified dependencies panel."
          >
            +{unclassifiedCount} unclassified
          </span>
        )}
        {substrateVerificationSummary && (
          <span
            className={substrateVerificationSummary.conflictCount > 0 ? 'font-medium text-amber-300' : undefined}
            title="Independent DNS + published-IP-range evidence for curated substrate tags — informational only, never automatically applied. See docs/substrate-verification.md."
          >
            Verified by DNS for {substrateVerificationSummary.verifiedCount} of {substrateVerificationSummary.totalCount} vendors
            {substrateVerificationSummary.conflictCount > 0 ? `; ${substrateVerificationSummary.conflictCount} conflict(s)` : ''}
            {substrateVerificationSummary.inconclusiveCount > 0 ? `; ${substrateVerificationSummary.inconclusiveCount} inconclusive` : ''}
          </span>
        )}
      </p>
    </div>
  )
}

export default VendorHeadlineCard
