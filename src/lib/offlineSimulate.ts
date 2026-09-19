// Frontend-only: builds a SimulateResponse shape entirely from the pure, dependency-free functions
// in ./availability and ../engine/correlated — no network call. This is what lets the guided tour
// (src/tour/) run a full failure-scenario cascade against a bundled example snapshot with the API
// down: everything here is exact-engine math (see src/engine/correlated.ts), never sampled, and
// never fabricated — the same numbers a live /simulate call would return for the same inputs.

import { buildAvailabilityHeadline, computeExactAvailability, PRESET_SCENARIOS, simulateFailureScenario } from './availability'
import type { SimulateResponse } from './api'
import type { ExactAvailabilityAssumptions, FailureScenario, Vendor } from './types'

export function buildOfflineSimulateResponse(
  vendors: Vendor[],
  scenario: FailureScenario,
  assumptions: Pick<ExactAvailabilityAssumptions, 'costPerHourOfDowntime' | 'vendorSlaOverrides' | 'substrateOutageProbabilities'>,
): SimulateResponse {
  const scenarioResult = simulateFailureScenario(vendors, scenario)
  const simulation = computeExactAvailability(vendors, assumptions)
  const headline = buildAvailabilityHeadline(vendors, simulation)
  return {
    scenario: scenarioResult,
    simulation,
    presetScenarios: PRESET_SCENARIOS,
    headline,
    // Neither is computable offline (recommendedMoves needs the curated vendor map; whatIf is a
    // separate, explicit user action) — the tour supplies its own precomputed values for those.
    whatIf: null,
    recommendedMoves: [],
  }
}
