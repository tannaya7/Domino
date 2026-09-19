import { describe, expect, it } from 'vitest'
import { computeStatusChip } from './statusChip'
import { STATUS_COLORS } from './colors'
import type { VendorStatus } from './types'

function status(indicator: VendorStatus['indicator'], overrides: Partial<VendorStatus> = {}): VendorStatus {
  return { vendorKey: 'x', indicator, checkedAt: '2026-01-01T00:00:00Z', stale: false, ...overrides }
}

describe('computeStatusChip', () => {
  it('shows an honest "Status unknown" before any status has been fetched', () => {
    expect(computeStatusChip(null, false)).toEqual({ label: 'Status unknown', color: STATUS_COLORS.unknown, pulsing: false })
  })

  it('shows "Checking status…" while the first fetch is in flight', () => {
    expect(computeStatusChip(null, true).label).toBe('Checking status…')
  })

  it('shows N/M operational with a green, non-pulsing chip when everything is operational', () => {
    const chip = computeStatusChip([status('operational', { vendorKey: 'a' }), status('operational', { vendorKey: 'b' })], false)
    expect(chip).toEqual({ label: '2/2 operational', color: STATUS_COLORS.operational, pulsing: false })
  })

  it('turns amber for a degraded vendor, not just a different label', () => {
    const chip = computeStatusChip([status('operational', { vendorKey: 'a' }), status('degraded', { vendorKey: 'b' })], false)
    expect(chip.label).toBe('1/2 operational')
    expect(chip.color).toBe(STATUS_COLORS.degraded)
    expect(chip.pulsing).toBe(true)
  })

  it('turns red for an outage, even alongside a degraded vendor', () => {
    const chip = computeStatusChip(
      [status('outage', { vendorKey: 'a' }), status('degraded', { vendorKey: 'b' }), status('operational', { vendorKey: 'c' })],
      false,
    )
    expect(chip.color).toBe(STATUS_COLORS.outage)
  })

  it('falls back to "Status unknown" when every vendor came back unknown, never claiming "0/M operational"', () => {
    const chip = computeStatusChip([status('unknown', { vendorKey: 'a' }), status('unknown', { vendorKey: 'b' })], false)
    expect(chip.label).toBe('Status unknown')
  })

  it('counts an unknown vendor toward the total but not toward operational', () => {
    const chip = computeStatusChip([status('operational', { vendorKey: 'a' }), status('unknown', { vendorKey: 'b' })], false)
    expect(chip.label).toBe('1/2 operational')
  })
})
