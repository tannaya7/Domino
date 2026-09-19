import { describe, expect, it } from 'vitest'
import { selectBannerVendor } from './vendorStatusBanner'
import type { VendorStatus } from './types'

function status(vendorKey: string, indicator: VendorStatus['indicator']): VendorStatus {
  return { vendorKey, indicator, checkedAt: '2026-01-01T00:00:00Z', stale: false }
}

describe('selectBannerVendor', () => {
  it('returns null when everything is operational', () => {
    expect(selectBannerVendor([status('a', 'operational'), status('b', 'operational')], new Map())).toBeNull()
  })

  it('returns null when everything is unknown — unknown never triggers a banner', () => {
    expect(selectBannerVendor([status('a', 'unknown')], new Map())).toBeNull()
  })

  it('picks the sole degraded/outage vendor out of a mixed status set', () => {
    const statuses = [status('a', 'operational'), status('b', 'degraded'), status('c', 'unknown')]
    expect(selectBannerVendor(statuses, new Map())?.vendorKey).toBe('b')
  })

  it('prefers outage over degraded regardless of entrypoint counts', () => {
    const statuses = [status('a', 'degraded'), status('b', 'outage')]
    const entrypoints = new Map([['a', 100], ['b', 1]])
    const result = selectBannerVendor(statuses, entrypoints)
    expect(result?.vendorKey).toBe('b')
    expect(result?.indicator).toBe('outage')
  })

  it('breaks a same-severity tie by whichever vendor has more dependent entrypoints', () => {
    const statuses = [status('a', 'degraded'), status('b', 'degraded')]
    const entrypoints = new Map([['a', 2], ['b', 9]])
    expect(selectBannerVendor(statuses, entrypoints)?.vendorKey).toBe('b')
  })

  it('breaks a fully-tied case by vendor key for determinism', () => {
    const statuses = [status('zeta', 'outage'), status('alpha', 'outage')]
    expect(selectBannerVendor(statuses, new Map())?.vendorKey).toBe('alpha')
  })

  it('reports the entrypoint count for the selected vendor', () => {
    const statuses = [status('a', 'outage')]
    expect(selectBannerVendor(statuses, new Map([['a', 17]]))?.entrypointsAffected).toBe(17)
  })
})
