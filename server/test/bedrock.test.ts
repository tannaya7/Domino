import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(function BedrockRuntimeClient() {
    return { send: sendMock }
  }),
  InvokeModelCommand: vi.fn().mockImplementation(function InvokeModelCommand(input: unknown) {
    return { input }
  }),
}))

function bedrockBody(text: string): { body: Uint8Array } {
  return { body: new TextEncoder().encode(JSON.stringify({ content: [{ text }] })) }
}

async function importFreshBedrock() {
  vi.resetModules()
  return import('../src/bedrock')
}

describe('invokeBedrock', () => {
  beforeEach(() => {
    sendMock.mockReset()
  })

  afterEach(() => {
    delete process.env.BEDROCK_MODEL_ID
  })

  it('returns null without calling Bedrock when BEDROCK_MODEL_ID is not set', async () => {
    delete process.env.BEDROCK_MODEL_ID
    const { invokeBedrock } = await importFreshBedrock()
    expect(await invokeBedrock('prompt')).toBeNull()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('returns the model text on success', async () => {
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-test'
    sendMock.mockResolvedValueOnce(bedrockBody('{"summary": "all good"}'))
    const { invokeBedrock } = await importFreshBedrock()
    expect(await invokeBedrock('prompt')).toBe('{"summary": "all good"}')
  })

  it('retries once on failure before giving up', async () => {
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-test'
    sendMock.mockRejectedValueOnce(new Error('ThrottlingException')).mockResolvedValueOnce(bedrockBody('ok'))
    const { invokeBedrock } = await importFreshBedrock()
    expect(await invokeBedrock('prompt')).toBe('ok')
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('returns null (never throws) when every attempt fails', async () => {
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-test'
    sendMock.mockRejectedValue(new Error('AccessDeniedException'))
    const { invokeBedrock } = await importFreshBedrock()
    await expect(invokeBedrock('prompt')).resolves.toBeNull()
  })

  it('bounds an oversized prompt (e.g. from repo-controlled content) before sending it', async () => {
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-test'
    sendMock.mockResolvedValueOnce(bedrockBody('ok'))
    const { invokeBedrock } = await importFreshBedrock()

    await invokeBedrock('x'.repeat(50_000))
    const sentBody = JSON.parse(sendMock.mock.calls[0][0].input.body)
    const sentPromptLength = sentBody.messages[0].content.length
    expect(sentPromptLength).toBeLessThan(50_000)
  })

  it('returns null for a malformed response body instead of throwing', async () => {
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-test'
    sendMock.mockResolvedValue({ body: new TextEncoder().encode('not json') })
    const { invokeBedrock } = await importFreshBedrock()
    await expect(invokeBedrock('prompt')).resolves.toBeNull()
  })
})

describe('extractJson', () => {
  it('parses a bare JSON object', async () => {
    const { extractJson } = await importFreshBedrock()
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 })
  })

  it('parses JSON wrapped in a markdown code fence', async () => {
    const { extractJson } = await importFreshBedrock()
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('returns null for unparsable text instead of throwing', async () => {
    const { extractJson } = await importFreshBedrock()
    expect(extractJson('not json at all')).toBeNull()
  })
})
