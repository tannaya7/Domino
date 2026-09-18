import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()

vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: vi.fn().mockImplementation(function SNSClient() {
    return { send: sendMock }
  }),
  PublishCommand: vi.fn().mockImplementation(function PublishCommand(input: unknown) {
    return { input }
  }),
}))

async function importFreshSns() {
  vi.resetModules()
  return import('../src/sns')
}

describe('sns', () => {
  beforeEach(() => {
    sendMock.mockReset()
    delete process.env.SNS_ALERT_TOPIC_ARN
  })

  afterEach(() => {
    delete process.env.SNS_ALERT_TOPIC_ARN
  })

  it('isSnsConfigured is false without a topic ARN', async () => {
    const { isSnsConfigured } = await importFreshSns()
    expect(isSnsConfigured()).toBe(false)
  })

  it('no-ops without calling AWS when unconfigured', async () => {
    const { publishVendorDegradationAlert } = await importFreshSns()
    const result = await publishVendorDegradationAlert({ vendorKey: 'stripe', vendorName: 'Stripe', indicator: 'outage' })
    expect(result).toEqual({ published: false })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('publishes to the configured topic', async () => {
    process.env.SNS_ALERT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:alerts'
    sendMock.mockResolvedValueOnce({})
    const { publishVendorDegradationAlert } = await importFreshSns()

    const result = await publishVendorDegradationAlert({
      vendorKey: 'stripe',
      vendorName: 'Stripe',
      indicator: 'outage',
      description: 'Major outage',
    })

    expect(result).toEqual({ published: true })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const call = sendMock.mock.calls[0][0].input
    expect(call.TopicArn).toBe('arn:aws:sns:us-east-1:123456789012:alerts')
    expect(call.Message).toContain('Stripe')
    expect(call.Message).toContain('Major outage')
  })

  it('truncates the Subject to 100 characters (SNS limit)', async () => {
    process.env.SNS_ALERT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:alerts'
    sendMock.mockResolvedValueOnce({})
    const { publishVendorDegradationAlert } = await importFreshSns()

    const longName = 'A'.repeat(200)
    await publishVendorDegradationAlert({ vendorKey: 'x', vendorName: longName, indicator: 'outage' })
    const call = sendMock.mock.calls[0][0].input
    expect(call.Subject.length).toBeLessThanOrEqual(100)
  })

  it('returns published:false (never throws) when the SNS call fails', async () => {
    process.env.SNS_ALERT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:alerts'
    sendMock.mockRejectedValueOnce(new Error('AccessDeniedException'))
    const { publishVendorDegradationAlert } = await importFreshSns()

    await expect(
      publishVendorDegradationAlert({ vendorKey: 'x', vendorName: 'X', indicator: 'outage' }),
    ).resolves.toEqual({ published: false })
  })
})
