import { getRiskLevel } from '../../src/lib/risk'
import type { Runbook, Vendor } from '../../src/lib/types'
import { extractJson, invokeBedrock } from './bedrock'

export interface RunbookInput {
  vendor: Vendor
  /** How many files in this codebase are affected if the vendor fails (from VendorWithBlastRadius.affectedFiles.length). */
  affectedFileCount: number
  /** Optional failure-scenario label for context, e.g. "AWS regional outage". */
  scenario?: string
}

function buildPrompt(input: RunbookInput): string {
  const { vendor, affectedFileCount, scenario } = input
  return [
    'You are an SRE writing an incident runbook for a vendor dependency failure.',
    `Vendor: ${vendor.vendor} (tier: ${vendor.tier}, substrate: ${vendor.substrate.join(', ')}).`,
    `Detected via: ${vendor.detectedVia.join(', ') || 'unknown signals'}.`,
    `Affected files in this codebase: ${affectedFileCount}.`,
    scenario ? `Failure scenario: ${scenario}.` : '',
    `Known fallback vendors: ${(vendor.fallbacks ?? []).join(', ') || 'none known'}.`,
    'Respond with ONLY JSON, no other text: {"summary": "2-3 sentences", "recommendedActions": ["action 1", "action 2", "action 3"]}',
  ]
    .filter(Boolean)
    .join('\n')
}

function deterministicRunbook(input: RunbookInput): Runbook {
  const { vendor, affectedFileCount } = input
  const riskLevel = getRiskLevel(affectedFileCount)

  const recommendedActions = [
    `Check ${vendor.vendor}'s status${vendor.statusUrl ? ` at ${vendor.statusUrl}` : ''} before assuming this is an outage.`,
    `Review the ${affectedFileCount} affected file(s) for a feature flag or circuit breaker around ${vendor.vendor}.`,
    riskLevel === 'High'
      ? `Escalate immediately — ${vendor.vendor} is on the critical path for ${affectedFileCount} files.`
      : `Monitor and schedule remediation during business hours.`,
  ]
  if (vendor.fallbacks && vendor.fallbacks.length > 0) {
    recommendedActions.push(`Consider ${vendor.fallbacks.join(' or ')} as a fallback if this recurs.`)
  }

  return {
    summary: `${vendor.vendor} (${vendor.tier}) failing would affect ${affectedFileCount} file(s) in this codebase, detected via ${vendor.detectedVia.join(', ') || 'unknown signals'}.`,
    riskLevel,
    recommendedActions,
    suggestedFallbacks: vendor.fallbacks,
    generatedBy: 'deterministic',
  }
}

/**
 * Generates a structured remediation runbook. Tries Bedrock first (when BEDROCK_MODEL_ID is
 * configured); falls back to a deterministic runbook — built from the same curated vendor data
 * (fallbacks, status URL) — on any failure, exactly like ./riskSummary.ts.
 */
export async function generateRunbook(input: RunbookInput): Promise<Runbook> {
  const raw = await invokeBedrock(buildPrompt(input))
  if (raw) {
    const parsed = extractJson<{ summary?: string; recommendedActions?: string[] }>(raw)
    if (parsed?.summary && Array.isArray(parsed.recommendedActions) && parsed.recommendedActions.length > 0) {
      return {
        summary: parsed.summary,
        riskLevel: getRiskLevel(input.affectedFileCount),
        recommendedActions: parsed.recommendedActions,
        suggestedFallbacks: input.vendor.fallbacks,
        generatedBy: 'bedrock',
      }
    }
  }
  return deterministicRunbook(input)
}
