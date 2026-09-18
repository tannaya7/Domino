import { colorForSubstrate } from '../lib/colors'
import type { ConcentrationResult } from '../lib/types'
import Panel from './ui/Panel'
import StatTile from './ui/StatTile'

interface ConcentrationPanelProps {
  concentration: ConcentrationResult
}

function ConcentrationPanel({ concentration }: ConcentrationPanelProps) {
  const { vendorCount, substrateCount, bySubstrate, mostConcentrated } = concentration

  if (vendorCount === 0) {
    return (
      <Panel title="Concentration">
        <p className="text-sm text-[var(--text-muted)]">No vendors detected — nothing to concentrate.</p>
      </Panel>
    )
  }

  return (
    <Panel title="Concentration" subtitle="How many independent vendors do you really have?">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <StatTile label="Vendors" value={vendorCount} />
        <StatTile label="Substrates" value={substrateCount} />
      </div>

      {mostConcentrated && mostConcentrated.vendorKeys.length > 1 && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold tracking-wide text-amber-300 uppercase">Correlated exposure</p>
          <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
            {mostConcentrated.vendorKeys.length} / {vendorCount} vendors on{' '}
            <span style={{ color: colorForSubstrate(mostConcentrated.substrate) }}>{mostConcentrated.substrate}</span>
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {mostConcentrated.vendorNames.join(', ')} share the same underlying substrate — one incident there
            affects all of them at once.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {bySubstrate.map((row) => (
          <li key={row.substrate}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--text-secondary)]">{row.substrate}</span>
              <span className="text-[var(--text-muted)]">{row.vendorKeys.length}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${Math.round(row.share * 100)}%`, backgroundColor: colorForSubstrate(row.substrate) }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export default ConcentrationPanel
