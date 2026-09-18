import { withTimeout } from './withTimeout'

// Publishes vendor-degradation alerts to SNS when SNS_ALERT_TOPIC_ARN is configured; otherwise
// this is a safe no-op so local dev never needs an SNS topic to run. Credentials resolve via the
// standard AWS SDK credential chain — never hardcoded here.

function getTopicArn(): string | undefined {
  return process.env.SNS_ALERT_TOPIC_ARN
}

function getRegion(): string {
  return process.env.AWS_REGION ?? 'us-east-1'
}

export function isSnsConfigured(): boolean {
  return Boolean(getTopicArn())
}

let clientPromise: Promise<import('@aws-sdk/client-sns').SNSClient> | null = null

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { SNSClient } = await import('@aws-sdk/client-sns')
      return new SNSClient({ region: getRegion() })
    })()
  }
  return clientPromise
}

export interface VendorDegradationAlert {
  vendorKey: string
  vendorName: string
  indicator: string
  description?: string
}

export interface PublishResult {
  published: boolean
}

/** Publishes an alert if SNS is configured; returns { published: false } (never throws) otherwise or on failure. */
export async function publishVendorDegradationAlert(alert: VendorDegradationAlert): Promise<PublishResult> {
  const topicArn = getTopicArn()
  if (!topicArn) return { published: false }

  try {
    const { PublishCommand } = await import('@aws-sdk/client-sns')
    const client = await getClient()
    await withTimeout(
      client.send(
        new PublishCommand({
          TopicArn: topicArn,
          Subject: `Vendor degraded: ${alert.vendorName}`.slice(0, 100), // SNS Subject is capped at 100 chars
          Message: `${alert.vendorName} (${alert.vendorKey}) is reporting "${alert.indicator}".${alert.description ? ` ${alert.description}` : ''}`,
        }),
      ),
      5000,
      'SNS Publish',
    )
    return { published: true }
  } catch {
    return { published: false }
  }
}
