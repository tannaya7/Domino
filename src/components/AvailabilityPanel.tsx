import type { SimulateResponse } from '../lib/api'
import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import Panel from './ui/Panel'
import Spinner from './ui/Spinner'
import StatTile from './ui/StatTile'

interface AvailabilityPanelProps {
  simulation: SimulateResponse | null
  isLoading: boolean
  error: string | null
  currency: Currency
  onRun: () => void
  /** Opens the FIS "Validate this in your account" modal for the AZ-disruption scenario, scoped
   * to the vendors behind the worst single event. Omitted (no button) when there's nothing to
   * scope a real experiment to yet. */
  onValidateInAccount?: () => void
}

const formatPercent = (n: number) => `${n.toFixed(2)}%`
const formatHours = (n: number) => `${n.toFixed(1)} hrs/yr`

function formatSmallPercent(n: number): string {
  const pct = n * 100
  if (pct === 0) return '0%'
  if (pct < 0.01) return '<0.01%'
  return `${pct.toFixed(2)}%`
}

function formatMultiplier(n: number): string {
  return n >= 1000 ? '>1,000x' : `${n.toFixed(1)}x`
}

function AvailabilityPanel({ simulation, isLoading, error, currency, onRun, onValidateInAccount }: AvailabilityPanelProps) {
  const formatMoney = (n: number) => (n > 0 ? `${formatCurrency(n, currency)}/yr` : 'not estimated')

  return (
    <Panel
      title="Availability"
      subtitle="Naive (independent) vs. correlated (shared-substrate) model — exact, not sampled. Estimates, not guarantees."
      action={
        <button
          type="button"
          onClick={onRun}
          disabled={isLoading}
          className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
        >
          {isLoading ? <Spinner className="h-3 w-3" /> : simulation ? 'Re-run' : 'Run'}
        </button>
      }
    >
      {error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {!simulation && !isLoading && !error && (
        <p className="text-sm text-[var(--text-muted)]">Run the exact availability model to see naive vs. correlated numbers.</p>
      )}
      {isLoading && <p className="text-sm text-[var(--text-muted)]">Computing…</p>}
      {simulation && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Independent model" value={simulation.simulation.naiveAvailability * 100} format={formatPercent} />
            <StatTile
              label="Correlated model"
              value={simulation.simulation.correlatedAvailability * 100}
              format={formatPercent}
              tone="critical"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Expected downtime"
              value={simulation.simulation.expectedDowntimeHoursPerYear.correlated}
              format={formatHours}
            />
            <StatTile label="Estimated exposure" value={simulation.headline.expectedLossPerYear} format={formatMoney} />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
              Tail risk — P(≥k vendors down at once)
            </p>
            <ul className="space-y-1">
              {simulation.headline.tailRisk.map((point) => (
                <li key={point.k} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text-secondary)]">≥{point.k} vendors down</span>
                  <span className="tabular-nums text-[var(--text-primary)]">
                    {formatSmallPercent(point.correlated)}
                    <span className="ml-1.5 font-medium text-[var(--status-critical)]">
                      ({formatMultiplier(point.multiplier)} vs. independent risk)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Sharing hosts doesn't add expected downtime — it turns many small outages into fewer, bigger,
              simultaneous ones. That shows up here, not in "expected downtime" above.
            </p>
          </div>

          <StatTile
            label="Hidden upstream risk"
            value={simulation.headline.hiddenUpstreamHoursPerYear}
            format={formatHours}
            hint="Extra downtime a vendor's own SLA doesn't capture: its host's own outages."
          />

          {simulation.headline.worstSingleEvent && (
            <div className="rounded-lg border border-[var(--border-subtle)] p-2">
              <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">Worst single event</p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                {simulation.headline.worstSingleEvent.substrate} outage —{' '}
                {simulation.headline.worstSingleEvent.vendorNames.join(', ')}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Modeled at {formatSmallPercent(simulation.headline.worstSingleEvent.probabilityPerYear)}/yr
                {simulation.headline.worstSingleEvent.entrypointsAffected.length > 0 &&
                  ` · ${simulation.headline.worstSingleEvent.entrypointsAffected.length} entrypoint(s) affected`}
              </p>
              {onValidateInAccount && (
                <button
                  type="button"
                  onClick={onValidateInAccount}
                  className="mt-2 rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                >
                  Validate this in your account
                </button>
              )}
            </div>
          )}

          {simulation.headline.redundancyGroups.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                Curated redundancy pairs
              </p>
              <ul className="space-y-1">
                {simulation.headline.redundancyGroups.map((group) => (
                  <li key={group.memberKeys.join('|')} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-[var(--text-secondary)]">{group.memberNames.join(' + ')}</span>
                    <span className="tabular-nums text-[var(--text-primary)]">
                      {formatSmallPercent(group.groupDownProbabilityPerYear)}/yr both down
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {simulation.headline.unknownHostingVendorCount > 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              {simulation.headline.unknownHostingVendorCount} vendor(s) with unknown hosting, not counted as
              correlated.
            </p>
          )}

          <p className="text-xs text-[var(--text-muted)]">
            Exact (enumerated); cross-validated against Monte Carlo in tests. Substrate outage rates are
            illustrative unless overridden — edit assumptions above before using this for a real budget.
          </p>
        </div>
      )}
    </Panel>
  )
}

export default AvailabilityPanel
