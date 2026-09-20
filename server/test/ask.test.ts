import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vendor } from '../../src/lib/types'
import type { AnalyzeRepoResult } from '../src/repoParser'

const sendMock = vi.fn()

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(function BedrockRuntimeClient() {
    return { send: sendMock }
  }),
  ConverseCommand: vi.fn().mockImplementation(function ConverseCommand(input: unknown) {
    return { input }
  }),
}))

const fixtureVendor: Vendor = {
  key: 'stripe',
  vendor: 'Stripe',
  tier: 'payments',
  substrate: ['aws'],
  sla: 0.9999,
  fallbacks: ['Razorpay'],
  detectedVia: ['import:stripe'],
  detectedInFiles: ['src/pay.ts'],
}

const fixtureCached: AnalyzeRepoResult = {
  graph: {
    nodes: [
      { id: 'src/pay.ts', label: 'src/pay.ts', type: 'file' },
      { id: 'src/index.ts', label: 'src/index.ts', type: 'file' },
    ],
    edges: [{ from: 'src/index.ts', to: 'src/pay.ts' }],
  },
  truncated: false,
  filesScanned: 2,
  filesSelected: 2,
  vendors: [fixtureVendor],
  iacSubstrates: [],
  entrypoints: ['src/index.ts'],
  importResolution: { total: 0, resolved: 0 },
  skippedOversizedFiles: 0,
  unclassified: { packages: [], envVars: [], hosts: [], totalCount: 0 },
  own: { regions: [], findings: [], unresolved: [], filesScanned: 0 },
  owner: 'octocat',
  repo: 'hello',
  branch: 'main',
}

const assumptions = { costPerHourOfDowntime: 1000, vendorSlaOverrides: {}, substrateOutageProbabilities: {} }

function textTurn(text: string) {
  return { output: { message: { role: 'assistant', content: [{ text }] } }, stopReason: 'end_turn' }
}

function toolUseTurn(toolUseId: string, name: string, input: Record<string, unknown>) {
  return { output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId, name, input } }] } }, stopReason: 'tool_use' }
}

async function importFreshAsk() {
  vi.resetModules()
  return import('../src/ask')
}

describe('askQuestion — Bedrock tool-use loop', () => {
  beforeEach(() => {
    sendMock.mockReset()
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-test'
  })

  afterEach(() => {
    delete process.env.BEDROCK_MODEL_ID
  })

  it('executes a requested tool_use call against the real engine, feeds the result back, and returns the final text answer', async () => {
    sendMock
      .mockResolvedValueOnce(toolUseTurn('t1', 'simulate_outage', { substrate: 'aws' }))
      .mockResolvedValueOnce(textTurn('If AWS goes down, Stripe is affected, taking down 0/1 entrypoints.'))

    const { askQuestion } = await importFreshAsk()
    const result = await askQuestion({ cached: fixtureCached, question: 'What breaks if AWS goes down?', assumptions })

    expect(result.generatedBy).toBe('bedrock')
    expect(result.answer).toContain('AWS')
    expect(result.toolsUsed).toEqual([expect.objectContaining({ name: 'simulate_outage', input: { substrate: 'aws' } })])
    // The number in the answer came from the REAL engine call, not the model — verify it's grounded.
    expect(result.numbers.totalVendorCount).toBe(1)
    expect(sendMock).toHaveBeenCalledTimes(2)

    // Second Converse call must include the tool's actual JSON result, not a placeholder.
    const secondCallMessages = sendMock.mock.calls[1][0].input.messages
    const toolResultMessage = secondCallMessages.find((m: { role: string }) => m.role === 'user' && secondCallMessages.indexOf(m) > 0)
    const toolResultJson = toolResultMessage.content[0].toolResult.content[0].json
    expect(toolResultJson.affectedVendors).toEqual(['Stripe'])
  })

  it('never exceeds the max-tool-calls budget and still returns an answer', async () => {
    // The model keeps asking for tools past the budget — every response after the 4th real call
    // must be treated as budget-exhausted, and the loop must still terminate.
    for (let i = 0; i < 6; i++) {
      sendMock.mockResolvedValueOnce(toolUseTurn(`t${i}`, 'get_concentration', {}))
    }
    sendMock.mockResolvedValueOnce(textTurn('Concentration summary.'))

    const { askQuestion } = await importFreshAsk()
    const result = await askQuestion({ cached: fixtureCached, question: 'Tell me about concentration.', assumptions })

    expect(result.toolsUsed.length).toBeLessThanOrEqual(4)
  })

  it('caps the answer at 120 words even if the model ignores the instruction', async () => {
    sendMock
      .mockResolvedValueOnce(toolUseTurn('t1', 'get_vendors', {}))
      .mockResolvedValueOnce(textTurn(Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ')))

    const { askQuestion } = await importFreshAsk()
    const result = await askQuestion({ cached: fixtureCached, question: 'List vendors.', assumptions })

    expect(result.answer.trim().split(/\s+/).length).toBeLessThanOrEqual(121) // 120 + the "…" marker token
  })

  it('falls back to a canned answer when Bedrock never produces a final answer', async () => {
    sendMock.mockResolvedValue(toolUseTurn('t1', 'simulate_outage', { substrate: 'aws' })) // always asks for more tools, never concludes
    const { askQuestion } = await importFreshAsk()
    const result = await askQuestion({ cached: fixtureCached, question: 'What breaks if AWS goes down?', assumptions })

    expect(result.generatedBy).toBe('deterministic')
    expect(result.answer.toLowerCase()).toContain('stripe')
  })

  it('rejects an unknown tool name from the model without crashing', async () => {
    sendMock
      .mockResolvedValueOnce(toolUseTurn('t1', 'delete_everything', {}))
      .mockResolvedValueOnce(textTurn('I could not find that information.'))

    const { askQuestion } = await importFreshAsk()
    const result = await askQuestion({ cached: fixtureCached, question: 'anything?', assumptions })
    expect(result.generatedBy).toBe('bedrock')
  })
})

describe('askQuestion — without Bedrock configured', () => {
  beforeEach(() => {
    delete process.env.BEDROCK_MODEL_ID
  })

  it('answers a suggested question deterministically, with zero Bedrock calls', async () => {
    sendMock.mockReset()
    const { askQuestion } = await importFreshAsk()
    const result = await askQuestion({ cached: fixtureCached, question: 'What breaks if AWS goes down?', assumptions })

    expect(result.generatedBy).toBe('deterministic')
    expect(sendMock).not.toHaveBeenCalled()
    expect(result.answer).toContain('Stripe')
  })

  it('is honest that free-text needs Bedrock when the question is not one of the suggested ones', async () => {
    const { askQuestion } = await importFreshAsk()
    const result = await askQuestion({ cached: fixtureCached, question: 'Why is the sky blue?', assumptions })

    expect(result.generatedBy).toBe('deterministic')
    expect(result.answer.toLowerCase()).toContain('bedrock')
    expect(result.toolsUsed).toEqual([])
  })

  it('answers "biggest single risk" from the real blast-radius computation', async () => {
    const { askQuestion } = await importFreshAsk()
    const result = await askQuestion({ cached: fixtureCached, question: 'Which vendor is my biggest single risk?', assumptions })
    expect(result.answer).toContain('Stripe')
    expect(result.numbers.affectedFileCount).toBeGreaterThanOrEqual(0)
  })
})
