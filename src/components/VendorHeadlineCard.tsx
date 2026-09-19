import { hiddenSharePercent } from '../lib/availability'
import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import type { AvailabilityHeadline, ExactAvailabilityResult } from '../lib/types'

interface VendorHeadlineCardProps {
  headline: AvailabilityHeadline
  result: ExactAvailabilityResult
  currency: Currency
}

function VendorHeadlineCard({ headline, result, currency }: VendorHeadlineCardProps) {
  if (headline.vendors === 0) return null

  const graceful = headline.vendors <= 1
  const substrateName = headline.worstSingleEvent?.substrate

  return (
    <div className="panel-glass animate-rise-in rounded-xl px-4 py-3" role="status" data-tour="headline-card">
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
          <span className="font-semibold">{headline.substrates} substrates</span>
          <span className="text-[var(--text-muted)]"> · </span>
          <span
            title="Share of expected downtime coming from substrate (hosting) risk that a vendor's own SLA number doesn't capture."
          >
            {hiddenSharePercent(headline, result).toFixed(0)}% of expected downtime is invisible to SLA math
          </span>
          <span className="text-[var(--text-muted)]"> · </span>
          <span>~{formatCurrency(headline.expectedLossPerYear, currency)}/yr at your assumptions</span>
        </p>
      )}
    </div>
  )
}

export default VendorHeadlineCard
