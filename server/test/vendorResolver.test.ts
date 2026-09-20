import { describe, expect, it } from 'vitest'
import { matchVendorByEnvPrefix, matchVendorByHostname, resolveVendors } from '../src/vendorResolver'

describe('resolveVendors', () => {
  it('resolves a bare import specifier to its vendor', () => {
    const result = resolveVendors({ importSpecifiers: ['stripe'] })
    expect(result).toEqual([
      expect.objectContaining({ key: 'stripe', vendor: 'Stripe', detectedVia: ['import:stripe'] }),
    ])
  })

  it('resolves a subpath import to its base package vendor', () => {
    const result = resolveVendors({ importSpecifiers: ['stripe/webhooks'] })
    expect(result).toEqual([expect.objectContaining({ key: 'stripe', detectedVia: ['import:stripe/webhooks'] })])
  })

  it('resolves an env var to its vendor via ENV_ALIASES', () => {
    const result = resolveVendors({ envVarNames: ['STRIPE_SECRET_KEY'] })
    expect(result).toEqual([expect.objectContaining({ key: 'stripe', detectedVia: ['env:STRIPE_SECRET_KEY'] })])
  })

  it('resolves a manifest dependency to its vendor', () => {
    const result = resolveVendors({ manifestDeps: [{ name: 'stripe', ecosystem: 'pip' }] })
    expect(result).toEqual([expect.objectContaining({ key: 'stripe', detectedVia: ['manifest:pip:stripe'] })])
  })

  it('merges multiple signals for the same vendor with combined provenance', () => {
    const result = resolveVendors({
      importSpecifiers: ['stripe'],
      envVarNames: ['STRIPE_SECRET_KEY'],
      manifestDeps: [{ name: 'stripe', ecosystem: 'npm' }],
    })
    expect(result).toHaveLength(1)
    expect(result[0].detectedVia.sort()).toEqual(
      ['import:stripe', 'env:STRIPE_SECRET_KEY', 'manifest:npm:stripe'].sort(),
    )
  })

  it('ignores unknown specifiers, env vars, and manifest deps without throwing', () => {
    const result = resolveVendors({
      importSpecifiers: ['react', './local-file'],
      envVarNames: ['SOME_UNRELATED_VAR'],
      manifestDeps: [{ name: 'left-pad', ecosystem: 'npm' }],
    })
    expect(result).toEqual([])
  })

  it('returns vendors sorted by vendor name', () => {
    const result = resolveVendors({ importSpecifiers: ['twilio', 'stripe', 'openai'] })
    expect(result.map((v) => v.vendor)).toEqual(['OpenAI', 'Stripe', 'Twilio'])
  })

  it('does not duplicate the same detectedVia entry when called with repeated signals', () => {
    const result = resolveVendors({ importSpecifiers: ['stripe', 'stripe'] })
    expect(result[0].detectedVia).toEqual(['import:stripe'])
  })

  it('attributes fileSignals detections to their originating file for drill-down', () => {
    const result = resolveVendors({
      fileSignals: [
        { file: 'src/api/pay.ts', importSpecifiers: ['stripe'] },
        { file: 'src/api/webhook.ts', envVarNames: ['STRIPE_SECRET_KEY'] },
      ],
    })
    expect(result).toEqual([
      expect.objectContaining({
        key: 'stripe',
        detectedInFiles: ['src/api/pay.ts', 'src/api/webhook.ts'],
      }),
    ])
  })

  it('merges global and per-file signals for the same vendor', () => {
    const result = resolveVendors({
      manifestDeps: [{ name: 'stripe', ecosystem: 'npm' }],
      fileSignals: [{ file: 'src/api/pay.ts', importSpecifiers: ['stripe'] }],
    })
    expect(result).toHaveLength(1)
    expect(result[0].detectedInFiles).toEqual(['src/api/pay.ts'])
    expect(result[0].detectedVia.sort()).toEqual(['import:stripe', 'manifest:npm:stripe'].sort())
  })

  it('gives a global-only detection an empty detectedInFiles list', () => {
    const result = resolveVendors({ importSpecifiers: ['stripe'] })
    expect(result[0].detectedInFiles).toEqual([])
  })

  it('resolves a vendor via its statusUrl hostname found in a file signal', () => {
    const result = resolveVendors({ fileSignals: [{ file: 'src/x.ts', hostnames: ['status.stripe.com'] }] })
    expect(result).toEqual([
      expect.objectContaining({ key: 'stripe', detectedVia: ['hostname:status.stripe.com'], detectedInFiles: ['src/x.ts'] }),
    ])
  })

  it('does not resolve an unrelated hostname', () => {
    expect(resolveVendors({ fileSignals: [{ file: 'x.ts', hostnames: ['example.com'] }] })).toEqual([])
  })
})

describe('matchVendorByHostname', () => {
  it('matches a known vendor by its statusUrl hostname', () => {
    expect(matchVendorByHostname('status.stripe.com')).toBe('stripe')
  })

  it('is case-insensitive', () => {
    expect(matchVendorByHostname('STATUS.STRIPE.COM')).toBe('stripe')
  })

  it('returns null for an unknown hostname', () => {
    expect(matchVendorByHostname('example.com')).toBeNull()
  })

  it('also matches the KB\'s own hosts[] entries, not just statusUrl (google-ai.json has no statusUrl at all)', () => {
    expect(matchVendorByHostname('generativelanguage.googleapis.com')).toBe('@google/generative-ai')
  })

  it('is case-insensitive for KB hosts[] too', () => {
    expect(matchVendorByHostname('GENERATIVELANGUAGE.GOOGLEAPIS.COM')).toBe('@google/generative-ai')
  })
})

describe('matchVendorByEnvPrefix', () => {
  it('matches a real prefix, not just an exact name', () => {
    expect(matchVendorByEnvPrefix('GOOGLE_GENERATIVE_AI_API_KEY_STAGING')).toBe('@google/generative-ai')
  })

  it('returns null for an unknown env var', () => {
    expect(matchVendorByEnvPrefix('ACME_WIDGET_API_KEY')).toBeNull()
  })
})
