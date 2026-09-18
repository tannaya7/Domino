import type { AvailabilityAssumptionsState } from '../hooks/useAvailabilityAssumptions'
import { DEFAULT_SUBSTRATE_OUTAGE_PROBABILITY, UNSHAREABLE_SUBSTRATE_TAGS } from '../engine/correlated'
import type { Currency } from '../lib/currency'
import { convertCurrency, CURRENCY_SYMBOL } from '../lib/currency'
import type { Vendor } from '../lib/types'
import Panel from './ui/Panel'

interface AssumptionsPanelProps {
  vendors: Vendor[]
  assumptions: AvailabilityAssumptionsState
  onChange: (next: AvailabilityAssumptionsState) => void
}

const inputClass =
  'w-20 rounded-md border border-[var(--border-subtle)] bg-transparent px-2 py-0.5 text-right text-sm tabular-nums text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]'

function AssumptionsPanel({ vendors, assumptions, onChange }: AssumptionsPanelProps) {
  const substrates = [
    ...new Set(vendors.flatMap((v) => v.substrate.filter((s) => !UNSHAREABLE_SUBSTRATE_TAGS.has(s.toLowerCase())))),
  ].sort()
  const unknownHostingCount = vendors.filter((v) =>
    v.substrate.every((s) => UNSHAREABLE_SUBSTRATE_TAGS.has(s.toLowerCase())),
  ).length

  function updateVendorSla(key: string, pctText: string) {
    const pct = Number(pctText)
    const next = { ...assumptions.vendorSlaOverrides }
    if (pctText.trim() === '' || !Number.isFinite(pct)) delete next[key]
    else next[key] = Math.max(0, Math.min(1, pct / 100))
    onChange({ ...assumptions, vendorSlaOverrides: next })
  }

  function updateSubstrateRate(substrate: string, pctText: string) {
    const pct = Number(pctText)
    const next = { ...assumptions.substrateRateOverrides }
    if (pctText.trim() === '' || !Number.isFinite(pct)) delete next[substrate]
    else next[substrate] = Math.max(0, Math.min(1, pct / 100))
    onChange({ ...assumptions, substrateRateOverrides: next })
  }

  function updateCostPerHour(text: string) {
    const value = Number(text)
    onChange({ ...assumptions, costPerHour: Number.isFinite(value) && value >= 0 ? value : 0 })
  }

  function toggleCurrency(next: Currency) {
    if (next === assumptions.currency) return
    onChange({ ...assumptions, currency: next, costPerHour: convertCurrency(assumptions.costPerHour, assumptions.currency, next) })
  }

  return (
    <Panel
      title="Assumptions"
      subtitle="Every number below is an editable input, not a measured fact."
    >
      <div className="space-y-4 text-sm">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">Per-vendor SLA</p>
          <ul className="space-y-1">
            {vendors.map((v) => (
              <li key={v.key} className="flex items-center justify-between gap-2">
                <span className="truncate text-[var(--text-secondary)]">{v.vendor}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    aria-label={`${v.vendor} SLA percent`}
                    defaultValue={((assumptions.vendorSlaOverrides[v.key] ?? v.sla) * 100).toFixed(2)}
                    onChange={(e) => updateVendorSla(v.key, e.target.value)}
                    className={inputClass}
                  />
                  <span className="text-xs text-[var(--text-muted)]">%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
            Per-substrate outage probability (per year)
          </p>
          <ul className="space-y-1">
            {substrates.map((s) => (
              <li key={s} className="flex items-center justify-between gap-2">
                <span className="truncate text-[var(--text-secondary)]">{s}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    aria-label={`${s} substrate outage probability percent`}
                    defaultValue={
                      ((assumptions.substrateRateOverrides[s] ?? DEFAULT_SUBSTRATE_OUTAGE_PROBABILITY) * 100).toFixed(2)
                    }
                    onChange={(e) => updateSubstrateRate(s, e.target.value)}
                    className={inputClass}
                  />
                  <span className="text-xs text-[var(--text-muted)]">%</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Illustrative default ({(DEFAULT_SUBSTRATE_OUTAGE_PROBABILITY * 100).toFixed(2)}%/yr) until you edit
            it — there's no independently measured per-substrate outage rate to draw from. This is a real,
            separate risk from a vendor's own SLA, not derived from it.
            {unknownHostingCount > 0 &&
              ` ${unknownHostingCount} vendor(s) with unknown hosting, not counted as correlated.`}
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-[var(--text-muted)] normal-case">
            Downtime cost per hour — <span className="uppercase">illustrative, edit for your business</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-[var(--border-subtle)]" role="group" aria-label="Currency">
              {(['USD', 'INR'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={assumptions.currency === c}
                  onClick={() => toggleCurrency(c)}
                  className={`px-2 py-0.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                    assumptions.currency === c
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <span className="text-xs text-[var(--text-muted)]">{CURRENCY_SYMBOL[assumptions.currency]}</span>
            <input
              type="number"
              step="1"
              min="0"
              aria-label="Downtime cost per hour"
              value={assumptions.costPerHour}
              onChange={(e) => updateCostPerHour(e.target.value)}
              className={`${inputClass} w-28`}
            />
            <span className="text-xs text-[var(--text-muted)]">/hr</span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            The currency toggle converts at an illustrative ~{CURRENCY_SYMBOL.INR}83/$1 rate, not a live one — edit
            the number directly for precision.
          </p>
        </div>
      </div>
    </Panel>
  )
}

export default AssumptionsPanel
