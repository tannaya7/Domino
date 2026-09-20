/**
 * The ONLY place this app ever calls a live AWS Fault Injection Service API. Lists every FIS
 * action available in your account/region (paginated), fetches the full definition (parameters,
 * targets) for the candidates this tool's generator knows how to template, and writes the
 * verified subset to data/fis-actions.verified.json — the single file src/engine/fisTemplate.ts is
 * allowed to read action definitions from. It refuses to use anything not in that file.
 *
 * This script only ever READS (ListActions, GetAction) — it never creates, starts, or stops
 * anything. Running it is safe in any account with fis:ListActions/fis:GetAction permission.
 *
 * Usage: tsx scripts/verify-fis-actions.ts   (also: npm run verify:fis)
 * Requires AWS credentials with fis:ListActions and fis:GetAction (e.g. via `aws configure` or
 * AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_SESSION_TOKEN env vars) and AWS_REGION set.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FisClient, GetActionCommand, ListActionsCommand } from '@aws-sdk/client-fis'

const OUT_PATH = path.join(import.meta.dirname, '..', 'data', 'fis-actions.verified.json')
const PUBLIC_OUT_PATH = path.join(import.meta.dirname, '..', 'public', 'fis-actions.json')

/** iamPermissions isn't returned by ListActions/GetAction (see below) — if a previous run (or a
 * hand-curated draft) already has them for this action id, keep them instead of wiping to []. */
async function loadExistingIamPermissions(): Promise<Record<string, string[]>> {
  try {
    const raw = JSON.parse(await readFile(OUT_PATH, 'utf-8')) as { actions?: Array<{ id?: string; iamPermissions?: string[] }> }
    const map: Record<string, string[]> = {}
    for (const a of raw.actions ?? []) {
      if (a.id && Array.isArray(a.iamPermissions) && a.iamPermissions.length > 0) map[a.id] = a.iamPermissions
    }
    return map
  } catch {
    return {}
  }
}

/** The action IDs the generator (src/engine/fisTemplate.ts) knows how to template today. Adding a
 * new action there also means adding its id here so this script fetches and verifies it. */
const CANDIDATE_ACTION_IDS = new Set([
  'aws:ec2:stop-instances',
  'aws:rds:reboot-db-instances',
  'aws:rds:failover-db-cluster',
  'aws:ecs:stop-task',
  'aws:network:disrupt-connectivity',
  'aws:ebs:pause-volume-io',
])

interface VerifiedFisAction {
  id: string
  description: string
  targetType: string
  resourceType: string
  requiredParameters: string[]
  optionalParameters: string[]
  /** Not returned by ListActions/GetAction — IAM permissions an execution role needs are
   * documented separately by AWS (actions-reference.html), not discoverable via this API. Carried
   * over from whatever was already in data/fis-actions.verified.json for this action id (see
   * loadExistingIamPermissions); a human must fill these in by hand at least once. */
  iamPermissions: string[]
  capturedDate: string
  verified: true
  source: string
}

async function main() {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION
  if (!region) {
    console.error('Set AWS_REGION (or AWS_DEFAULT_REGION) before running this — FIS actions are region-scoped.')
    process.exitCode = 1
    return
  }

  const client = new FisClient({ region })

  console.log(`Listing FIS actions in ${region}...`)
  const allSummaries: Array<{ id?: string }> = []
  let nextToken: string | undefined
  do {
    const page = await client.send(new ListActionsCommand({ nextToken, maxResults: 100 }))
    allSummaries.push(...(page.actions ?? []))
    nextToken = page.nextToken
  } while (nextToken)
  console.log(`  ${allSummaries.length} total actions available in this account/region.`)

  const candidateIds = allSummaries.map((a) => a.id).filter((id): id is string => !!id && CANDIDATE_ACTION_IDS.has(id))
  const missing = [...CANDIDATE_ACTION_IDS].filter((id) => !candidateIds.includes(id))
  if (missing.length > 0) {
    console.warn(`  Not found in this account/region (skipping): ${missing.join(', ')}`)
  }

  const existingIamPermissions = await loadExistingIamPermissions()

  console.log(`Fetching full definitions for ${candidateIds.length} candidate action(s)...`)
  const capturedDate = new Date().toISOString().slice(0, 10)
  const actions: VerifiedFisAction[] = []
  for (const id of candidateIds) {
    const { action } = await client.send(new GetActionCommand({ id }))
    if (!action) continue
    const targetEntries = Object.entries(action.targets ?? {}) as Array<[string, { resourceType?: string }]>
    const target = targetEntries[0]?.[1]
    const paramEntries = Object.entries(action.parameters ?? {}) as Array<[string, { required?: boolean }]>
    actions.push({
      id,
      description: action.description ?? '',
      targetType: targetEntries[0]?.[0] ?? '',
      resourceType: target?.resourceType ?? '',
      requiredParameters: paramEntries.filter(([, p]) => p.required).map(([name]) => name),
      optionalParameters: paramEntries.filter(([, p]) => !p.required).map(([name]) => name),
      iamPermissions: existingIamPermissions[id] ?? [],
      capturedDate,
      verified: true,
      source: `aws fis get-action --id ${id} (region ${region}), captured ${capturedDate}`,
    })
    console.log(`  ${id}: ${targetEntries[0]?.[0] ?? '(no target type)'} — ${paramEntries.length} parameter(s)`)
  }

  const output = {
    $comment:
      'Generated by scripts/verify-fis-actions.ts from a live aws fis list-actions + get-action call. iamPermissions were NOT returned by the API — confirm/fill them from https://docs.aws.amazon.com/fis/latest/userguide/actions-reference.html before relying on the generated IAM role.',
    generatedAt: new Date().toISOString(),
    region,
    fileVerified: true,
    actions,
  }

  const json = JSON.stringify(output, null, 2)
  await writeFile(OUT_PATH, json)
  // Also mirrored to public/ — the same static-asset-fetch pattern public/substrate-verification.json
  // uses, so the frontend never needs a bundler-time import of a file outside src/.
  await writeFile(PUBLIC_OUT_PATH, json)
  console.log(`\nWrote ${OUT_PATH} and ${PUBLIC_OUT_PATH} — ${actions.length} verified action(s).`)
  if (actions.length < CANDIDATE_ACTION_IDS.size) {
    console.log('iamPermissions are empty for every action — fill them in by hand from the AWS FIS permissions docs before generating real templates.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
