import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import type { RecommendedMove } from '../lib/types'
import Panel from './ui/Panel'

interface RecommendedMovesPanelProps {
  moves: RecommendedMove[]
  currency: Currency
  costPerHour: number
  onPreview: (move: RecommendedMove) => void
}

/**
 * Deterministic top-3 mitigation ranking (server/src/whatIf.ts `rankRecommendedMoves`) — no LLM
 * involved in picking or ordering these. "Preview" jumps to that vendor and stages the same move
 * in its What-if panel, so the numbers shown here and there always agree (one computation, not two).
 */
function RecommendedMovesPanel({ moves, currency, costPerHour, onPreview }: RecommendedMovesPanelProps) {
  if (costPerHour <= 0) {
    return (
      <Panel title="Recommended moves" subtitle="Deterministic ranking by modeled money saved — no LLM.">
        <p className="text-sm text-[var(--text-muted)]">
          Set a downtime cost per hour in Assumptions to rank mitigations by money saved.
        </p>
      </Panel>
    )
  }

  return (
    <Panel title="Recommended moves" subtitle="Deterministic ranking by modeled money saved — no LLM.">
      {moves.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No single substrate move or curated failover changes the numbers enough to report right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {moves.map((move) => (
            <li
              key={`${move.vendorId}-${move.moveType}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] p-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-[var(--text-primary)]">{move.description}</p>
                <p className="text-xs text-[var(--status-good)]">{formatCurrency(move.annualSavings, currency)}/yr modeled savings</p>
              </div>
              <button
                type="button"
                onClick={() => onPreview(move)}
                className="shrink-0 rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                Preview
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        Modeled estimate under your assumptions — ranked by the same exact engine as the What-if panel, never a
        guarantee.
      </p>
    </Panel>
  )
}

export default RecommendedMovesPanel
