import { buildCorrelatedModel, pmfNumberDown, tailProbability, type CorrelatedModelOverrides } from '../engine/correlated'
import type { Currency } from './currency'
import { formatCurrency } from './currency'
import type { AvailabilityHeadline, ExactAvailabilityResult, NodeCriticality, Vendor, VendorWithBlastRadius } from './types'
import { CONFIDENCE_LABEL, VENDOR_CONFIDENCE_RULE } from './vendorConfidence'
import type { VendorRiskRow } from './vendorRiskRegister'

export interface WhyInput {
  label: string
  value: string
}

export interface WhyEvidenceItem {
  label: string
  detail: string
}

export interface WhyChange {
  description: string
  before: string
  after: string
}

export interface WhyContent {
  title: string
  /** The plain-English claim this metric is making. */
  claim: string
  /** Exact input values, with units, that produced it. */
  inputs: WhyInput[]
  /** The computation, in one line. */
  formula: string
  /** Files, detectedVia, or other provenance — line numbers where available (today: not tracked
   * anywhere upstream, so never fabricated here; this is a known, documented gap). */
  evidence: WhyEvidenceItem[]
  /** Computed by the exact engine — a real before/after, never a guess. */
  changes: WhyChange[]
  /** Shown instead of (or with) `changes` when there's nothing further to honestly compute — e.g. a
   * metric that already IS a "what if removed" counterfactual. */
  changesNote?: string
}

function formatSmallPercent(n: number): string {
  const pct = n * 100
  if (pct === 0) return '0%'
  if (pct < 0.001) return '<0.001%'
  return `${pct.toFixed(3)}%`
}

/**
 * "Move X to another substrate" — the exact-engine what-if the task's own example uses. Rebuilds
 * the model with this vendor's substrate blanked (a dedicated substrate of its own, sharing with no
 * one), recomputes P(>=3 down), and returns the real before/after. `null` when there's nothing to
 * show honestly: fewer than 3 vendors total (P(>=3) is trivially 0 either way), or this vendor
 * doesn't share a substrate with anyone to begin with (moving it changes nothing).
 */
export function whatIfMoveVendorOffSubstrate(
  vendors: Vendor[],
  vendorKey: string,
  overrides: CorrelatedModelOverrides = {},
): WhyChange | null {
  if (vendors.length < 3) return null
  const model = buildCorrelatedModel(vendors, overrides)
  const target = model.vendors.find((v) => v.key === vendorKey)
  if (!target || target.substrates.length === 0) return null
  const sharesWithSomeone = model.vendors.some((v) => v.key !== vendorKey && v.substrates.some((s) => target.substrates.includes(s)))
  if (!sharesWithSomeone) return null

  const K = 3
  const before = tailProbability(pmfNumberDown(model), K)
  const movedVendors = vendors.map((v) => (v.key === vendorKey ? { ...v, substrate: [] } : v))
  const afterModel = buildCorrelatedModel(movedVendors, overrides)
  const after = tailProbability(pmfNumberDown(afterModel), K)

  const vendorName = vendors.find((v) => v.key === vendorKey)?.vendor ?? vendorKey
  return {
    description: `Move ${vendorName} to its own dedicated substrate: P(≥3 vendors down at once)`,
    before: formatSmallPercent(before),
    after: formatSmallPercent(after),
  }
}

export function buildVendorsSubstratesWhy(
  vendors: Vendor[],
  headline: AvailabilityHeadline,
  overrides: CorrelatedModelOverrides = {},
): WhyContent {
  const claim = `${headline.vendors} vendor(s) detected, running across ${headline.substrates} distinct shared substrate(s).`
  const inputs: WhyInput[] = [
    { label: 'Vendors detected', value: String(headline.vendors) },
    { label: 'Distinct real substrates', value: String(headline.substrates) },
    { label: 'Vendors with unknown/self-hosted hosting', value: String(headline.unknownHostingVendorCount) },
  ]
  const evidence: WhyEvidenceItem[] = vendors.map((v) => ({
    label: v.vendor,
    detail: `${v.substrate.length > 0 ? v.substrate.join(', ') : 'self-hosted/unknown'} — detected via ${v.detectedVia.join(', ') || 'unknown'}`,
  }))
  const changes: WhyChange[] = []
  if (headline.worstSingleEvent) {
    const change = whatIfMoveVendorOffSubstrate(vendors, headline.worstSingleEvent.vendorKeys[0], overrides)
    if (change) changes.push(change)
  }
  return {
    title: 'Vendors → substrates',
    claim,
    inputs,
    formula: 'substrates = |{ real (shareable, non-self-hosted) substrate tags across all detected vendors }|',
    evidence,
    changes,
    changesNote: changes.length === 0 ? 'No vendor here shares a substrate with another — nothing to move.' : undefined,
  }
}

export function buildExpectedLossWhy(
  headline: AvailabilityHeadline,
  result: ExactAvailabilityResult,
  currency: Currency,
): WhyContent {
  const claim = `Expected annual financial exposure at your current assumptions: ${formatCurrency(headline.expectedLossPerYear, currency)}/yr.`
  const inputs: WhyInput[] = [
    { label: 'Cost per hour of downtime', value: `${formatCurrency(result.assumptions.costPerHourOfDowntime, currency)}/hr` },
    { label: 'Correlated downtime', value: `${result.expectedDowntimeHoursPerYear.correlated.toFixed(2)} hrs/yr` },
    { label: 'Correlated availability', value: `${(result.correlatedAvailability * 100).toFixed(4)}%` },
  ]
  return {
    title: 'Expected annual exposure',
    claim,
    inputs,
    formula: 'expectedLossPerYear = correlatedDowntimeHoursPerYear × costPerHourOfDowntime',
    evidence: [{ label: 'Source', detail: 'computeExactAvailability() — src/lib/availability.ts' }],
    changes: [],
    changesNote: 'This is a direct multiplication of your own cost-per-hour input — there is no substrate/vendor change to hypothesize about independently of the numbers above.',
  }
}

export function buildRiskRegisterRowWhy(
  row: VendorRiskRow,
  vendor: VendorWithBlastRadius,
  allVendors: Vendor[],
  currency: Currency,
  overrides: CorrelatedModelOverrides = {},
): WhyContent {
  const claim = `${row.vendor} is ${row.risk}-risk: ${row.filesAffected} file(s) and ${row.entrypointsAffected} entrypoint(s) in this repo depend on it.`
  const inputs: WhyInput[] = [
    { label: 'SLA', value: `${(vendor.sla * 100).toFixed(3)}%` },
    { label: 'Confidence', value: `${CONFIDENCE_LABEL[row.confidence]} (${VENDOR_CONFIDENCE_RULE})` },
    { label: 'Downtime-share allocation', value: `${(row.downtimeShare * 100).toFixed(1)}%` },
    { label: 'Cost allocated', value: row.costPerYear > 0 ? `${formatCurrency(row.costPerYear, currency)}/yr` : 'not estimated' },
  ]
  const evidence: WhyEvidenceItem[] = [
    { label: 'Detected via', detail: vendor.detectedVia.join(', ') || 'unknown' },
    ...vendor.affectedFiles.slice(0, 5).map((f) => ({ label: 'File affected', detail: f })),
  ]
  const change = whatIfMoveVendorOffSubstrate(allVendors, vendor.key, overrides)
  return {
    title: `Why: ${row.vendor}`,
    claim,
    inputs,
    formula: 'risk = getRiskLevel(filesAffected); costPerYear = downtimeShare × naiveDowntimeHoursPerYear × costPerHour; downtimeShare = (1-sla) / Σ(1-sla_i)',
    evidence,
    changes: change ? [change] : [],
    changesNote: change ? undefined : `${row.vendor} doesn't share a substrate with another detected vendor — nothing to move.`,
  }
}

export function buildCriticalityItemWhy(node: NodeCriticality): WhyContent {
  const claim = node.isArticulationPoint
    ? `${node.nodeId} is a structural bottleneck: removing it disconnects ${node.orphanedNodes.length} other file(s) from the graph${node.affectedEntrypoints.length > 0 ? ` and cuts off ${node.affectedEntrypoints.length} route(s)` : ''}.`
    : `${node.affectedEntrypoints.length} of ${node.entrypointCount} other entrypoint(s) depend on ${node.nodeId} — breaking it breaks them too.`
  const inputs: WhyInput[] = [
    { label: 'Articulation point (graph theory)', value: node.isArticulationPoint ? 'yes' : 'no' },
    { label: 'Entrypoints affected', value: `${node.affectedEntrypoints.length} of ${node.entrypointCount}` },
    { label: 'Reachability loss ratio', value: `${(node.reachabilityLossRatio * 100).toFixed(0)}%` },
  ]
  const evidence: WhyEvidenceItem[] = [
    ...node.affectedEntrypoints.slice(0, 5).map((e) => ({ label: 'Entrypoint affected', detail: e })),
    ...node.orphanedNodes.slice(0, 5).map((f) => ({ label: 'File orphaned if removed', detail: f })),
  ]
  return {
    title: `Why: ${node.nodeId}`,
    claim,
    inputs,
    formula: 'reachabilityLossRatio = affectedEntrypoints.length / entrypointCount (this node excluded from both, so an entrypoint never counts itself)',
    evidence,
    changes: [],
    changesNote:
      'This metric already IS a "what happens if removed" computation (Tarjan\'s articulation points + BFS reachability with this node excluded) — see the evidence above rather than a further hypothetical.',
  }
}
