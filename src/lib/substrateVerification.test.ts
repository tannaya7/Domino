import { describe, expect, it } from 'vitest'
import {
  formatVerificationBadge,
  indexVerificationByVendorKey,
  summarizeSubstrateVerification,
  type SubstrateVerificationData,
  type VendorVerificationResult,
} from './substrateVerification'

function result(overrides: Partial<VendorVerificationResult> = {}): VendorVerificationResult {
  return {
    vendorKey: 'stripe',
    vendor: 'Stripe',
    curatedSubstrate: ['aws'],
    verdict: 'agrees',
    checkedAt: '2026-09-19T12:00:00.000Z',
    hosts: [],
    ...overrides,
  }
}

describe('formatVerificationBadge', () => {
  it('unverified when no result exists for this vendor', () => {
    expect(formatVerificationBadge(undefined)).toMatchObject({ label: 'unverified' })
  })

  it('"DNS-verified <date>" for agrees', () => {
    expect(formatVerificationBadge(result({ verdict: 'agrees' }))).toMatchObject({ label: 'DNS-verified 2026-09-19' })
  })

  it('"DNS-verified <date> (edge)" for agrees-edge', () => {
    expect(formatVerificationBadge(result({ verdict: 'agrees-edge' }))).toMatchObject({ label: 'DNS-verified 2026-09-19 (edge)' })
  })

  it('"differs: curated X, DNS shows Y" for a hosting-layer conflict (no "edge" suffix)', () => {
    const r = result({
      verdict: 'conflict',
      curatedSubstrate: ['aws'],
      hosts: [{ host: 'api.stripe.com', cnameChain: [], addresses: [], observedProvider: 'gcp', layer: 'hosting', source: 'ip-range', detail: '' }],
    })
    expect(formatVerificationBadge(r)).toMatchObject({ label: 'differs: curated aws, DNS shows gcp' })
  })

  it('"differs: ... edge" (softer style) for an edge-only mismatch that is still verdict=inconclusive', () => {
    const r = result({
      verdict: 'inconclusive',
      curatedSubstrate: ['azure'],
      hosts: [{ host: 'api.openai.com', cnameChain: [], addresses: [], observedProvider: 'cloudflare', layer: 'edge', source: 'ip-range', detail: '' }],
    })
    const badge = formatVerificationBadge(r)
    expect(badge.label).toBe('differs: curated azure, DNS shows cloudflare edge')
    expect(badge.style).not.toContain('red') // amber/softer, not the confirmed-conflict red
  })

  it('plain "unverified" for inconclusive with no usable observation at all', () => {
    const r = result({
      verdict: 'inconclusive',
      hosts: [{ host: 'api.stripe.com', cnameChain: [], addresses: [], observedProvider: null, layer: null, source: null, detail: '', error: 'unresolved' }],
    })
    expect(formatVerificationBadge(r)).toMatchObject({ label: 'unverified' })
  })
})

describe('summarizeSubstrateVerification', () => {
  const data: SubstrateVerificationData = {
    generatedAt: '2026-09-19T12:00:00.000Z',
    asnLookupAvailable: true,
    results: [
      result({ vendorKey: 'stripe', verdict: 'agrees' }),
      result({ vendorKey: 'openai', verdict: 'conflict' }),
    ],
  }

  it('counts only detected vendors that were actually checked, not every curated vendor', () => {
    const summary = summarizeSubstrateVerification(data, ['stripe', 'openai', 'firebase'])
    expect(summary).toEqual({ checkedCount: 2, totalCount: 3, conflictCount: 1 })
  })

  it('returns null (not zeros) when there is no verification data at all', () => {
    expect(summarizeSubstrateVerification(null, ['stripe'])).toBeNull()
  })
})

describe('indexVerificationByVendorKey', () => {
  it('returns an empty map for null data', () => {
    expect(indexVerificationByVendorKey(null).size).toBe(0)
  })

  it('indexes results by vendorKey', () => {
    const data: SubstrateVerificationData = { generatedAt: '2026-01-01', asnLookupAvailable: true, results: [result({ vendorKey: 'stripe' })] }
    expect(indexVerificationByVendorKey(data).get('stripe')?.vendor).toBe('Stripe')
  })
})
