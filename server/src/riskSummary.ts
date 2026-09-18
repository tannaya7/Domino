import { getRiskLevel } from '../../src/lib/risk'

export interface RiskSummaryInput {
  name: string
  type: string
  downstream: string[]
  upstream: string[]
}

// TODO: replace with a real Amazon Bedrock call (e.g. InvokeModel via
// @aws-sdk/client-bedrock-runtime, prompt: "Given this component and its affected
// dependencies, write a 2-3 sentence risk summary for a developer...") once Bedrock
// model access is enabled in your AWS account. This deterministic generator stands
// in so the rest of the app keeps working without AWS credentials.
export async function getRiskSummary(input: RiskSummaryInput): Promise<string> {
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
