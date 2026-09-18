import { useState } from 'react'
import { PRESET_SCENARIOS } from '../lib/availability'

export type HealthSummary = 'unknown' | 'healthy' | 'degraded'

interface TopBarProps {
  repoLabel: string | null
  branch: string | null
  hasVendorData: boolean
  healthSummary: HealthSummary
  isSimulating: boolean
  onSimulate: (scenarioId: string) => void
  onReset: () => void
}

const HEALTH_LABEL: Record<HealthSummary, string> = {
  unknown: 'Status unknown',
  healthy: 'Analysis healthy',
  degraded: 'Degraded dependencies detected',
}

const HEALTH_COLOR: Record<HealthSummary, string> = {
  unknown: 'var(--status-unknown)',
  healthy: 'var(--status-good)',
  degraded: 'var(--status-critical)',
}

function TopBar({ repoLabel, branch, hasVendorData, healthSummary, isSimulating, onSimulate, onReset }: TopBarProps) {
  const [scenarioId, setScenarioId] = useState(PRESET_SCENARIOS[0]?.id ?? '')

  return (
    <header className="panel-glass sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">
          Blast Radius <span className="font-normal text-[var(--text-muted)]">Mapper</span>
        </h1>
        {repoLabel && (
          <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
            {repoLabel}
            {branch && <span className="text-[var(--text-muted)]"> @ {branch}</span>}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span
            className={`h-2 w-2 rounded-full ${healthSummary === 'degraded' ? 'animate-pulse-dot' : ''}`}
            style={{ backgroundColor: HEALTH_COLOR[healthSummary] }}
            aria-hidden="true"
          />
          {HEALTH_LABEL[healthSummary]}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {hasVendorData && (
          <>
            <label className="sr-only" htmlFor="scenario-select">
              Failure scenario
            </label>
            <select
              id="scenario-select"
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              {PRESET_SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onSimulate(scenarioId)}
              disabled={isSimulating}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[#0a0b0e] hover:bg-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
            >
              {isSimulating ? 'Simulating…' : 'Simulate'}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          Load different repo
        </button>
      </div>
    </header>
  )
}

export default TopBar
