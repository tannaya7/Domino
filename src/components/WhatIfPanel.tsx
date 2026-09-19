import { useState } from 'react'
import { KNOWN_SHAREABLE_SUBSTRATES } from '../engine/correlated'
import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import type { VendorWithBlastRadius, WhatIfOverride, WhatIfResult } from '../lib/types'
import Spinner from './ui/Spinner'

export const MAX_WHATIF_STACK = 3

interface WhatIfPanelProps {
  vendor: VendorWithBlastRadius
  currency: Currency
  stack: WhatIfOverride[]
  /** Every vendor name by key, not just this panel's vendor — a stacked what-if can name a
   * DIFFERENT vendor (e.g. staged from Recommended Moves while looking at this one). */
  vendorNameByKey: Map<string, string>
  result: WhatIfResult | null
  isLoading: boolean
  error: string | null
  onAdd: (override: WhatIfOverride) => void
  onRemove: (index: number) => void
  onReset: () => void
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(3)}%`
}

function formatHours(n: number): string {
  return `${n.toFixed(2)} hrs/yr`
}

function describeOverride(vendorName: string, override: WhatIfOverride): string {
  const parts: string[] = []
  if (override.substrate) parts.push(`→ ${override.substrate}`)
  if (override.failoverVendorId) parts.push(`+ ${override.failoverVendorId} failover`)
  return `${vendorName} ${parts.join(', ')}`
}

/** A before/after comparison bar — two thin tracks sharing a scale (max of the two values), so a
 * shorter "after" bar always reads as "less" regardless of whether less is good (downtime) or the
 * bars are both near the scale's ceiling (availability, where the visual difference is intentionally subtle). */
function CompareBars({ label, before, after, format, formatValue }: { label: string; before: number; after: number; format: (n: number) => string; formatValue?: (n: number) => number }) {
  const scale = Math.max(before, after, 1e-9)
  const pct = (n: number) => Math.min(100, Math.max(1, (n / scale) * 100))
  const beforeValue = formatValue ? formatValue(before) : before
  const afterValue = formatValue ? formatValue(after) : after
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-[11px] text-[var(--text-muted)]">Before</span>
          <div className="h-2 flex-1 rounded-full bg-[var(--border-subtle)]">
            <div className="h-2 rounded-full bg-[var(--text-muted)]" style={{ width: `${pct(before)}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-secondary)]">{format(beforeValue)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-[11px] text-[var(--text-muted)]">After</span>
          <div className="h-2 flex-1 rounded-full bg-[var(--border-subtle)]">
            <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${pct(after)}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-primary)]">{format(afterValue)}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * "What if?" mitigation preview (Prompt 15) — lets the user stack up to MAX_WHATIF_STACK moves
 * (move a vendor to another substrate, and/or pair it with a curated failover) and see the exact
 * engine's before/after effect, never a fabricated one. Selecting a move is enough to trigger the
 * graph's node-into-island animation (see VendorGraphView's previewSubstrateByVendorKey) — there is
 * no separate "preview" vs. "commit" step, since every number here already comes from the exact
 * engine, not a sample.
 */
function WhatIfPanel({ vendor, currency, stack, vendorNameByKey, result, isLoading, error, onAdd, onRemove, onReset }: WhatIfPanelProps) {
  const substrateOptions = KNOWN_SHAREABLE_SUBSTRATES.filter((s) => !vendor.substrate.includes(s))
  const [pendingSubstrate, setPendingSubstrate] = useState(substrateOptions[0] ?? '')
  const failoverOptions = vendor.fallbacks ?? []
  const [pendingFailover, setPendingFailover] = useState(failoverOptions[0] ?? '')
  const atCapacity = stack.length >= MAX_WHATIF_STACK

  const savedPerYear = result ? -result.delta.expectedAnnualExposure : 0

  return (
    <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">What if?</p>

      <div className="space-y-2">
        {substrateOptions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <select
              aria-label={`Move ${vendor.vendor} to substrate`}
              value={pendingSubstrate}
              onChange={(e) => setPendingSubstrate(e.target.value)}
              disabled={atCapacity}
              className="flex-1 rounded-md border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs text-[var(--text-primary)] disabled:opacity-40"
            >
              {substrateOptions.map((s) => (
                <option key={s} value={s} className="bg-[var(--bg-elevated)]">
                  Move to {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={atCapacity || !pendingSubstrate}
              onClick={() => onAdd({ vendorId: vendor.key, substrate: pendingSubstrate })}
              className="shrink-0 rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40"
            >
              Preview
            </button>
          </div>
        )}

        {failoverOptions.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <select
              aria-label={`Add a failover vendor for ${vendor.vendor}`}
              value={pendingFailover}
              onChange={(e) => setPendingFailover(e.target.value)}
              disabled={atCapacity}
              className="flex-1 rounded-md border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs text-[var(--text-primary)] disabled:opacity-40"
            >
              {failoverOptions.map((name) => (
                <option key={name} value={name} className="bg-[var(--bg-elevated)]">
                  Add {name} as failover
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={atCapacity || !pendingFailover}
              onClick={() => onAdd({ vendorId: vendor.key, failoverVendorId: pendingFailover })}
              className="shrink-0 rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40"
            >
              Preview
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">
            No curated same-category alternative is known for {vendor.vendor} — only the substrate move is
            available.
          </p>
        )}
      </div>

      {stack.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {stack.map((override, i) => (
            <span
              key={`${override.vendorId}-${override.substrate ?? ''}-${override.failoverVendorId ?? ''}-${i}`}
              className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
            >
              {describeOverride(vendorNameByKey.get(override.vendorId) ?? override.vendorId, override)}
              <button
                type="button"
                aria-label="Remove this what-if"
                onClick={() => onRemove(i)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            Reset
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-300" role="alert">
          {error}
        </p>
      )}

      {isLoading && <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-muted)]"><Spinner className="h-3 w-3" /> Computing…</p>}

      {!isLoading && result && stack.length > 0 && (
        <div className="mt-3 space-y-3 rounded-lg border border-[var(--border-subtle)] p-2" data-tour="whatif-results">
          {!result.meaningfulChange ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No meaningful change under these assumptions — this move doesn't move the numbers enough to report.
            </p>
          ) : (
            <>
              <CompareBars
                label="Effective availability"
                before={result.baseline.correlatedAvailability}
                after={result.mitigated.correlatedAvailability}
                format={formatPercent}
              />
              <CompareBars
                label="Expected downtime"
                before={result.baseline.expectedDowntimeHoursPerYear}
                after={result.mitigated.expectedDowntimeHoursPerYear}
                format={formatHours}
              />
              {savedPerYear > 0 && (
                <p className="text-sm text-[var(--text-primary)]">
                  <span className="font-semibold text-[var(--status-good)]">{formatCurrency(savedPerYear, currency)}</span>{' '}
                  saved per year at your current assumptions.
                </p>
              )}
            </>
          )}
          {result.unresolvedFailovers.length > 0 && (
            <p className="text-[11px] text-amber-300">
              No curated data yet for: {result.unresolvedFailovers.join(', ')} — that part of the stack has no
              effect on the numbers above.
            </p>
          )}
          <p className="text-[11px] text-[var(--text-muted)]">
            Modeled estimate under your assumptions — an exact recomputation of the same model, not a
            guarantee of what would actually happen.
          </p>
        </div>
      )}
    </div>
  )
}

export default WhatIfPanel
