import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vendor } from '../../src/lib/types'

const scanSendMock = vi.fn()
const fetchAllVendorStatusesMock = vi.fn()
const publishVendorDegradationAlertMock = vi.fn()

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(function DynamoDBClient() {
    return {}
  }),
}))
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn().mockImplementation(() => ({ send: scanSendMock })) },
  ScanCommand: vi.fn().mockImplementation(function ScanCommand(input: unknown) {
    return { input }
  }),
}))
vi.mock('../src/statusPoll', () => ({ fetchAllVendorStatuses: fetchAllVendorStatusesMock }))
vi.mock('../src/sns', () => ({ publishVendorDegradationAlert: publishVendorDegradationAlertMock }))

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

function cacheItem(vendors: Vendor[]) {
  return { graph_data: JSON.stringify({ vendors }) }
}

async function importFreshHandler() {
  vi.resetModules()
  return import('../src/schedulerHandler')
}

describe('pollAndAlert', () => {
  beforeEach(() => {
    scanSendMock.mockReset()
    fetchAllVendorStatusesMock.mockReset()
    publishVendorDegradationAlertMock.mockReset()
    process.env.DYNAMODB_GRAPH_CACHE_TABLE = 'graph-cache-test'
  })

  afterEach(() => {
    delete process.env.DYNAMODB_GRAPH_CACHE_TABLE
  })

  it('does nothing when DynamoDB is not configured', async () => {
    delete process.env.DYNAMODB_GRAPH_CACHE_TABLE
    const { pollAndAlert } = await importFreshHandler()
    const result = await pollAndAlert()
    expect(result).toEqual({ vendorsPolled: 0, alertsPublished: 0 })
    expect(scanSendMock).not.toHaveBeenCalled()
  })

  it('does nothing when the table scan finds no cached vendors', async () => {
    scanSendMock.mockResolvedValueOnce({ Items: [] })
    const { pollAndAlert } = await importFreshHandler()
    const result = await pollAndAlert()
    expect(result).toEqual({ vendorsPolled: 0, alertsPublished: 0 })
    expect(fetchAllVendorStatusesMock).not.toHaveBeenCalled()
  })

  it('deduplicates the same vendor found across multiple cached repos', async () => {
    scanSendMock.mockResolvedValueOnce({
      Items: [cacheItem([fixtureVendor({ key: 'stripe' })]), cacheItem([fixtureVendor({ key: 'stripe' })])],
    })
    fetchAllVendorStatusesMock.mockResolvedValueOnce([
      { vendorKey: 'stripe', indicator: 'operational', checkedAt: '', stale: false },
    ])

    const { pollAndAlert } = await importFreshHandler()
    const result = await pollAndAlert()

    expect(result.vendorsPolled).toBe(1)
    expect(fetchAllVendorStatusesMock).toHaveBeenCalledWith([expect.objectContaining({ key: 'stripe' })])
  })

  it('publishes an alert only for degraded/outage vendors', async () => {
    scanSendMock.mockResolvedValueOnce({
      Items: [cacheItem([fixtureVendor({ key: 'ok' }), fixtureVendor({ key: 'bad', vendor: 'Bad Vendor' })])],
    })
    fetchAllVendorStatusesMock.mockResolvedValueOnce([
      { vendorKey: 'ok', indicator: 'operational', checkedAt: '', stale: false },
      { vendorKey: 'bad', indicator: 'outage', checkedAt: '', stale: false, description: 'down' },
    ])
    publishVendorDegradationAlertMock.mockResolvedValue({ published: true })

    const { pollAndAlert } = await importFreshHandler()
    const result = await pollAndAlert()

    expect(publishVendorDegradationAlertMock).toHaveBeenCalledTimes(1)
    expect(publishVendorDegradationAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({ vendorKey: 'bad', vendorName: 'Bad Vendor', indicator: 'outage' }),
    )
    expect(result).toEqual({ vendorsPolled: 2, alertsPublished: 1 })
  })

  it('skips a malformed cache item instead of failing the whole poll cycle', async () => {
    scanSendMock.mockResolvedValueOnce({
      Items: [{ graph_data: 'not json' }, cacheItem([fixtureVendor()])],
    })
    fetchAllVendorStatusesMock.mockResolvedValueOnce([
      { vendorKey: 'stripe', indicator: 'operational', checkedAt: '', stale: false },
    ])

    const { pollAndAlert } = await importFreshHandler()
    const result = await pollAndAlert()
    expect(result.vendorsPolled).toBe(1)
  })

  it('returns zero counts instead of throwing when the DynamoDB scan itself fails', async () => {
    scanSendMock.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'))
    const { pollAndAlert } = await importFreshHandler()
    await expect(pollAndAlert()).resolves.toEqual({ vendorsPolled: 0, alertsPublished: 0 })
  })
})

describe('handler', () => {
  beforeEach(() => {
    scanSendMock.mockReset()
    process.env.DYNAMODB_GRAPH_CACHE_TABLE = 'graph-cache-test'
  })

  afterEach(() => {
    delete process.env.DYNAMODB_GRAPH_CACHE_TABLE
  })

  it('returns the poll result (and logs it) for CloudWatch visibility', async () => {
    scanSendMock.mockResolvedValueOnce({ Items: [] })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { handler } = await importFreshHandler()

    const result = await handler()

    expect(result).toEqual({ vendorsPolled: 0, alertsPublished: 0 })
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('schedulerHandler'))
    logSpy.mockRestore()
  })
})
