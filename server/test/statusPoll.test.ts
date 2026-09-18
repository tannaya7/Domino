import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAllVendorStatuses, fetchVendorStatus } from '../src/statusPoll'
import type { Vendor } from '../../src/lib/types'

function fixtureVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.9999,
    statusUrl: 'https://status.stripe.com/api/v2/status.json',
    detectedVia: [],
    detectedInFiles: [],
    ...overrides,
  }
}

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  vi.useRealTimers()
})

describe('fetchVendorStatus', () => {
  it('reports unknown/stale when the vendor has no statusUrl', async () => {
    const result = await fetchVendorStatus(fixtureVendor({ statusUrl: undefined }))
    expect(result).toEqual(expect.objectContaining({ indicator: 'unknown', stale: true }))
  })

  it.each([
    ['none', 'operational'],
    ['minor', 'degraded'],
    ['major', 'outage'],
    ['critical', 'outage'],
  ])('maps Statuspage indicator "%s" to "%s"', async (raw, expected) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: { indicator: raw, description: 'test' } }),
    }) as unknown as typeof fetch

    const result = await fetchVendorStatus(fixtureVendor())
    expect(result.indicator).toBe(expected)
    expect(result.stale).toBe(false)
  })

  it('reports unknown/stale for a non-ok HTTP response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
    const result = await fetchVendorStatus(fixtureVendor())
    expect(result).toEqual(expect.objectContaining({ indicator: 'unknown', stale: true }))
  })

  it('reports unknown/stale on a network error instead of throwing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    const result = await fetchVendorStatus(fixtureVendor())
    expect(result).toEqual(expect.objectContaining({ indicator: 'unknown', stale: true }))
  })

  it('reports unknown/stale on invalid JSON instead of throwing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('bad json')
      },
    }) as unknown as typeof fetch
    const result = await fetchVendorStatus(fixtureVendor())
    expect(result).toEqual(expect.objectContaining({ indicator: 'unknown', stale: true }))
  })

  it('never hangs — aborts and reports unknown/stale once the timeout elapses', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn((_url: string, opts?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }) as unknown as typeof fetch

    const promise = fetchVendorStatus(fixtureVendor())
    await vi.advanceTimersByTimeAsync(4000)
    const result = await promise
    expect(result).toEqual(expect.objectContaining({ indicator: 'unknown', stale: true }))
  })
})

describe('fetchAllVendorStatuses', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: { indicator: 'none' } }),
    }) as unknown as typeof fetch
  })

  it('returns one status per vendor, keyed correctly', async () => {
    const vendors = [fixtureVendor({ key: 'a' }), fixtureVendor({ key: 'b' })]
    const results = await fetchAllVendorStatuses(vendors)
    expect(results.map((r) => r.vendorKey).sort()).toEqual(['a', 'b'])
  })

  it("one vendor's failure doesn't affect the others", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: { indicator: 'none' } }) }) as unknown as typeof fetch

    const vendors = [fixtureVendor({ key: 'failing' }), fixtureVendor({ key: 'healthy' })]
    const results = await fetchAllVendorStatuses(vendors)
    const byKey = Object.fromEntries(results.map((r) => [r.vendorKey, r]))
    expect(byKey.failing.indicator).toBe('unknown')
    expect(byKey.healthy.indicator).toBe('operational')
  })
})
