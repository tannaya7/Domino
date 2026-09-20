import { useMemo, useState } from 'react'
import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import { RISK_STYLES } from '../lib/risk'
import type { VendorStatus, VendorWithBlastRadius } from '../lib/types'
import { CONFIDENCE_LABEL, CONFIDENCE_STYLES, VENDOR_CONFIDENCE_RULE, type VendorConfidence } from '../lib/vendorConfidence'
import { formatVerificationBadge, type VendorVerificationResult } from '../lib/substrateVerification'
import { buildVendorRiskRows, type VendorRiskRow } from '../lib/vendorRiskRegister'
import StatusBadge from './ui/StatusBadge'

interface VendorRiskRegisterProps {
  vendors: VendorWithBlastRadius[]
  entrypoints: string[]
  naiveDowntimeHoursPerYear: number
  costPerHour: number
  currency: Currency
  vendorStatuses: VendorStatus[] | null
  /** Keyed by vendor key — undefined entries render as "unverified", never blank. */
  verifications: Map<string, VendorVerificationResult>
  onSelectVendor: (key: string) => void
  onWhyVendor?: (key: string) => void
}

type SortKey =
  | 'vendor'
  | 'tier'
  | 'substrate'
  | 'confidence'
  | 'filesAffected'
  | 'entrypointsAffected'
  | 'downtimeShare'
  | 'costPerYear'
  | 'risk'

const RISK_RANK: Record<VendorRiskRow['risk'], number> = { Low: 0, Medium: 1, High: 2 }
const CONFIDENCE_RANK: Record<VendorConfidence, number> = { low: 0, medium: 1, high: 2 }

const BASE_COLUMNS: Array<{ key: SortKey; label: string; title?: string }> = [
  { key: 'vendor', label: 'Vendor' },
  { key: 'tier', label: 'Category' },
  { key: 'substrate', label: 'Substrate' },
  { key: 'confidence', label: 'Confidence', title: VENDOR_CONFIDENCE_RULE },
  { key: 'filesAffected', label: 'Files affected' },
  { key: 'entrypointsAffected', label: 'Entrypoints affected' },
  { key: 'downtimeShare', label: 'Downtime share' },
  { key: 'costPerYear', label: 'Cost/yr' },
  { key: 'risk', label: 'Risk' },
]

const RISK_THRESHOLDS_TOOLTIP =
  'Risk is based ONLY on files affected — Low: <=2, Medium: 3-6, High: >6 — independent of cost/yr; a Low-risk vendor can still have a high cost/yr, and vice versa. Downtime share and cost/yr are proportional allocations by each vendor\'s own SLA, not a decomposition of correlated risk — see the Availability panel for that.'

function VendorRiskRegister({
  vendors,
  entrypoints,
  naiveDowntimeHoursPerYear,
  costPerHour,
  currency,
  vendorStatuses,
  verifications,
  onSelectVendor,
  onWhyVendor,
}: VendorRiskRegisterProps) {
  const [sortKey, setSortKey] = useState<SortKey>('costPerYear')
  const [sortDesc, setSortDesc] = useState(true)

  // With exactly one vendor, downtimeShare is trivially 100% — an allocation across a set of one
  // says nothing, so the column (and its sort option) is hidden rather than showing a fake 100%.
  const showDowntimeShare = vendors.length > 1
  const columns = showDowntimeShare ? BASE_COLUMNS : BASE_COLUMNS.filter((c) => c.key !== 'downtimeShare')

  const statusByKey = useMemo(() => new Map((vendorStatuses ?? []).map((s) => [s.vendorKey, s])), [vendorStatuses])

  const rows = useMemo(
    () => buildVendorRiskRows(vendors, entrypoints, naiveDowntimeHoursPerYear, costPerHour),
    [vendors, entrypoints, naiveDowntimeHoursPerYear, costPerHour],
  )

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      let cmp: number
      if (sortKey === 'risk') cmp = RISK_RANK[a.risk] - RISK_RANK[b.risk]
      else if (sortKey === 'confidence') cmp = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]
      else if (typeof a[sortKey] === 'number') cmp = (a[sortKey] as number) - (b[sortKey] as number)
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]))
      return sortDesc ? -cmp : cmp
    })
    return sorted
  }, [rows, sortKey, sortDesc])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  if (vendors.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium text-[var(--text-secondary)]">No third-party vendors detected.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Vendor risk register</h2>
        <p className="text-xs text-[var(--text-muted)]" title={RISK_THRESHOLDS_TOOLTIP}>
          Risk thresholds & allocation method ⓘ
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
              {columns.map((col) => (
                <th key={col.key} className="py-2 pr-4 font-medium" title={col.title}>
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  >
                    {col.label}
                    {sortKey === col.key && <span aria-hidden="true">{sortDesc ? '▼' : '▲'}</span>}
                  </button>
                </th>
              ))}
              <th className="py-2 pr-4 font-medium" title="Independent DNS + published-IP-range evidence for the curated substrate tag — see scripts/verify-substrates.ts.">
                DNS
              </th>
              <th className="py-2 pr-4 font-medium">Live status</th>
              {onWhyVendor && <th className="py-2 pr-4 font-medium">Why</th>}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const status = statusByKey.get(row.key)
              return (
                <tr
                  key={row.key}
                  onClick={() => onSelectVendor(row.key)}
                  className="cursor-pointer border-b border-[var(--border-subtle)] hover:bg-white/5"
                >
                  <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{row.vendor}</td>
                  <td className="py-2 pr-4 text-[var(--text-secondary)]">{row.tier}</td>
                  <td className="py-2 pr-4 text-[var(--text-secondary)]" title={row.detectedVia}>
                    {row.substrate}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${CONFIDENCE_STYLES[row.confidence]}`}
                      title={VENDOR_CONFIDENCE_RULE}
                    >
                      {CONFIDENCE_LABEL[row.confidence]}
                    </span>
                  </td>
                  <td className="py-2 pr-4 tabular-nums text-[var(--text-primary)]">{row.filesAffected}</td>
                  <td className="py-2 pr-4 tabular-nums text-[var(--text-primary)]">{row.entrypointsAffected}</td>
                  {showDowntimeShare && (
                    <td className="py-2 pr-4 tabular-nums text-[var(--text-secondary)]">
                      {(row.downtimeShare * 100).toFixed(0)}%
                    </td>
                  )}
                  <td className="py-2 pr-4 tabular-nums text-[var(--text-primary)]">
                    {row.costPerYear > 0 ? `${formatCurrency(row.costPerYear, currency)}/yr` : 'not estimated'}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${RISK_STYLES[row.risk]}`}>{row.risk}</span>
                  </td>
                  <td className="py-2 pr-4">
                    {(() => {
                      const verification = verifications.get(row.key)
                      const badge = formatVerificationBadge(verification)
                      const title = verification
                        ? verification.hosts.map((h) => `${h.host}: ${h.detail}`).join('\n')
                        : 'No independent DNS/IP-range evidence for this vendor.'
                      return (
                        <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${badge.style}`} title={title}>
                          {badge.label}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge indicator={status?.indicator ?? 'unknown'} stale={status?.stale} />
                  </td>
                  {onWhyVendor && (
                    <td className="py-2 pr-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onWhyVendor(row.key)
                        }}
                        aria-label={`Why is ${row.vendor} ${row.risk}-risk?`}
                        className="text-[var(--text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                      >
                        why?
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default VendorRiskRegister
