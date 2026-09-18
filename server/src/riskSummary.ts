import { getRiskLevel } from '../../src/lib/risk'
import { extractJson, invokeBedrock } from './bedrock'

export interface RiskSummaryInput {
  name: string
  type: string
  downstream: string[]
  upstream: string[]
}

function buildPrompt(input: RiskSummaryInput): string {
  return [
    'You are a reliability engineer writing a short risk summary for another developer.',
    `Component: ${input.name} (${input.type}).`,
    `If it fails, these break: ${input.downstream.join(', ') || 'nothing tracked'}.`,
    `It depends on: ${input.upstream.join(', ') || 'nothing tracked'}.`,
    'Write 2-3 plain-English sentences covering what breaks and a recommendation.',
    'Respond with ONLY JSON, no other text: {"summary": "..."}',
  ].join('\n')
}

/** Tries the real Bedrock call; returns null (never throws) for the caller to fall back on. */
async function tryBedrockSummary(input: RiskSummaryInput): Promise<string | null> {
  const raw = await invokeBedrock(buildPrompt(input))
  if (!raw) return null
  const parsed = extractJson<{ summary?: string }>(raw)
  const summary = parsed?.summary?.trim()
  return summary && summary.length > 0 ? summary : null
}

/**
 * Real Amazon Bedrock is used when BEDROCK_MODEL_ID is configured (InvokeModel via
 * @aws-sdk/client-bedrock-runtime — see ./bedrock.ts). This deterministic generator is the
 * NON-NEGOTIABLE fallback: missing credentials, disabled model access, a timeout, or a malformed
 * response all fall through to it, so the app never depends on Bedrock being reachable.
 */
export async function getRiskSummary(input: RiskSummaryInput): Promise<string> {
  const bedrockSummary = await tryBedrockSummary(input)
  if (bedrockSummary) return bedrockSummary
  return generateDeterministicSummary(input)
}

function generateDeterministicSummary(input: RiskSummaryInput): string {
  const { name, type, downstream, upstream } = input
  const totalCount = downstream.length + upstream.length
  const risk = getRiskLevel(totalCount)

  if (totalCount === 0) {
    return `${name} is Low-risk — nothing else in the graph depends on it and it has no tracked dependencies of its own. Changes here are safe to ship without wider testing.`
  }

  const breakSentence =
    downstream.length > 0
      ? `If it fails, ${listWithOverflow(downstream, 3)} would break.`
      : `Nothing else in the graph depends on it, so failures here stay contained.`

  const dependsSentence =
    upstream.length > 0
      ? ` It relies on ${listWithOverflow(upstream, 3)}, so issues in those components could surface here too.`
      : ''

  const recommendation =
    risk === 'High'
      ? ' Recommend thorough testing and a staged rollout before deploying changes here.'
      : risk === 'Medium'
        ? ' Recommend running the affected tests before merging changes here.'
        : ' Standard review should be sufficient before merging changes here.'

  return `${name} (${type}) is ${risk}-risk — ${totalCount} component${totalCount === 1 ? '' : 's'} would be affected by a change here. ${breakSentence}${dependsSentence}${recommendation}`
}

function listWithOverflow(items: string[], maxShown: number): string {
  if (items.length <= maxShown) return listWithAnd(items)
  return `${items.slice(0, maxShown).join(', ')}, and others`
}

function listWithAnd(items: string[]): string {
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}
