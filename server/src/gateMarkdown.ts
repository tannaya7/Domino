import type { ConcentrationResult } from '../../src/lib/types'
import type { GateNarrative } from './gateNarrative'
import type { PolicyResult } from './policy'
import type { GateNewVendor } from './prGate'

// The exact marker the Action greps for (via `gh api` + jq) to find its own previous comment and
// update it in place on a new push, instead of spamming a fresh comment every time. Must be the
// very first thing in the markdown, byte-for-byte stable across regenerations.
export const GATE_COMMENT_MARKER = '<!-- blast-radius-mapper -->'

export interface GateMarkdownInput {
  pr: { owner: string; repo: string; number: number }
  baselineNote: string
  newVendors: GateNewVendor[]
  entrypointsAffected: string[]
  totalEntrypoints: number
  concentration: { before: ConcentrationResult; after: ConcentrationResult }
  exposure: { before: number; after: number; delta: number; currency: string }
  meaningfulChange: boolean
  policy: PolicyResult
  narrative: GateNarrative
  truncated: boolean
}

function formatPct(share: number): string {
  return `${Math.round(share * 100)}%`
}

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr`
}

function verdictLine(policy: PolicyResult): string {
  if (policy.status === 'info') return ':information_source: **Report only** — no policy configured for this repo.'
  if (policy.status === 'pass') return ':white_check_mark: **Pass** — within policy.'
  if (policy.status === 'warn') return ':warning: **Warning** — policy violation(s) found (non-blocking).'
  return ':x: **Fail** — policy violation(s) found.'
}

/** Pure — same input always produces byte-identical markdown (see gateMarkdown.snapshot.test.ts).
 * The hidden marker lets the Action upsert this comment in place across pushes instead of piling
 * up a new one every time (see action/action.yml's "upsert sticky comment" step). */
export function buildGateMarkdown(input: GateMarkdownInput): string {
  const { pr, baselineNote, newVendors, entrypointsAffected, totalEntrypoints, concentration, exposure, policy, narrative, truncated } =
    input

  const lines: string[] = []
  lines.push(GATE_COMMENT_MARKER)
  lines.push(`## Blast Radius — PR Resilience Gate`)
  lines.push('')
  lines.push(verdictLine(policy))
  lines.push('')

  if (policy.violations.length > 0) {
    lines.push('| Rule | Actual | Limit |')
    lines.push('|---|---|---|')
    for (const v of policy.violations) {
      lines.push(`| ${v.rule} | ${v.message} | — |`)
    }
    lines.push('')
  }

  lines.push('| | Before this PR | After this PR |')
  lines.push('|---|---|---|')
  lines.push(`| Vendors | ${concentration.before.vendorCount} | ${concentration.after.vendorCount} |`)
  lines.push(`| Substrates | ${concentration.before.substrateCount} | ${concentration.after.substrateCount} |`)
  lines.push(
    `| Most concentrated | ${concentration.before.mostConcentrated ? `${formatPct(concentration.before.mostConcentrated.share)} on ${concentration.before.mostConcentrated.substrate}` : '—'} | ${concentration.after.mostConcentrated ? `${formatPct(concentration.after.mostConcentrated.share)} on ${concentration.after.mostConcentrated.substrate}` : '—'} |`,
  )
  lines.push(
    `| Modeled exposure | ${formatMoney(exposure.before, exposure.currency)} | ${formatMoney(exposure.after, exposure.currency)} |`,
  )
  lines.push('')

  lines.push(
    input.meaningfulChange
      ? `**Exposure delta:** ${exposure.delta >= 0 ? '+' : ''}${formatMoney(exposure.delta, exposure.currency)}`
      : '**Exposure delta:** no meaningful change at current assumptions',
  )
  lines.push('')

  lines.push(`### New vendors (${newVendors.length})`)
  if (newVendors.length === 0) {
    lines.push('None detected.')
  } else {
    for (const v of newVendors) {
      const files = v.files.slice(0, 3).join(', ') + (v.files.length > 3 ? `, +${v.files.length - 3} more` : '')
      lines.push(`- **${v.vendor}** (${v.category}) on \`${v.substrate.join(', ') || 'unknown'}\` — via ${v.detectedVia.join(', ')} in ${files}`)
    }
  }
  lines.push('')

  lines.push(`### Entrypoints affected (${entrypointsAffected.length}/${totalEntrypoints})`)
  if (entrypointsAffected.length === 0) {
    lines.push('None.')
  } else {
    for (const ep of entrypointsAffected.slice(0, 5)) lines.push(`- \`${ep}\``)
    if (entrypointsAffected.length > 5) lines.push(`- +${entrypointsAffected.length - 5} more`)
  }
  lines.push('')

  lines.push('### Why it matters')
  lines.push(narrative.text)
  lines.push(narrative.generatedBy === 'bedrock' ? '_AI-generated — numbers computed by the engine, not the model._' : '_Deterministic fallback — no AI model was used._')
  lines.push('')

  if (truncated) lines.push('_Only a subset of this PR’s changed files could be scanned within the time/file budget._')
  lines.push(`_Baseline: ${baselineNote}. Modeled estimate under editable assumptions — never a guarantee._`)
  lines.push('')
  lines.push(`<sub>blast-radius-mapper · ${pr.owner}/${pr.repo}#${pr.number}</sub>`)

  return lines.join('\n')
}
