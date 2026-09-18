/**
 * Exercises every AWS integration on the DEPLOYED stack (not mocks, not local) and writes
 * docs/AWS_VERIFICATION.md with a timestamped pass/fail/skipped result and a reason for each.
 *
 * Requires: AWS CLI authenticated, region resolvable, and the stack already deployed
 * (`npm run deploy`). Reads resource names from `aws cloudformation describe-stacks` rather than
 * hardcoding them, so it always checks whatever is actually live.
 *
 * Run: npm run verify:aws
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const STACK_NAME = process.env.STACK_NAME ?? 'blast-radius-mapper'

interface CheckResult {
  name: string
  status: 'pass' | 'fail' | 'skipped'
  detail: string
  durationMs?: number
}

function sh(cmd: string): string {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveRegion(): string {
  if (process.env.AWS_REGION) return process.env.AWS_REGION
  try {
    const configured = sh('aws configure get region')
    if (configured) return configured
  } catch {
    // fall through
  }
  throw new Error('No AWS region resolved. Set AWS_REGION or run `aws configure set region <region>`.')
}

function stackOutput(region: string, key: string): string {
  return sh(
    `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${region} ` +
      `--query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue" --output text`,
  )
}

// --------------------------------------------------------------------------------------------
// Individual checks — each is independent and never throws; failures/skips are data, not crashes.
// --------------------------------------------------------------------------------------------

async function checkDynamoDb(region: string, tableName: string): Promise<CheckResult> {
  const name = 'DynamoDB put/get + TTL attribute'
  const start = Date.now()
  const testKey = `__verify-aws-smoke-test__${Date.now()}`
  try {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb')
    const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } = await import('@aws-sdk/lib-dynamodb')
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }))
    const ttl = Math.floor(Date.now() / 1000) + 60

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: { repo_url: testKey, graph_data: '{}', created_at: Date.now(), ttl_ms: 60_000, ttl },
      }),
    )
    const got = await client.send(new GetCommand({ TableName: tableName, Key: { repo_url: testKey } }))
    // Clean up ONLY the item this check just wrote — never touches a real cached repo's entry.
    await client.send(new DeleteCommand({ TableName: tableName, Key: { repo_url: testKey } }))

    if (got.Item?.ttl !== ttl) throw new Error('Item round-tripped but the ttl attribute did not match.')
    return {
      name,
      status: 'pass',
      detail: `Wrote and read back a test item in ${tableName}; ttl attribute present and correct.`,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return { name, status: 'fail', detail: String(err), durationMs: Date.now() - start }
  }
}

async function checkBedrock(region: string): Promise<CheckResult> {
  const name = 'Bedrock Converse smoke test'
  const modelId = process.env.BEDROCK_MODEL_ID
  if (!modelId) {
    return { name, status: 'skipped', detail: 'BEDROCK_MODEL_ID not set — stack was deployed with Bedrock disabled (deterministic fallback only).' }
  }
  const start = Date.now()
  try {
    const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime')
    const client = new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION ?? region })
    const response = await client.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: 'user', content: [{ text: 'Respond with ONLY this exact JSON, no other text: {"ok": true}' }] }],
        inferenceConfig: { maxTokens: 64, temperature: 0 },
      }),
    )
    const output = response as { output?: { message?: { content?: Array<{ text?: string }> } } }
    const text = output.output?.message?.content?.find((b) => typeof b.text === 'string')?.text ?? ''
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
    const parsed = JSON.parse((fenced ? fenced[1] : text).trim()) as { ok?: boolean }
    if (parsed.ok !== true) throw new Error(`Model responded but not with the expected JSON: ${text}`)
    return { name, status: 'pass', detail: `Model ${modelId} returned valid JSON via Converse.`, durationMs: Date.now() - start }
  } catch (err) {
    return { name, status: 'fail', detail: String(err), durationMs: Date.now() - start }
  }
}

async function checkPublicStatusFeedFallback(): Promise<CheckResult> {
  const name = 'AWS Health public-feed fallback'
  const start = Date.now()
  try {
    const res = await fetch('https://status.aws.amazon.com/rss/all.rss', { signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { name, status: 'pass', detail: 'Public AWS status feed reachable.', durationMs: Date.now() - start }
  } catch (err) {
    return { name, status: 'fail', detail: String(err), durationMs: Date.now() - start }
  }
}

async function checkAwsHealth(region: string): Promise<CheckResult> {
  const name = 'AWS Health describeEvents'
  if (process.env.AWS_HEALTH_ENABLED !== 'true') {
    const fallback = await checkPublicStatusFeedFallback()
    return {
      name,
      status: 'skipped',
      detail: `AWS_HEALTH_ENABLED was not set for this deploy. Verified the fallback instead: ${fallback.status} — ${fallback.detail}`,
    }
  }
  const start = Date.now()
  try {
    const { HealthClient, DescribeEventsCommand } = await import('@aws-sdk/client-health')
    const client = new HealthClient({ region })
    const result = await client.send(new DescribeEventsCommand({ filter: { eventStatusCodes: ['open', 'upcoming'] } }))
    return {
      name,
      status: 'pass',
      detail: `Real describeEvents call succeeded — ${result.events?.length ?? 0} open/upcoming event(s). This account has Health API access.`,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const message = String(err)
    if (/SubscriptionRequiredException/.test(message)) {
      const fallback = await checkPublicStatusFeedFallback()
      return {
        name,
        status: 'skipped',
        detail: `skipped: needs Business/Enterprise support; public-feed fallback verified (${fallback.status} — ${fallback.detail})`,
        durationMs: Date.now() - start,
      }
    }
    return { name, status: 'fail', detail: message, durationMs: Date.now() - start }
  }
}

async function checkSns(region: string, topicArn: string): Promise<CheckResult> {
  const name = 'SNS publish'
  const start = Date.now()
  try {
    const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns')
    const client = new SNSClient({ region })
    await client.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: 'verify-aws smoke test',
        Message: 'Automated smoke test from scripts/verify-aws.ts — safe to ignore.',
      }),
    )
    return {
      name,
      status: 'pass',
      detail: `Published a test message to ${topicArn}. If an email is subscribed, expect to see it arrive.`,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return { name, status: 'fail', detail: String(err), durationMs: Date.now() - start }
  }
}

async function checkScheduler(region: string, functionName: string): Promise<CheckResult> {
  const name = 'Scheduler invocation visible in CloudWatch Logs'
  const start = Date.now()
  const outFile = '/tmp/verify-aws-scheduler-output.json'
  try {
    sh(`aws lambda invoke --function-name ${functionName} --region ${region} --cli-read-timeout 60 ${outFile}`)
    const invokeResult = JSON.parse(readFileSync(outFile, 'utf-8'))

    // CloudWatch ingestion lags a live invocation by a few seconds.
    await sleep(5000)
    const logs = sh(`aws logs tail /aws/lambda/${functionName} --region ${region} --since 3m --format short`)
    if (!logs.includes('[schedulerHandler]')) {
      throw new Error('Invocation returned, but its log line was not visible in CloudWatch within the wait window.')
    }
    return {
      name,
      status: 'pass',
      detail: `Direct invoke returned ${JSON.stringify(invokeResult)}; log line confirmed in CloudWatch.`,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return { name, status: 'fail', detail: String(err), durationMs: Date.now() - start }
  }
}

async function checkAnalyzeRepoEndToEnd(apiUrl: string): Promise<CheckResult> {
  const name = 'End-to-end /analyze-repo (cold start)'
  const start = Date.now()
  try {
    const res = await fetch(`${apiUrl}/analyze-repo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/stripe-samples/accept-a-payment' }),
      signal: AbortSignal.timeout(35_000),
    })
    const wallClockMs = Date.now() - start
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    const body = (await res.json()) as {
      nodes?: unknown[]
      vendors?: unknown[]
      meta?: { elapsedMs?: number; truncated?: boolean }
    }
    if (!Array.isArray(body.nodes)) throw new Error('Response was 200 but missing a nodes array.')
    return {
      name,
      status: 'pass',
      detail:
        `${body.nodes.length} node(s), ${body.vendors?.length ?? 0} vendor(s) detected, ` +
        `truncated=${body.meta?.truncated ?? 'unknown'}, app-reported elapsedMs=${body.meta?.elapsedMs ?? 'unknown'}, ` +
        `wall-clock (includes cold start + network)=${wallClockMs}ms.`,
      durationMs: wallClockMs,
    }
  } catch (err) {
    return { name, status: 'fail', detail: String(err), durationMs: Date.now() - start }
  }
}

// --------------------------------------------------------------------------------------------

function writeReport(region: string, results: CheckResult[]): void {
  const timestamp = new Date().toISOString()
  const passCount = results.filter((r) => r.status === 'pass').length
  const failCount = results.filter((r) => r.status === 'fail').length
  const skipCount = results.filter((r) => r.status === 'skipped').length

  const rows = results
    .map(
      (r) =>
        `| ${r.name} | ${r.status.toUpperCase()} | ${r.durationMs != null ? `${r.durationMs}ms` : '—'} | ${r.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`,
    )
    .join('\n')

  const content = `# AWS Verification Report

Generated by \`scripts/verify-aws.ts\` against the deployed stack — every row below reflects a
real call against a live AWS account, not a mock.

- **Timestamp:** ${timestamp}
- **Region:** ${region}
- **Stack:** ${STACK_NAME}
- **Result:** ${passCount} passed, ${failCount} failed, ${skipCount} skipped

| Check | Status | Duration | Detail |
|---|---|---|---|
${rows}

${failCount > 0 ? '**One or more checks failed. Do not update DEPLOYMENT.md/README claims for the failing item(s) — only mark what actually passed as verified.**' : 'All checks passed or were explicitly skipped with a stated reason (never silently treated as passing).'}
`

  mkdirSync('docs', { recursive: true })
  writeFileSync('docs/AWS_VERIFICATION.md', content)
  console.log(content)
  if (failCount > 0) process.exitCode = 1
}

async function main(): Promise<void> {
  const region = resolveRegion()
  console.log(`Reading stack outputs for "${STACK_NAME}" in ${region}...`)

  const tableName = stackOutput(region, 'GraphCacheTableName')
  const topicArn = stackOutput(region, 'VendorAlertsTopicArn')
  const schedulerFunctionName = stackOutput(region, 'SchedulerFunctionName')
  const apiUrl = stackOutput(region, 'ApiUrl')

  if (!tableName || !topicArn || !schedulerFunctionName || !apiUrl) {
    throw new Error(
      `Missing one or more stack outputs — is "${STACK_NAME}" actually deployed? Run \`npm run deploy\` first.`,
    )
  }

  const results: CheckResult[] = []
  results.push(await checkDynamoDb(region, tableName))
  results.push(await checkBedrock(region))
  results.push(await checkAwsHealth(region))
  results.push(await checkSns(region, topicArn))
  results.push(await checkScheduler(region, schedulerFunctionName))
  results.push(await checkAnalyzeRepoEndToEnd(apiUrl))

  writeReport(region, results)
}

main().catch((err) => {
  console.error('verify-aws failed before checks could run:', err)
  process.exitCode = 1
})
