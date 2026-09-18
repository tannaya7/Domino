import type { SimulateResponse } from '../lib/api'
import Panel from './ui/Panel'
import Spinner from './ui/Spinner'
import StatTile from './ui/StatTile'

interface AvailabilityPanelProps {
  simulation: SimulateResponse | null
  isLoading: boolean
  error: string | null
  onRun: () => void
}

const formatPercent = (n: number) => `${n.toFixed(2)}%`
const formatHours = (n: number) => `${n.toFixed(1)} hrs/yr`
const formatMoney = (n: number) => (n > 0 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr` : 'not estimated')

function AvailabilityPanel({ simulation, isLoading, error, onRun }: AvailabilityPanelProps) {
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
            <StatTile
              label="Estimated exposure"
              value={simulation.simulation.expectedAnnualExposure.correlated}
              format={formatMoney}
            />
          </div>
          <StatTile
            label="Correlated share of downtime"
            value={simulation.simulation.correlatedShareOfDowntime * 100}
            format={formatPercent}
            hint="Share of downtime the naive model misses entirely."
          />
          <p className="text-xs text-[var(--text-muted)]">
            Based on {simulation.simulation.trials.toLocaleString()} Monte Carlo trials. Substrate failure rates are
            derived from vendor SLA, not independently measured — edit assumptions before using this for a real
            budget.
          </p>
        </div>
      )}
    </Panel>
  )
}

export default AvailabilityPanel
