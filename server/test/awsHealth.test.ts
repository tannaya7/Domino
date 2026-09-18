import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const describeEventsMock = vi.fn()

vi.mock('@aws-sdk/client-health', () => ({
  HealthClient: vi.fn().mockImplementation(function HealthClient() {
    return { send: describeEventsMock }
  }),
  DescribeEventsCommand: vi.fn().mockImplementation(function DescribeEventsCommand(input: unknown) {
    return { input }
  }),
}))

const originalFetch = global.fetch

async function importFreshAwsHealth() {
  vi.resetModules()
  return import('../src/awsHealth')
}

describe('getAwsHealthStatus', () => {
  beforeEach(() => {
    describeEventsMock.mockReset()
    delete process.env.AWS_HEALTH_ENABLED
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.AWS_HEALTH_ENABLED
  })

  it('skips the account-specific API when AWS_HEALTH_ENABLED is not set, and uses the public feed', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<rss></rss>' }) as unknown as typeof fetch
    const { getAwsHealthStatus } = await importFreshAwsHealth()

    const result = await getAwsHealthStatus()
    expect(describeEventsMock).not.toHaveBeenCalled()
    expect(result.source).toBe('public-status-feed')
    expect(result.indicator).toBe('unknown')
  })

  it('reports source "unknown" when the public feed is also unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    const { getAwsHealthStatus } = await importFreshAwsHealth()

    const result = await getAwsHealthStatus()
    expect(result.source).toBe('unknown')
    expect(result.indicator).toBe('unknown')
  })

  it('uses the real Health API when enabled and reports operational with zero open events', async () => {
    process.env.AWS_HEALTH_ENABLED = 'true'
    describeEventsMock.mockResolvedValueOnce({ events: [] })
    const { getAwsHealthStatus } = await importFreshAwsHealth()

    const result = await getAwsHealthStatus()
    expect(result.source).toBe('aws-health-api')
    expect(result.indicator).toBe('operational')
  })

  it('reports degraded when the Health API returns open events', async () => {
    process.env.AWS_HEALTH_ENABLED = 'true'
    describeEventsMock.mockResolvedValueOnce({ events: [{ arn: 'x' }] })
    const { getAwsHealthStatus } = await importFreshAwsHealth()

    const result = await getAwsHealthStatus()
    expect(result.source).toBe('aws-health-api')
    expect(result.indicator).toBe('degraded')
  })

  it('falls back to the public feed when the Health API throws (e.g. no Business/Enterprise support plan)', async () => {
    process.env.AWS_HEALTH_ENABLED = 'true'
    describeEventsMock.mockRejectedValueOnce(new Error('SubscriptionRequiredException'))
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<rss></rss>' }) as unknown as typeof fetch
    const { getAwsHealthStatus } = await importFreshAwsHealth()

    const result = await getAwsHealthStatus()
    expect(result.source).toBe('public-status-feed')
  })
})
