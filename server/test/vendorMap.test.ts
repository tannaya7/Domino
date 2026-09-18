import { describe, expect, it } from 'vitest'
import { ENV_ALIASES, VENDOR_MAP } from '../src/vendorMap'

describe('VENDOR_MAP', () => {
  it('gives every entry a non-empty vendor name, tier, substrate list, and a valid SLA fraction', () => {
    for (const [key, entry] of Object.entries(VENDOR_MAP)) {
      expect(entry.vendor, `${key} vendor`).toBeTruthy()
      expect(entry.tier, `${key} tier`).toBeTruthy()
      expect(entry.substrate.length, `${key} substrate`).toBeGreaterThan(0)
      expect(entry.sla, `${key} sla`).toBeGreaterThan(0)
      expect(entry.sla, `${key} sla`).toBeLessThanOrEqual(1)
    }
  })
})

describe('ENV_ALIASES', () => {
  it('points every alias at a key that exists in VENDOR_MAP', () => {
    for (const [envVar, key] of Object.entries(ENV_ALIASES)) {
      expect(VENDOR_MAP[key], `${envVar} -> ${key}`).toBeDefined()
    }
  })
})
