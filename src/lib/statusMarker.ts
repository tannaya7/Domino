import type { StatusIndicator } from './types'

/** Icon + label per indicator — status is never color-only anywhere it's shown (node overlay,
 * banner, or badge). */
export const STATUS_MARKER: Record<StatusIndicator, { icon: string; label: string }> = {
  operational: { icon: '✓', label: 'Operational' },
  degraded: { icon: '!', label: 'Degraded' },
  outage: { icon: '✕', label: 'Outage' },
  unknown: { icon: '?', label: 'Unknown' },
}

/**
 * Every status shown in this app is a point-in-time check, never a live stream — this formats
 * that honestly ("as of 14:32") instead of ever implying real-time. Used by both the per-vendor
 * banner and (per the "demo/snapshot mode" requirement) any captured/replayed status display.
 */
export function formatAsOf(checkedAt: string): string {
  const date = new Date(checkedAt)
  if (Number.isNaN(date.getTime())) return 'as of an unknown time'
  return `as of ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}
