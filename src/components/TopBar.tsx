import { useState } from 'react'
import { PRESET_SCENARIOS } from '../lib/availability'

/** Computed upstream (Workspace.tsx) from real status data — TopBar just renders it, never guesses. */
export interface StatusChipInfo {
  label: string
  color: string
  pulsing: boolean
}

interface TopBarProps {
  repoLabel: string | null
  branch: string | null
  hasVendorData: boolean
  statusChip: StatusChipInfo
  isSimulating: boolean
  /** The most-concentrated substrate's preset scenario id — pre-selects the scenario most worth running. */
  defaultScenarioId: string
  onSimulate: (scenarioId: string) => void
  onReset: () => void
  /** Set when this workspace came from a pre-generated demo snapshot, not a live analysis. */
  snapshotInfo: { sha: string; generatedAt: string } | null
  onAnalyzeLive: () => void
  isAnalyzingLive: boolean
}

function TopBar({
  repoLabel,
  branch,
  hasVendorData,
  statusChip,
  isSimulating,
  defaultScenarioId,
  onSimulate,
  onReset,
  snapshotInfo,
  onAnalyzeLive,
  isAnalyzingLive,
}: TopBarProps) {
  // Initializer only, deliberately — Workspace (and TopBar with it) fully unmounts and remounts
  // per repo (App.tsx only renders it once `analyzed` is set, and "Load different repo" clears
  // that first), so defaultScenarioId is already correct at mount for every repo; no effect needed
  // to re-sync it later, and one would only fight a scenario choice the user already made.
  const [scenarioId, setScenarioId] = useState(defaultScenarioId)

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
        {snapshotInfo ? (
          <>
            <span
              className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 text-xs font-medium text-[var(--accent-strong)]"
              title="This data was pre-generated and pinned to a commit — not a live scan."
            >
              snapshot @ {snapshotInfo.sha.slice(0, 7)} on {new Date(snapshotInfo.generatedAt).toLocaleDateString()}
            </span>
            <button
              type="button"
              onClick={onAnalyzeLive}
              disabled={isAnalyzingLive}
              className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
            >
              {isAnalyzingLive ? 'Analyzing…' : 'Analyze live'}
            </button>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span
              className={`h-2 w-2 rounded-full ${statusChip.pulsing ? 'animate-pulse-dot' : ''}`}
              style={{ backgroundColor: statusChip.color }}
              aria-hidden="true"
            />
            {statusChip.label}
          </span>
        )}
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
