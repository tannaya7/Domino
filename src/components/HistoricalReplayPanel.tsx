import type { HistoricalOutage } from '../data/historicalOutages'
import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import Panel from './ui/Panel'

interface HistoricalReplayPanelProps {
  outage: HistoricalOutage
  affectedVendorCount: number
  totalVendorCount: number
  affectedEntrypointCount: number
  totalEntrypointCount: number
  /** null when no cost-per-hour assumption is set — shown as "not estimated", never a fabricated $0. */
  estimatedExposure: number | null
  currency: Currency
}

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`
  const wholeHours = Math.floor(hours)
  const minutes = Math.round((hours - wholeHours) * 60)
  return minutes > 0 ? `${wholeHours}h ${minutes}m` : `${wholeHours}h`
}

/**
 * "If this had happened to your repo": replays a real, sourced outage against THIS repo's own
 * vendor/file graph using the same simulate + cascade machinery as the generic preset scenarios
 * (see availability.ts HISTORICAL_REPLAY_SCENARIOS and affectedEntrypointsForScenario) — never a
 * second, parallel computation. The only new arithmetic here is the exposure estimate, which is a
 * plain multiplication (cost/hr x the postmortem's own duration), not a probability model.
 */
function HistoricalReplayPanel({
  outage,
  affectedVendorCount,
  totalVendorCount,
  affectedEntrypointCount,
  totalEntrypointCount,
  estimatedExposure,
  currency,
}: HistoricalReplayPanelProps) {
  return (
    <Panel title="Replay: a real outage" subtitle={outage.name}>
      <div className="space-y-2">
        <p className="text-sm text-[var(--text-primary)]">
          If this had happened to your repo:{' '}
          <span className="font-semibold">
            {affectedVendorCount}/{totalVendorCount} vendors down
          </span>
          ,{' '}
          <span className="font-semibold">
            {affectedEntrypointCount}/{totalEntrypointCount} entrypoints affected
          </span>
          {estimatedExposure !== null && (
            <>
              , ~<span className="font-semibold">{formatCurrency(estimatedExposure, currency)}</span> at your
              assumptions
            </>
          )}
          .
        </p>

        <p className="text-xs text-[var(--text-secondary)]">
          {outage.date} &middot; {formatDuration(outage.approxDurationHours)} &middot; {outage.scope} &middot;{' '}
          {outage.summary}
        </p>

        {!outage.verified && (
          <p className="text-xs text-[var(--status-warning)]" role="alert">
            This outage's duration is not yet independently verified against a primary source — treat it as
            provisional.
          </p>
        )}

        <a
          href={outage.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs font-medium text-[var(--accent-strong)] hover:underline"
        >
          Read the postmortem →
        </a>

        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          Hypothetical replay based on public postmortems, not a measurement of your app. Modeled estimate under
          your assumptions — never a guarantee.
        </p>
      </div>
    </Panel>
  )
}

export default HistoricalReplayPanel
