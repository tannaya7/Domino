import { useMemo, useState } from 'react'
import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import { RISK_STYLES } from '../lib/risk'
import type { VendorStatus, VendorWithBlastRadius } from '../lib/types'
import { buildVendorRiskRows, type VendorRiskRow } from '../lib/vendorRiskRegister'
import StatusBadge from './ui/StatusBadge'

interface VendorRiskRegisterProps {
  vendors: VendorWithBlastRadius[]
  entrypoints: string[]
  naiveDowntimeHoursPerYear: number
  costPerHour: number
  currency: Currency
  vendorStatuses: VendorStatus[] | null
  onSelectVendor: (key: string) => void
}

type SortKey = 'vendor' | 'tier' | 'substrate' | 'filesAffected' | 'entrypointsAffected' | 'downtimeShare' | 'costPerYear' | 'risk'

const RISK_RANK: Record<VendorRiskRow['risk'], number> = { Low: 0, Medium: 1, High: 2 }

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'vendor', label: 'Vendor' },
  { key: 'tier', label: 'Category' },
  { key: 'substrate', label: 'Substrate' },
  { key: 'filesAffected', label: 'Files affected' },
  { key: 'entrypointsAffected', label: 'Entrypoints affected' },
  { key: 'downtimeShare', label: 'Downtime share' },
  { key: 'costPerYear', label: 'Cost/yr' },
  { key: 'risk', label: 'Risk' },
]

function VendorRiskRegister({
  vendors,
  entrypoints,
  naiveDowntimeHoursPerYear,
  costPerHour,
  currency,
  vendorStatuses,
  onSelectVendor,
}: VendorRiskRegisterProps) {
  const [sortKey, setSortKey] = useState<SortKey>('costPerYear')
  const [sortDesc, setSortDesc] = useState(true)

  const statusByKey = useMemo(() => new Map((vendorStatuses ?? []).map((s) => [s.vendorKey, s])), [vendorStatuses])

  const rows = useMemo(
    () => buildVendorRiskRows(vendors, entrypoints, naiveDowntimeHoursPerYear, costPerHour),
    [vendors, entrypoints, naiveDowntimeHoursPerYear, costPerHour],
  )

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      let cmp: number
      if (sortKey === 'risk') cmp = RISK_RANK[a.risk] - RISK_RANK[b.risk]
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
        <p
          className="text-xs text-[var(--text-muted)]"
          title="Low: <=2 files affected. Medium: 3-6 files affected. High: >6 files affected. Downtime share and cost/yr are proportional allocations by each vendor's own SLA, not a decomposition of correlated risk — see the Availability panel for that."
        >
          Risk thresholds & allocation method ⓘ
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
              {COLUMNS.map((col) => (
                <th key={col.key} className="py-2 pr-4 font-medium">
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
              <th className="py-2 pr-4 font-medium">Live status</th>
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
                  <td className="py-2 pr-4 tabular-nums text-[var(--text-primary)]">{row.filesAffected}</td>
                  <td className="py-2 pr-4 tabular-nums text-[var(--text-primary)]">{row.entrypointsAffected}</td>
                  <td className="py-2 pr-4 tabular-nums text-[var(--text-secondary)]">
                    {(row.downtimeShare * 100).toFixed(0)}%
                  </td>
                  <td className="py-2 pr-4 tabular-nums text-[var(--text-primary)]">
                    {row.costPerYear > 0 ? `${formatCurrency(row.costPerYear, currency)}/yr` : 'not estimated'}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${RISK_STYLES[row.risk]}`}>{row.risk}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge indicator={status?.indicator ?? 'unknown'} stale={status?.stale} />
                  </td>
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
