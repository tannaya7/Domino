import { describe, expect, it } from 'vitest'
import { computeVendorConfidence } from './vendorConfidence'

describe('computeVendorConfidence', () => {
  it('is high when manifest AND import are both present', () => {
    expect(computeVendorConfidence(['manifest:npm:stripe', 'import:stripe'])).toBe('high')
  })

  it('is high when manifest AND env are both present', () => {
    expect(computeVendorConfidence(['manifest:npm:stripe', 'env:STRIPE_SECRET_KEY'])).toBe('high')
  })

  it('is high when manifest, import, and env are all present', () => {
    expect(computeVendorConfidence(['manifest:npm:stripe', 'import:stripe', 'env:STRIPE_SECRET_KEY'])).toBe('high')
  })

  it('is medium for import only', () => {
    expect(computeVendorConfidence(['import:stripe'])).toBe('medium')
  })

  it('is medium for manifest only', () => {
    expect(computeVendorConfidence(['manifest:npm:stripe'])).toBe('medium')
  })

  it('is medium for manifest + hostname (manifest still qualifies, hostname does not downgrade it)', () => {
    expect(computeVendorConfidence(['manifest:npm:stripe', 'hostname:api.stripe.com'])).toBe('medium')
  })

  it('is low for env-var only', () => {
    expect(computeVendorConfidence(['env:STRIPE_SECRET_KEY'])).toBe('low')
  })

  it('is low for hostname only', () => {
    expect(computeVendorConfidence(['hostname:api.stripe.com'])).toBe('low')
  })

  it('is low for env + hostname (neither is import or manifest)', () => {
    expect(computeVendorConfidence(['env:STRIPE_SECRET_KEY', 'hostname:api.stripe.com'])).toBe('low')
  })

  it('falls back to low for an empty (or unrecognized-prefix) detectedVia list', () => {
    expect(computeVendorConfidence([])).toBe('low')
  })
})
