import { STATUS_COLORS } from '../../lib/colors'
import type { StatusIndicator } from '../../lib/types'

const LABELS: Record<StatusIndicator, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  outage: 'Outage',
  unknown: 'Unknown',
}

interface StatusBadgeProps {
  indicator: StatusIndicator
  stale?: boolean
}

/** Never renders "healthy" for unverifiable status — `unknown` gets its own dimmed, non-pulsing dot. */
function StatusBadge({ indicator, stale }: StatusBadgeProps) {
  const color = STATUS_COLORS[indicator]
  const pulsing = indicator === 'degraded' || indicator === 'outage'

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
      role="status"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${pulsing ? 'animate-pulse-dot' : ''}`}
        style={{ backgroundColor: color, opacity: indicator === 'unknown' ? 0.5 : 1 }}
        aria-hidden="true"
      />
      {LABELS[indicator]}
      {stale && indicator !== 'unknown' && <span className="text-[var(--text-muted)]">· stale</span>}
    </span>
  )
}

export default StatusBadge
