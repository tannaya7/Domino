import { describe, expect, it } from 'vitest'
import { buildLegacyShapes, loadVendorKbEntries } from '../../scripts/generate-vendor-map'
import { LEGACY_ENV_ALIASES, LEGACY_VENDOR_MAP } from './fixtures/legacy-vendor-map.snapshot'

describe('generate-vendor-map — the generated map equals the old map', () => {
  it('VENDOR_MAP matches the legacy snapshot exactly, except one documented dead reference', async () => {
    const vendors = await loadVendorKbEntries()
    const { vendorMap } = buildLegacyShapes(vendors)

    // 'Adyen' was never a VENDOR_MAP entry, before or after this migration — no vendors/adyen.json
    // exists, and findRedundancyGroupCandidates() only matches a fallback NAME against vendors that
    // were actually DETECTED (i.e. present in VENDOR_MAP), so this reference was already 100% inert.
    // Dropped during migration rather than fabricating an adyen.json purely to preserve a name that
    // never had any real effect. This is the one intentional exception to "behavior must not change".
    const adjustedLegacy = structuredClone(LEGACY_VENDOR_MAP)
    adjustedLegacy.stripe.fallbacks = ['Razorpay']

    expect(vendorMap).toEqual(adjustedLegacy)
  })

  it('ENV_ALIASES matches the legacy snapshot exactly', async () => {
    const vendors = await loadVendorKbEntries()
    const { envAliases } = buildLegacyShapes(vendors)
    expect(envAliases).toEqual(LEGACY_ENV_ALIASES)
  })

  it('has exactly the same VENDOR_MAP key count as before (33)', async () => {
    const vendors = await loadVendorKbEntries()
    const { vendorMap } = buildLegacyShapes(vendors)
    expect(Object.keys(vendorMap)).toHaveLength(Object.keys(LEGACY_VENDOR_MAP).length)
  })
})

describe('generate-vendor-map — determinism', () => {
  it('building the legacy shapes twice from the same input produces byte-identical output', async () => {
    const vendors = await loadVendorKbEntries()
    const first = buildLegacyShapes(vendors)
    const second = buildLegacyShapes(vendors)
    expect(JSON.stringify(first.vendorMap)).toBe(JSON.stringify(second.vendorMap))
    expect(JSON.stringify(first.envAliases)).toBe(JSON.stringify(second.envAliases))
  })

  it('loading vendors/*.json twice produces the same vendor list in the same order', async () => {
    const a = await loadVendorKbEntries()
    const b = await loadVendorKbEntries()
    expect(a.map((v) => v.id)).toEqual(b.map((v) => v.id))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('vendors are sorted by id (deterministic regardless of filesystem readdir order)', async () => {
    const vendors = await loadVendorKbEntries()
    const ids = vendors.map((v) => v.id)
    expect(ids).toEqual([...ids].sort())
  })
})

describe('generate-vendor-map — data integrity', () => {
  it('every vendor file\'s id matches its filename (enforced by loadVendorKbEntries)', async () => {
    const vendors = await loadVendorKbEntries()
    expect(vendors.length).toBeGreaterThan(0)
    for (const v of vendors) expect(typeof v.id).toBe('string')
  })

  it('consolidated vendors (multiple legacy detection keys) produce one VendorEntry shared by every key', async () => {
    const vendors = await loadVendorKbEntries()
    const { vendorMap } = buildLegacyShapes(vendors)
    // Clerk was split across @clerk/nextjs and @clerk/clerk-react in the legacy map — both keys
    // must still resolve to the identical VendorEntry after consolidation into one vendors/clerk.json.
    expect(vendorMap['@clerk/nextjs']).toEqual(vendorMap['@clerk/clerk-react'])
    expect(vendorMap.firebase).toEqual(vendorMap['firebase-admin'])
    expect(vendorMap['@sentry/react']).toEqual(vendorMap['@sentry/node'])
  })
})
