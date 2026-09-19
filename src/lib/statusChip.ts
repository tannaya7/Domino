import { STATUS_COLORS } from './colors'
import type { VendorStatus } from './types'

export interface StatusChipInfo {
  label: string
  color: string
  pulsing: boolean
}

const UNKNOWN_CHIP: StatusChipInfo = { label: 'Status unknown', color: STATUS_COLORS.unknown, pulsing: false }

/**
 * "N/M operational" once we have real per-vendor status; an honest "Status unknown" before that —
 * never a fabricated "healthy". If every vendor's status came back unknown (unreachable feeds),
 * showing "0/M operational" would read as "all down" rather than "couldn't check" — so that case
 * gets the same honest "unknown" chip instead.
 */
export function computeStatusChip(vendorStatuses: VendorStatus[] | null, isLoading: boolean): StatusChipInfo {
  if (!vendorStatuses || vendorStatuses.length === 0) {
    if (isLoading) return { label: 'Checking status…', color: STATUS_COLORS.unknown, pulsing: false }
    return UNKNOWN_CHIP
  }

  const operational = vendorStatuses.filter((s) => s.indicator === 'operational').length
  const outage = vendorStatuses.filter((s) => s.indicator === 'outage').length
  const degraded = vendorStatuses.filter((s) => s.indicator === 'degraded').length
  if (operational + outage + degraded === 0) return UNKNOWN_CHIP // every vendor came back unknown

  const total = vendorStatuses.length
  const color = outage > 0 ? STATUS_COLORS.outage : degraded > 0 ? STATUS_COLORS.degraded : STATUS_COLORS.operational
  return { label: `${operational}/${total} operational`, color, pulsing: operational < total }
}
