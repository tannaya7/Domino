import type { Currency } from '../lib/currency'
import { formatCurrency } from '../lib/currency'
import type { RecommendedMove } from '../lib/types'
import type { TourStep } from './types'

export interface TourStepContext {
  vendorCount: number
  substrateCount: number
  hiddenSharePercentValue: number
  expectedLossPerYear: number
  currency: Currency
  /** null when no substrate is shared by more than one vendor — step 3 is skipped, not faked. */
  mostConcentratedSubstrate: string | null
  mostConcentratedVendorCount: number
  scenarioLabel: string
  scenarioAffectedEntrypoints: number
  totalEntrypoints: number
  /** null when the bundled snapshot has no precomputed recommendation — step 5 is skipped. */
  topMove: RecommendedMove | null
  actions: {
    runScenario: () => void
    applyTopMove: () => void
    openRiskRegister: () => void
    goToInputAndFocus: () => void
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * Every caption is a fully-resolved string built once from data Workspace already computed before
 * the tour starts — never a live template, so what the tour says stays consistent with what it
 * shows even while a step's own `run()` is changing app state. Missing prerequisite DATA (no
 * shared substrate, no curated recommended move for this repo) degrades gracefully by omitting the
 * step entirely, rather than fabricating a number to fill the caption; a step whose DOM target
 * never appears at runtime is a separate, later check (see resolveTarget.ts / TourOverlay).
 */
export function buildTourSteps(ctx: TourStepContext): TourStep[] {
  const steps: TourStep[] = []

  steps.push({
    id: 'vendors-detected',
    targetSelector: '[data-tour="stat-vendors"]',
    caption: `${plural(ctx.vendorCount, 'vendor')} detected from this repo's imports, env vars, manifests, and IaC — this example loaded instantly from a pinned snapshot, no GitHub call needed.`,
    dwellMs: 4500,
  })

  steps.push({
    id: 'headline',
    targetSelector: '[data-tour="headline-card"]',
    caption: `${ctx.vendorCount} vendors, but only ${plural(ctx.substrateCount, 'substrate')}. ${ctx.hiddenSharePercentValue.toFixed(0)}% of this repo's expected downtime is invisible to naive SLA math — that's shared-hosting risk, not any one vendor's own outage. ~${formatCurrency(ctx.expectedLossPerYear, ctx.currency)}/yr at current assumptions.`,
    dwellMs: 6000,
  })

  if (ctx.mostConcentratedSubstrate) {
    steps.push({
      id: 'substrate-islands',
      targetSelector: '[data-tour="vendor-graph"]',
      caption: `${plural(ctx.mostConcentratedVendorCount, 'vendor')} share one ${ctx.mostConcentratedSubstrate.toUpperCase()} region — one incident there takes all of them down at once, not just one.`,
      dwellMs: 5000,
    })
  }

  steps.push({
    id: 'run-scenario',
    targetSelector: '[data-tour="scenario-cascade"]',
    caption: `Running the ${ctx.scenarioLabel} scenario: ${ctx.scenarioAffectedEntrypoints}/${ctx.totalEntrypoints} entrypoints go down — computed live by the exact engine, not canned.`,
    dwellMs: 6000,
    run: ctx.actions.runScenario,
  })

  if (ctx.topMove) {
    steps.push({
      id: 'recommended-move',
      targetSelector: '[data-tour="whatif-results"]',
      caption: `${ctx.topMove.description}: saves ~${formatCurrency(ctx.topMove.annualSavings, ctx.currency)}/yr, modeled by the same exact engine — before/after, not a guess.`,
      dwellMs: 6000,
      run: ctx.actions.applyTopMove,
    })
  }

  steps.push({
    id: 'risk-register',
    targetSelector: '[data-tour="risk-register"]',
    caption: `Every claim here has receipts — each row shows exactly which import/env-var/manifest signal detected the vendor, and which files it affects. Nothing here is inferred without a source.`,
    dwellMs: 5000,
    run: ctx.actions.openRiskRegister,
  })

  steps.push({
    id: 'try-your-own',
    targetSelector: '#repo-url',
    caption: `Try your own repo — paste a GitHub URL above. Full technical writeup in README.md and DEPLOYMENT.md.`,
    dwellMs: 8000,
    run: ctx.actions.goToInputAndFocus,
  })

  return steps
}

/** Every entry must have a unique, non-empty id and a non-empty caption — used both defensively
 * and by src/tour/steps.test.ts. */
export function validateTourSteps(steps: TourStep[]): string[] {
  const errors: string[] = []
  const seenIds = new Set<string>()
  for (const step of steps) {
    if (!step.id || step.id.trim().length === 0) {
      errors.push('a step is missing an id')
      continue
    }
    if (seenIds.has(step.id)) errors.push(`duplicate step id "${step.id}"`)
    seenIds.add(step.id)
    if (!step.caption || step.caption.trim().length === 0) errors.push(`step "${step.id}" has an empty caption`)
  }
  return errors
}
