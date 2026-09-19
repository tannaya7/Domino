import type { GateResponse } from '../lib/api'
import { formatCurrency } from '../lib/currency'

interface GateVerdictCardProps {
  gate: GateResponse
  error: string | null
}

const STATUS_STYLES: Record<GateResponse['policy']['status'], { label: string; className: string }> = {
  info: { label: 'Report only', className: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]' },
  pass: { label: 'Pass', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  warn: { label: 'Warning', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  fail: { label: 'Fail', className: 'border-rose-500/30 bg-rose-500/10 text-rose-300' },
}

function formatPct(share: number): string {
  return `${Math.round(share * 100)}%`
}

/**
 * The same verdict CI would post as a sticky PR comment (see action/action.yml and
 * server/src/gateMarkdown.ts) — rendered here as structured UI rather than raw markdown, so a judge
 * or reviewer sees it without needing the GitHub Action installed anywhere.
 */
function GateVerdictCard({ gate, error }: GateVerdictCardProps) {
  if (error) {
    return (
      <div className="rounded-lg border border-[var(--border-subtle)] p-3 text-sm text-[var(--text-muted)]">
        PR Resilience Gate couldn't run for this PR: {error}
      </div>
    )
  }

  const status = STATUS_STYLES[gate.policy.status]
  const { before, after } = gate.concentration

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">PR Resilience Gate</p>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
      </div>

      {gate.policy.violations.length > 0 && (
        <ul className="mt-2 space-y-1">
          {gate.policy.violations.map((v) => (
            <li key={v.rule} className="text-xs text-rose-300">
              {v.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <span className="text-[var(--text-secondary)]">Vendors</span>
        <span className="text-right text-[var(--text-primary)]">
          {before.vendorCount} → {after.vendorCount}
        </span>
        <span className="text-[var(--text-secondary)]">Most concentrated</span>
        <span className="text-right text-[var(--text-primary)]">
          {before.mostConcentrated ? formatPct(before.mostConcentrated.share) : '—'} →{' '}
          {after.mostConcentrated ? `${formatPct(after.mostConcentrated.share)} on ${after.mostConcentrated.substrate}` : '—'}
        </span>
        <span className="text-[var(--text-secondary)]">Modeled exposure</span>
        <span className="text-right text-[var(--text-primary)]">
          {formatCurrency(gate.exposure.before, gate.exposure.currency as 'USD' | 'INR')} →{' '}
          {formatCurrency(gate.exposure.after, gate.exposure.currency as 'USD' | 'INR')}
        </span>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">New vendors ({gate.newVendors.length})</p>
        {gate.newVendors.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">None detected.</p>
        ) : (
          <ul className="space-y-1">
            {gate.newVendors.map((v) => (
              <li key={v.key} className="rounded border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-xs text-purple-200">
                {v.vendor} on {v.substrate.join(', ') || 'unknown substrate'}
              </li>
            ))}
          </ul>
        )}
      </div>

      {gate.entrypointsAffected.length > 0 && (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">{gate.entrypointsAffected.length} entrypoint(s) affected.</p>
      )}

      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        Baseline: {gate.pr.baselineNote}. Modeled estimate under editable assumptions — never a guarantee.
      </p>
    </div>
  )
}

export default GateVerdictCard
