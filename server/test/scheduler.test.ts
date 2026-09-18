import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vendor } from '../../src/lib/types'

function fixtureVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    key: 'stripe',
    vendor: 'Stripe',
    tier: 'payments',
    substrate: ['aws'],
    sla: 0.999,
    detectedVia: [],
    detectedInFiles: [],
    ...overrides,
  }
}

async function importFreshScheduler() {
  vi.resetModules()
  return import('../src/scheduler')
}

describe('pollVendorStatusOnce', () => {
  afterEach(() => {
    vi.doUnmock('../src/statusPoll')
    vi.doUnmock('../src/sns')
    vi.resetModules()
  })

  it('does nothing when no vendors are being watched', async () => {
    const fetchAllVendorStatuses = vi.fn()
    vi.doMock('../src/statusPoll', () => ({ fetchAllVendorStatuses }))
    const { pollVendorStatusOnce } = await importFreshScheduler()

    await pollVendorStatusOnce()
    expect(fetchAllVendorStatuses).not.toHaveBeenCalled()
  })

  it('publishes an alert only for degraded/outage vendors, not operational or unknown ones', async () => {
    const fetchAllVendorStatuses = vi.fn().mockResolvedValue([
      { vendorKey: 'ok', indicator: 'operational', checkedAt: '', stale: false },
      { vendorKey: 'bad', indicator: 'outage', checkedAt: '', stale: false, description: 'down' },
      { vendorKey: 'unclear', indicator: 'unknown', checkedAt: '', stale: true },
    ])
    const publishVendorDegradationAlert = vi.fn().mockResolvedValue({ published: true })
    vi.doMock('../src/statusPoll', () => ({ fetchAllVendorStatuses }))
    vi.doMock('../src/sns', () => ({ publishVendorDegradationAlert }))

    const { pollVendorStatusOnce, setVendorsToWatch } = await importFreshScheduler()
    setVendorsToWatch([
      fixtureVendor({ key: 'ok' }),
      fixtureVendor({ key: 'bad', vendor: 'Bad Vendor' }),
      fixtureVendor({ key: 'unclear' }),
    ])

    await pollVendorStatusOnce()

    expect(publishVendorDegradationAlert).toHaveBeenCalledTimes(1)
    expect(publishVendorDegradationAlert).toHaveBeenCalledWith(
      expect.objectContaining({ vendorKey: 'bad', vendorName: 'Bad Vendor', indicator: 'outage' }),
    )
  })
})

describe('startStatusPolling / stopStatusPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('../src/statusPoll')
    vi.doUnmock('../src/sns')
    vi.resetModules()
  })

  it('polls on the configured interval and stops when asked', async () => {
    process.env.STATUS_POLL_INTERVAL_MS = '1000'
    const fetchAllVendorStatuses = vi.fn().mockResolvedValue([])
    vi.doMock('../src/statusPoll', () => ({ fetchAllVendorStatuses }))
    vi.doMock('../src/sns', () => ({ publishVendorDegradationAlert: vi.fn() }))

    const { startStatusPolling, stopStatusPolling, setVendorsToWatch } = await importFreshScheduler()
    setVendorsToWatch([fixtureVendor()])
    startStatusPolling()

    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchAllVendorStatuses).toHaveBeenCalledTimes(1)

    stopStatusPolling()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchAllVendorStatuses).toHaveBeenCalledTimes(1) // no further calls after stop

    delete process.env.STATUS_POLL_INTERVAL_MS
  })

  it('a single failed poll cycle does not throw or stop future cycles', async () => {
    process.env.STATUS_POLL_INTERVAL_MS = '1000'
    const fetchAllVendorStatuses = vi.fn().mockRejectedValue(new Error('boom'))
    vi.doMock('../src/statusPoll', () => ({ fetchAllVendorStatuses }))
    vi.doMock('../src/sns', () => ({ publishVendorDegradationAlert: vi.fn() }))

    const { startStatusPolling, stopStatusPolling, setVendorsToWatch } = await importFreshScheduler()
    setVendorsToWatch([fixtureVendor()])
    startStatusPolling()

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchAllVendorStatuses).toHaveBeenCalledTimes(2)

    stopStatusPolling()
    delete process.env.STATUS_POLL_INTERVAL_MS
  })
})
