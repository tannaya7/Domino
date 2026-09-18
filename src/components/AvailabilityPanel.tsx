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
}

const formatPercent = (n: number) => `${n.toFixed(2)}%`
const formatHours = (n: number) => `${n.toFixed(1)} hrs/yr`

function AvailabilityPanel({ simulation, isLoading, error, currency, onRun }: AvailabilityPanelProps) {
  const formatMoney = (n: number) => (n > 0 ? `${formatCurrency(n, currency)}/yr` : 'not estimated')

  return (
    <Panel
      title="Availability"
      subtitle="Naive (independent) vs. correlated (shared-substrate) model — estimates, not guarantees."
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
        <p className="text-sm text-[var(--text-muted)]">
          Run a Monte Carlo simulation to see naive vs. correlated availability.
        </p>
      )}
      {isLoading && <p className="text-sm text-[var(--text-muted)]">Running simulation…</p>}
      {simulation && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Independent model"
              value={simulation.simulation.naiveAvailability * 100}
              format={formatPercent}
            />
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
          <StatTile
            label="Correlated share of downtime"
            value={simulation.headline.invisibleShare * 100}
            format={formatPercent}
            hint="Share of downtime the naive model misses entirely — 0% when there's nothing to correlate."
          />

          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
              Why: {simulation.headline.vendors} vendor(s), {simulation.headline.substrates} substrate(s)
            </p>
            <ul className="space-y-1">
              {simulation.headline.breakdown.map((row) => (
                <li key={row.substrate} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text-secondary)]">
                    {row.substrate} · {row.vendorCount} vendor{row.vendorCount === 1 ? '' : 's'}
                  </span>
                  <span
                    className={
                      row.contributesCorrelation ? 'font-medium text-[var(--status-critical)]' : 'text-[var(--text-muted)]'
                    }
                  >
                    {row.contributesCorrelation
                      ? `shared risk (${(row.failureProbability * 100).toFixed(2)}%/yr)`
                      : 'nothing to correlate'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            Based on {simulation.simulation.trials.toLocaleString()} Monte Carlo trials. Substrate failure rates
            default from vendor SLA only where 2+ vendors share a substrate — edit assumptions above before using
            this for a real budget.
          </p>
        </div>
      )}
    </Panel>
  )
}

export default AvailabilityPanel
