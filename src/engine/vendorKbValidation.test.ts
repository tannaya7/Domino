import { describe, expect, it } from 'vitest'
import type { VendorKbEntry } from '../lib/types'
import { validateVendorKbCrossReferences, validateVendorSchema } from './vendorKbValidation'

function validVendor(overrides: Partial<VendorKbEntry> = {}): VendorKbEntry {
  return {
    id: 'stripe',
    name: 'Stripe',
    category: 'payments',
    aliases: [],
    packages: { npm: 'stripe', pypi: null, go: null, gem: null, maven: null },
    envPrefixes: ['STRIPE_SECRET_KEY'],
    hosts: ['api.stripe.com'],
    statusFeed: { kind: 'statuspage', url: 'https://status.stripe.com/api/v2/status.json' },
    substrate: [{ value: 'aws', confidence: 'verified', evidence: [{ url: 'https://ip-ranges.amazonaws.com/ip-ranges.json', note: 'real finding', retrievedAt: '2026-09-19' }] }],
    sla: { value: 0.9999, sourceUrl: null, retrievedAt: null },
    alternatives: [],
    ...overrides,
  }
}

describe('validateVendorSchema — schema fixtures', () => {
  it('accepts a fully valid vendor', () => {
    expect(validateVendorSchema(validVendor(), 'stripe.json')).toEqual([])
  })

  it('accepts the minimal honest case: unknown confidence, no evidence, no status feed, no sla', () => {
    const v = validVendor({ statusFeed: null, sla: null, substrate: [{ value: 'aws', confidence: 'unknown', evidence: [] }] })
    expect(validateVendorSchema(v, 'stripe.json')).toEqual([])
  })

  it('rejects a non-object', () => {
    expect(validateVendorSchema('not an object', 'x.json').length).toBeGreaterThan(0)
    expect(validateVendorSchema(null, 'x.json').length).toBeGreaterThan(0)
    expect(validateVendorSchema([1, 2], 'x.json').length).toBeGreaterThan(0)
  })

  it('reports every missing required field', () => {
    const errors = validateVendorSchema({}, 'x.json')
    for (const field of ['id', 'name', 'category', 'aliases', 'packages', 'envPrefixes', 'hosts', 'statusFeed', 'substrate', 'sla', 'alternatives']) {
      expect(errors.some((e) => e.message.includes(field))).toBe(true)
    }
  })

  it('rejects an id that is not kebab-case', () => {
    const errors = validateVendorSchema(validVendor({ id: 'Stripe_Inc' }), 'stripe.json')
    expect(errors.some((e) => e.message.includes('kebab-case'))).toBe(true)
  })

  it('rejects an id that does not match its filename', () => {
    const errors = validateVendorSchema(validVendor({ id: 'stripe' }), 'razorpay.json')
    expect(errors.some((e) => e.message.includes('does not match filename'))).toBe(true)
  })

  it('rejects an unknown category', () => {
    const errors = validateVendorSchema(validVendor({ category: 'blockchain' as never }), 'stripe.json')
    expect(errors.some((e) => e.message.includes('category'))).toBe(true)
  })

  it('rejects a non-https statusFeed.url', () => {
    const errors = validateVendorSchema(validVendor({ statusFeed: { kind: 'statuspage', url: 'http://status.stripe.com' } }), 'stripe.json')
    expect(errors.some((e) => e.message.includes('statusFeed.url'))).toBe(true)
  })

  it('rejects a non-https evidence url', () => {
    const v = validVendor({ substrate: [{ value: 'aws', confidence: 'verified', evidence: [{ url: 'http://insecure.example.com', note: 'x', retrievedAt: '2026-01-01' }] }] })
    const errors = validateVendorSchema(v, 'stripe.json')
    expect(errors.some((e) => e.message.includes('evidence[0].url'))).toBe(true)
  })

  it('rejects a malformed retrievedAt date', () => {
    const v = validVendor({ substrate: [{ value: 'aws', confidence: 'verified', evidence: [{ url: 'https://x.example.com', note: 'x', retrievedAt: 'yesterday' }] }] })
    const errors = validateVendorSchema(v, 'stripe.json')
    expect(errors.some((e) => e.message.includes('retrievedAt'))).toBe(true)
  })

  it('rejects an sla.value outside (0, 1]', () => {
    expect(validateVendorSchema(validVendor({ sla: { value: 1.5, sourceUrl: null, retrievedAt: null } }), 'stripe.json').length).toBeGreaterThan(0)
    expect(validateVendorSchema(validVendor({ sla: { value: 0, sourceUrl: null, retrievedAt: null } }), 'stripe.json').length).toBeGreaterThan(0)
  })

  it('rejects a non-kebab-case alternatives entry', () => {
    const errors = validateVendorSchema(validVendor({ alternatives: ['Razorpay Inc'] }), 'stripe.json')
    expect(errors.some((e) => e.message.includes('alternatives'))).toBe(true)
  })
})

describe('validateVendorKbCrossReferences — duplicate-claim detection', () => {
  it('accepts two independent vendors with no overlap', () => {
    const stripe = validVendor()
    const razorpay = validVendor({ id: 'razorpay', name: 'Razorpay', packages: { npm: 'razorpay', pypi: null, go: null, gem: null, maven: null }, envPrefixes: ['RAZORPAY_KEY_ID'] })
    expect(validateVendorKbCrossReferences([stripe, razorpay])).toEqual([])
  })

  it('detects a duplicate id', () => {
    const a = validVendor()
    const b = validVendor({ name: 'Stripe Clone' })
    const errors = validateVendorKbCrossReferences([a, b])
    expect(errors.some((e) => e.message.includes('duplicate id'))).toBe(true)
  })

  it('detects two vendors claiming the same npm package', () => {
    const a = validVendor()
    const b = validVendor({ id: 'not-stripe', packages: { npm: 'stripe', pypi: null, go: null, gem: null, maven: null } })
    const errors = validateVendorKbCrossReferences([a, b])
    expect(errors.some((e) => e.message.includes('"stripe"') && e.message.includes('also claimed by'))).toBe(true)
  })

  it('detects a vendor\'s alias colliding with another vendor\'s package name', () => {
    const a = validVendor()
    const b = validVendor({ id: 'sentry-clone', packages: { npm: 'sentry-clone', pypi: null, go: null, gem: null, maven: null }, aliases: ['stripe'] })
    const errors = validateVendorKbCrossReferences([a, b])
    expect(errors.some((e) => e.message.includes('"stripe"'))).toBe(true)
  })

  it('detects two vendors claiming the same env prefix', () => {
    const a = validVendor()
    const b = validVendor({ id: 'not-stripe', packages: { npm: 'not-stripe', pypi: null, go: null, gem: null, maven: null }, envPrefixes: ['STRIPE_SECRET_KEY'] })
    const errors = validateVendorKbCrossReferences([a, b])
    expect(errors.some((e) => e.message.includes('env prefix') && e.message.includes('STRIPE_SECRET_KEY'))).toBe(true)
  })

  it('requires evidence when confidence is verified or reported', () => {
    const v = validVendor({ substrate: [{ value: 'aws', confidence: 'reported', evidence: [] }] })
    const errors = validateVendorKbCrossReferences([v])
    expect(errors.some((e) => e.message.includes('no evidence'))).toBe(true)
  })

  it('rejects evidence attached to an "unknown"-confidence substrate', () => {
    const v = validVendor({ substrate: [{ value: 'aws', confidence: 'unknown', evidence: [{ url: 'https://x.example.com', note: 'x', retrievedAt: '2026-01-01' }] }] })
    const errors = validateVendorKbCrossReferences([v])
    expect(errors.some((e) => e.message.includes("isn't actually unknown"))).toBe(true)
  })

  it('does not require evidence when confidence is unknown', () => {
    const v = validVendor({ substrate: [{ value: 'aws', confidence: 'unknown', evidence: [] }] })
    expect(validateVendorKbCrossReferences([v])).toEqual([])
  })

  it('requires every alternatives id to exist', () => {
    const v = validVendor({ alternatives: ['nonexistent-vendor'] })
    const errors = validateVendorKbCrossReferences([v])
    expect(errors.some((e) => e.message.includes('unknown vendor id "nonexistent-vendor"'))).toBe(true)
  })

  it('accepts an alternatives id that resolves to a real vendor in the same set', () => {
    const stripe = validVendor({ alternatives: ['razorpay'] })
    const razorpay = validVendor({ id: 'razorpay', name: 'Razorpay', packages: { npm: 'razorpay', pypi: null, go: null, gem: null, maven: null }, envPrefixes: ['RAZORPAY_KEY_ID'] })
    expect(validateVendorKbCrossReferences([stripe, razorpay])).toEqual([])
  })
})
