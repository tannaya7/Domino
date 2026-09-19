import type { CorrelatedModelOverrides } from './correlated'
import { buildCorrelatedModel, scenarioCombinationProbability, UNSHAREABLE_SUBSTRATE_TAGS } from './correlated'
import type { VendorWithBlastRadius } from '../lib/types'

// Pure, browser-safe — no I/O, no randomness, no graph traversal. Both the client (which already
// has vendorGraph.vendors + criticality.entrypoints loaded) and the API route (which builds the
// same shape via buildVendorGraph(cached.vendors, adjacency)) call evaluateScenario() unchanged.

const HOURS_PER_YEAR = 8760
export const MAX_SCENARIO_SELECTIONS = 12
export const MIN_SCENARIO_HOURS = 0.25
export const MAX_SCENARIO_HOURS = 720
export const DEFAULT_SCENARIO_HOURS = 4

export interface ScenarioAnalysisInput {
  /** Every detected vendor, already rolled up with its blast radius — see buildVendorGraph. */
  vendors: VendorWithBlastRadius[]
  /** Every entrypoint file id in this repo's graph. */
  entrypoints: string[]
  costPerHour: number
  overrides?: CorrelatedModelOverrides
}

export interface ScenarioSelection {
  /** Real, shareable substrate ids to hold down (self/other/unknown are never selectable). */
  substrates: string[]
  /** Vendor keys to hold down directly, independent of (and in addition to) `substrates`. */
  vendors: string[]
  /** Assumed duration of a single incident, in hours — used only for the per-incident cost figure. */
  hours: number
}

export interface ScenarioFieldError {
  field: 'substrates' | 'vendors' | 'hours' | 'selection'
  message: string
}

/** Thrown by evaluateScenario on invalid input — callers (the API route, the UI) turn this into a
 * 400 / inline form errors rather than letting bad input reach the probability math. */
export class ScenarioValidationException extends Error {
  errors: ScenarioFieldError[]
  constructor(errors: ScenarioFieldError[]) {
    super(errors.map((e) => e.message).join(' '))
    this.name = 'ScenarioValidationException'
    this.errors = errors
  }
}

export interface ScenarioNoFallback {
  entrypoint: string
  tier: string
}

export interface ScenarioResult {
  downVendorKeys: string[]
  filesAffected: string[]
  entrypointsAffected: string[]
  entrypointsTotal: number
  categoriesLost: string[]
  /** Entrypoints where EVERY detected vendor of some category they depend on is down — there's
   * nothing else detected in this repo the app could have failed over to. */
  noFallback: ScenarioNoFallback[]
  /** P(every selected substrate down AND every selected vendor down), via the exact engine. */
  combinationProbability: number
  /** 8760 * combinationProbability — expected hours/yr this exact combination is down. */
  expectedDowntimeHoursPerYear: number
  /** costPerHour * hours — cost of one incident at the assumed duration. */
  perIncidentCost: number
  /** costPerHour * expectedDowntimeHoursPerYear — annualized, same pattern as the headline card. */
  expectedAnnualCost: number
  /** Always true — every probability/cost figure here is modeled under the current assumptions
   * (SLA/substrate overrides), never a measurement. The UI must label this, never imply certainty. */
  illustrative: true
}

export interface ScenarioKnownIds {
  substrateIds: string[]
  vendorIds: string[]
}

/** Real (shareable) substrate ids and vendor keys this analysis actually has — the only ids a
 * scenario selection may reference. Built the same way for the client and the API route. */
export function scenarioKnownIds(vendors: VendorWithBlastRadius[]): ScenarioKnownIds {
  const substrateIds = new Set<string>()
  for (const v of vendors) {
    for (const s of v.substrate) {
      if (!UNSHAREABLE_SUBSTRATE_TAGS.has(s.toLowerCase())) substrateIds.add(s)
    }
  }
  return { substrateIds: [...substrateIds].sort(), vendorIds: vendors.map((v) => v.key) }
}

export function validateScenarioSelection(selection: ScenarioSelection, known: ScenarioKnownIds): ScenarioFieldError[] {
  const errors: ScenarioFieldError[] = []
  const substrateSet = new Set(known.substrateIds)
  const vendorSet = new Set(known.vendorIds)

  const unknownSubstrates = selection.substrates.filter((s) => !substrateSet.has(s))
  if (unknownSubstrates.length > 0) {
    errors.push({ field: 'substrates', message: `Unknown substrate id(s): ${unknownSubstrates.join(', ')}.` })
  }
  const unknownVendors = selection.vendors.filter((v) => !vendorSet.has(v))
  if (unknownVendors.length > 0) {
    errors.push({ field: 'vendors', message: `Unknown vendor id(s): ${unknownVendors.join(', ')}.` })
  }

  const totalSelections = selection.substrates.length + selection.vendors.length
  if (totalSelections === 0) {
    errors.push({ field: 'selection', message: 'Select at least one substrate or vendor.' })
  } else if (totalSelections > MAX_SCENARIO_SELECTIONS) {
    errors.push({ field: 'selection', message: `At most ${MAX_SCENARIO_SELECTIONS} selections total (got ${totalSelections}).` })
  }

  if (!Number.isFinite(selection.hours) || selection.hours < MIN_SCENARIO_HOURS || selection.hours > MAX_SCENARIO_HOURS) {
    errors.push({
      field: 'hours',
      message: `Hours must be between ${MIN_SCENARIO_HOURS} and ${MAX_SCENARIO_HOURS} (got ${selection.hours}).`,
    })
  }

  return errors
}

/**
 * Evaluates a compound failure scenario: some substrates and/or vendors held down at once.
 * Throws ScenarioValidationException on invalid input (unknown ids, too many selections, hours out
 * of range) — never silently clamps or drops bad input.
 */
export function evaluateScenario(analysis: ScenarioAnalysisInput, selection: ScenarioSelection): ScenarioResult {
  const known = scenarioKnownIds(analysis.vendors)
  const errors = validateScenarioSelection(selection, known)
  if (errors.length > 0) throw new ScenarioValidationException(errors)

  const substrateSet = new Set(selection.substrates)
  const selectedVendorSet = new Set(selection.vendors)

  // Impact is deterministic, not probabilistic: a vendor is down if it was picked directly, OR if
  // it sits on any selected substrate (the substrate going down takes every vendor on it with it).
  const downVendors = analysis.vendors.filter(
    (v) => selectedVendorSet.has(v.key) || v.substrate.some((s) => substrateSet.has(s)),
  )
  const downVendorKeys = downVendors.map((v) => v.key)

  const filesAffected = new Set<string>()
  for (const v of downVendors) for (const f of v.affectedFiles) filesAffected.add(f)

  const entrypointSet = new Set(analysis.entrypoints)
  const entrypointsAffected = [...filesAffected].filter((f) => entrypointSet.has(f))

  const categoriesLost = [...new Set(downVendors.map((v) => v.tier))].sort()

  // "No detected fallback": for each entrypoint, for each category it depends on, every detected
  // vendor of that category reaching this entrypoint is down — nothing else detected could have
  // absorbed the loss. Computed from ALL vendors (not just down ones) so a category with a vendor
  // that's still up is correctly NOT flagged.
  const noFallback: ScenarioNoFallback[] = []
  for (const entrypoint of entrypointsAffected) {
    const vendorsReachingEntrypoint = analysis.vendors.filter((v) => v.affectedFiles.includes(entrypoint))
    const tiersHere = new Set(vendorsReachingEntrypoint.map((v) => v.tier))
    for (const tier of tiersHere) {
      const ofTier = vendorsReachingEntrypoint.filter((v) => v.tier === tier)
      const ofTierDown = ofTier.filter((v) => downVendorKeys.includes(v.key))
      if (ofTier.length > 0 && ofTierDown.length === ofTier.length) noFallback.push({ entrypoint, tier })
    }
  }
  noFallback.sort((a, b) => a.entrypoint.localeCompare(b.entrypoint) || a.tier.localeCompare(b.tier))

  // Modeled frequency: the exact engine's joint probability, never a marginal-multiplication shortcut.
  const model = buildCorrelatedModel(analysis.vendors, analysis.overrides)
  const combinationProbability = scenarioCombinationProbability(model, substrateSet, selectedVendorSet)
  const expectedDowntimeHoursPerYear = HOURS_PER_YEAR * combinationProbability

  const perIncidentCost = analysis.costPerHour * selection.hours
  const expectedAnnualCost = analysis.costPerHour * expectedDowntimeHoursPerYear

  return {
    downVendorKeys,
    filesAffected: [...filesAffected].sort(),
    entrypointsAffected: entrypointsAffected.sort(),
    entrypointsTotal: analysis.entrypoints.length,
    categoriesLost,
    noFallback,
    combinationProbability,
    expectedDowntimeHoursPerYear,
    perIncidentCost,
    expectedAnnualCost,
    illustrative: true,
  }
}
