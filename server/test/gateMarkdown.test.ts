import { describe, expect, it } from 'vitest'
import { buildGateMarkdown, GATE_COMMENT_MARKER, type GateMarkdownInput } from '../src/gateMarkdown'

function baseInput(overrides: Partial<GateMarkdownInput> = {}): GateMarkdownInput {
  return {
    pr: { owner: 'acme', repo: 'widget', number: 42 },
    baselineNote: "the repository's default branch (main)",
    newVendors: [
      {
        key: 'stripe',
        vendor: 'Stripe',
        substrate: ['aws'],
        category: 'payments',
        detectedVia: ['import:stripe'],
        files: ['src/lib/payments.ts'],
      },
    ],
    entrypointsAffected: ['src/index.ts'],
    totalEntrypoints: 3,
    concentration: {
      before: { vendorCount: 2, substrateCount: 2, bySubstrate: [], mostConcentrated: { substrate: 'aws', vendorKeys: ['a'], vendorNames: ['A'], share: 0.5 } },
      after: { vendorCount: 3, substrateCount: 2, bySubstrate: [], mostConcentrated: { substrate: 'aws', vendorKeys: ['a', 'stripe'], vendorNames: ['A', 'Stripe'], share: 0.67 } },
    },
    exposure: { before: 1000, after: 1500, delta: 500, currency: 'USD' },
    meaningfulChange: true,
    policy: { status: 'pass', violations: [] },
    narrative: { text: 'This PR adds Stripe on AWS, increasing concentration risk.', generatedBy: 'deterministic' },
    truncated: false,
    ...overrides,
  }
}

describe('buildGateMarkdown', () => {
  it('starts with the hidden sticky-comment marker', () => {
    const markdown = buildGateMarkdown(baseInput())
    expect(markdown.startsWith(GATE_COMMENT_MARKER)).toBe(true)
  })

  it('is a pure function — identical input produces byte-identical output', () => {
    const input = baseInput()
    expect(buildGateMarkdown(input)).toBe(buildGateMarkdown(baseInput()))
  })

  it('matches the known-good snapshot for a passing PR', () => {
    expect(buildGateMarkdown(baseInput())).toMatchSnapshot()
  })

  it('matches the known-good snapshot for a failing PR with violations', () => {
    const input = baseInput({
      policy: {
        status: 'fail',
        violations: [
          { rule: 'maxNewVendorsPerPr', actual: 1, limit: 0, message: 'This PR introduces 1 new vendor(s), above the limit of 0 per PR.' },
        ],
      },
    })
    expect(buildGateMarkdown(input)).toMatchSnapshot()
  })

  it('matches the known-good snapshot for a report-only PR with no policy', () => {
    expect(buildGateMarkdown(baseInput({ policy: { status: 'info', violations: [] } }))).toMatchSnapshot()
  })

  it('renders "no meaningful change" instead of a precise-looking exposure delta when the change is not meaningful', () => {
    const markdown = buildGateMarkdown(baseInput({ meaningfulChange: false }))
    expect(markdown).toContain('no meaningful change')
  })

  it('renders "None detected." when there are no new vendors', () => {
    const markdown = buildGateMarkdown(baseInput({ newVendors: [] }))
    expect(markdown).toContain('### New vendors (0)')
    expect(markdown).toContain('None detected.')
  })

  it('caps the rendered entrypoint list at 5 and notes the overflow', () => {
    const entrypoints = Array.from({ length: 8 }, (_, i) => `src/entry-${i}.ts`)
    const markdown = buildGateMarkdown(baseInput({ entrypointsAffected: entrypoints, totalEntrypoints: 10 }))
    expect(markdown).toContain('+3 more')
    expect(markdown).not.toContain('src/entry-7.ts')
  })

  it('labels a Bedrock-generated narrative as AI-generated, and a deterministic one as a fallback', () => {
    const aiMarkdown = buildGateMarkdown(baseInput({ narrative: { text: 'x', generatedBy: 'bedrock' } }))
    expect(aiMarkdown).toContain('AI-generated')

    const deterministicMarkdown = buildGateMarkdown(baseInput({ narrative: { text: 'x', generatedBy: 'deterministic' } }))
    expect(deterministicMarkdown).toContain('Deterministic fallback')
  })

  it('notes truncation when the PR could not be fully scanned', () => {
    const markdown = buildGateMarkdown(baseInput({ truncated: true }))
    expect(markdown.toLowerCase()).toContain('subset')
  })

  it('always ends with the "modeled estimate" footer, never implying a guarantee', () => {
    const markdown = buildGateMarkdown(baseInput())
    expect(markdown).toContain('Modeled estimate under editable assumptions')
  })
})
