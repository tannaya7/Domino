import { useState } from 'react'
import type { AdjacencyMap } from '../lib/graph'
import type { Currency } from '../lib/currency'
import type { GraphData, VendorStatus, VendorWithBlastRadius } from '../lib/types'
import type { VendorVerificationResult } from '../lib/substrateVerification'
import SystemOverview from './SystemOverview'
import VendorRiskRegister from './VendorRiskRegister'

interface RiskOverviewProps {
  vendors: VendorWithBlastRadius[]
  entrypoints: string[]
  naiveDowntimeHoursPerYear: number
  costPerHour: number
  currency: Currency
  vendorStatuses: VendorStatus[] | null
  verifications: Map<string, VendorVerificationResult>
  onSelectVendor: (key: string) => void
  onWhyVendor?: (key: string) => void
  graphData: GraphData
  adjacencyMap: AdjacencyMap
  onSelectNode: (nodeId: string) => void
}

type SubTab = 'vendors' | 'files'

/** Two sub-tabs sharing the System overview slot: the vendor risk register (the primary view once
 * there's real vendor data) and the plain per-file blast-radius table underneath. The sub-tab bar
 * is a normal (non-sticky) flex row ABOVE the scrollable content, not overlapping it — that's what
 * was clipping SystemOverview's own heading before this existed. */
function RiskOverview({
  vendors,
  entrypoints,
  naiveDowntimeHoursPerYear,
  costPerHour,
  currency,
  vendorStatuses,
  verifications,
  onSelectVendor,
  onWhyVendor,
  graphData,
  adjacencyMap,
  onSelectNode,
}: RiskOverviewProps) {
  const [subTab, setSubTab] = useState<SubTab>(vendors.length > 0 ? 'vendors' : 'files')

  return (
    <div className="flex h-full flex-col overflow-hidden" data-tour="risk-register">
      <div className="flex shrink-0 gap-1 border-b border-[var(--border-subtle)] px-4 pt-3">
        <button
          type="button"
          onClick={() => setSubTab('vendors')}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            subTab === 'vendors'
              ? 'border-b-2 border-[var(--accent)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          Vendor risk register
        </button>
        <button
          type="button"
          onClick={() => setSubTab('files')}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            subTab === 'files'
              ? 'border-b-2 border-[var(--accent)] text-[var(--text-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          Files
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {subTab === 'vendors' ? (
          <VendorRiskRegister
            vendors={vendors}
            entrypoints={entrypoints}
            naiveDowntimeHoursPerYear={naiveDowntimeHoursPerYear}
            costPerHour={costPerHour}
            currency={currency}
            vendorStatuses={vendorStatuses}
            verifications={verifications}
            onSelectVendor={onSelectVendor}
            onWhyVendor={onWhyVendor}
          />
        ) : (
          <SystemOverview graphData={graphData} adjacencyMap={adjacencyMap} onSelectNode={onSelectNode} />
        )}
      </div>
    </div>
  )
}

export default RiskOverview
