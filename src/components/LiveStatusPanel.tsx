import type { AwsHealthStatus, VendorStatus } from '../lib/types'
import Panel from './ui/Panel'
import Spinner from './ui/Spinner'
import StatusBadge from './ui/StatusBadge'

interface LiveStatusPanelProps {
  vendorStatuses: VendorStatus[] | null
  awsHealth: AwsHealthStatus | null
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  vendorNameByKey: Map<string, string>
}

function LiveStatusPanel({
  vendorStatuses,
  awsHealth,
  isLoading,
  error,
  onRefresh,
  vendorNameByKey,
}: LiveStatusPanelProps) {
  const showSkeletons = isLoading && !vendorStatuses && vendorNameByKey.size > 0
  return (
    <Panel
      title="Live status"
      subtitle="Real vendor status feeds. Unreachable means unknown, never a fabricated healthy."
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
        >
          {isLoading ? <Spinner className="h-3 w-3" /> : 'Refresh'}
        </button>
      }
    >
      {error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {!vendorStatuses && !isLoading && !error && (
        <p className="text-sm text-[var(--text-muted)]">Fetch live status from each vendor's status feed.</p>
      )}
      {showSkeletons && (
        <ul className="space-y-1.5" aria-label="Loading vendor status" aria-busy="true">
          {[...vendorNameByKey.entries()].map(([key, name]) => (
            <li key={key} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-[var(--text-secondary)]">{name}</span>
              <span className="h-4 w-20 animate-pulse rounded-full bg-[var(--border-subtle)]" aria-hidden="true" />
            </li>
          ))}
        </ul>
      )}
      {vendorStatuses && vendorStatuses.length > 0 && (
        <ul className="space-y-1.5">
          {vendorStatuses.map((status) => (
            <li key={status.vendorKey} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-[var(--text-secondary)]">
                {vendorNameByKey.get(status.vendorKey) ?? status.vendorKey}
              </span>
              <StatusBadge indicator={status.indicator} stale={status.stale} />
            </li>
          ))}
        </ul>
      )}
      {awsHealth && (
        <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">
              AWS Health (
              {awsHealth.source === 'aws-health-api'
                ? 'account API'
                : awsHealth.source === 'public-status-feed'
                  ? 'public feed'
                  : 'unavailable'}
              )
            </span>
            <StatusBadge indicator={awsHealth.indicator} />
          </div>
          {awsHealth.note && <p className="mt-1 text-xs text-[var(--text-muted)]">{awsHealth.note}</p>}
        </div>
      )}
    </Panel>
  )
}

export default LiveStatusPanel
