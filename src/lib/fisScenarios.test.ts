import { describe, expect, it } from 'vitest'
import verifiedFileJson from '../../data/fis-actions.verified.json'
import type { VerifiedFisActionsFile } from '../engine/fisTemplate'
import { FIS_SCENARIOS, fisScenarioForVendorTier, getFisScenario } from './fisScenarios'

const verifiedFile = verifiedFileJson as unknown as VerifiedFisActionsFile

describe('FIS_SCENARIOS — the scenario table', () => {
  it('has exactly the 3 scenarios the task specifies', () => {
    expect(FIS_SCENARIOS.map((s) => s.id).sort()).toEqual(['az-disruption', 'single-az-db', 'single-instance'].sort())
  })

  it('every hypothesis is phrased as a question to test, never a predicted result', () => {
    for (const scenario of FIS_SCENARIOS) {
      expect(scenario.hypothesis.trim().endsWith('?')).toBe(true)
      // Never asserts an outcome up front ("the app survives...", "this will...").
      expect(scenario.hypothesis.toLowerCase()).not.toMatch(/^(the app (survives|stays up|will)|this will)/)
    }
  })

  it('every scenario has a non-empty "what to observe"', () => {
    for (const scenario of FIS_SCENARIOS) expect(scenario.whatToObserve.length).toBeGreaterThan(10)
  })

  it('every scenario\'s actionId is a real candidate in the verified actions file', () => {
    const knownIds = new Set(verifiedFile.actions.map((a) => a.id))
    for (const scenario of FIS_SCENARIOS) expect(knownIds.has(scenario.actionId)).toBe(true)
  })

  it('matches the task\'s literal scenario -> action mapping', () => {
    expect(getFisScenario('az-disruption').actionId).toBe('aws:network:disrupt-connectivity')
    expect(getFisScenario('single-az-db').actionId).toBe('aws:rds:reboot-db-instances')
    expect(getFisScenario('single-instance').actionId).toBe('aws:ec2:stop-instances')
  })
})

describe('getFisScenario', () => {
  it('throws on an unknown id rather than returning undefined silently', () => {
    // @ts-expect-error deliberately invalid for the test
    expect(() => getFisScenario('not-a-real-scenario')).toThrow()
  })
})

describe('fisScenarioForVendorTier', () => {
  it('picks single-az-db for data-tier vendors', () => {
    expect(fisScenarioForVendorTier('data').id).toBe('single-az-db')
  })

  it('picks single-instance for every other tier', () => {
    expect(fisScenarioForVendorTier('payments').id).toBe('single-instance')
    expect(fisScenarioForVendorTier('observability').id).toBe('single-instance')
  })
})
