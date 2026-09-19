import { formatAsOf, STATUS_MARKER } from '../lib/statusMarker'
import type { BannerCandidate } from '../lib/vendorStatusBanner'

interface StatusBannerProps {
  candidate: BannerCandidate
  vendorName: string
  checkedAt: string
  onShowBlastRadius: () => void
}

/** Never says "live" — every status here is a point-in-time check, always qualified with "as of". */
function StatusBanner({ candidate, vendorName, checkedAt, onShowBlastRadius }: StatusBannerProps) {
  const marker = STATUS_MARKER[candidate.indicator]
  const toneClass = candidate.indicator === 'outage' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'

  return (
    <div role="alert" className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${toneClass}`}>
      <span aria-hidden="true">{marker.icon}</span>
      <span>
        <strong>{vendorName}</strong> is reporting <strong>{marker.label.toLowerCase()}</strong> ({formatAsOf(checkedAt)}):{' '}
        {candidate.entrypointsAffected} entrypoint(s) in your repo depend on it.
      </span>
      <button
        type="button"
        onClick={onShowBlastRadius}
        className="ml-auto shrink-0 rounded-md border border-current px-2 py-1 text-xs font-medium hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        Show blast radius
      </button>
    </div>
  )
}

export default StatusBanner
