import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendMock = vi.fn()

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(function BedrockRuntimeClient() {
    return { send: sendMock }
  }),
  ConverseCommand: vi.fn().mockImplementation(function ConverseCommand(input: unknown) {
    return { input }
  }),
}))

function converseResponse(text: string) {
  return { output: { message: { role: 'assistant', content: [{ text }] } } }
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
    sendMock.mockResolvedValueOnce(converseResponse('{"summary": "all good"}'))
    const { invokeBedrock } = await importFreshBedrock()
    expect(await invokeBedrock('prompt')).toBe('{"summary": "all good"}')
  })

  it('sends a Converse request with the configured model id and the prompt as message content', async () => {
    process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0'
    sendMock.mockResolvedValueOnce(converseResponse('ok'))
    const { invokeBedrock } = await importFreshBedrock()

    await invokeBedrock('hello there')
    const sent = sendMock.mock.calls[0][0].input
    expect(sent.modelId).toBe('amazon.nova-lite-v1:0')
    expect(sent.messages).toEqual([{ role: 'user', content: [{ text: 'hello there' }] }])
  })

  it('retries once on failure before giving up', async () => {
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-test'
    sendMock.mockRejectedValueOnce(new Error('ThrottlingException')).mockResolvedValueOnce(converseResponse('ok'))
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
    sendMock.mockResolvedValueOnce(converseResponse('ok'))
    const { invokeBedrock } = await importFreshBedrock()

    await invokeBedrock('x'.repeat(50_000))
    const sentText = sendMock.mock.calls[0][0].input.messages[0].content[0].text
    expect(sentText.length).toBeLessThan(50_000)
  })

  it('returns null for a malformed response instead of throwing', async () => {
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-test'
    sendMock.mockResolvedValue({ output: { message: { content: [] } } })
    const { invokeBedrock } = await importFreshBedrock()
    await expect(invokeBedrock('prompt')).resolves.toBeNull()
  })

  it('returns null when the SDK response has no output at all', async () => {
    process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-test'
    sendMock.mockResolvedValue({})
    const { invokeBedrock } = await importFreshBedrock()
    await expect(invokeBedrock('prompt')).resolves.toBeNull()
  })
})

describe('region resolution', () => {
  afterEach(() => {
    delete process.env.BEDROCK_MODEL_ID
    delete process.env.BEDROCK_REGION
    delete process.env.AWS_REGION
  })

  it('prefers BEDROCK_REGION over AWS_REGION', async () => {
    process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0'
    process.env.BEDROCK_REGION = 'ap-south-1'
    process.env.AWS_REGION = 'us-west-2'
    sendMock.mockResolvedValueOnce(converseResponse('ok'))

    vi.resetModules()
    const { BedrockRuntimeClient } = (await import('@aws-sdk/client-bedrock-runtime')) as unknown as {
      BedrockRuntimeClient: ReturnType<typeof vi.fn>
    }
    const { invokeBedrock } = await import('../src/bedrock')
    await invokeBedrock('prompt')

    expect(BedrockRuntimeClient).toHaveBeenCalledWith({ region: 'ap-south-1' })
  })

  it('falls back to AWS_REGION, then us-east-1, when BEDROCK_REGION is unset', async () => {
    process.env.BEDROCK_MODEL_ID = 'amazon.nova-lite-v1:0'
    delete process.env.BEDROCK_REGION
    delete process.env.AWS_REGION
    sendMock.mockResolvedValueOnce(converseResponse('ok'))

    vi.resetModules()
    const { BedrockRuntimeClient } = (await import('@aws-sdk/client-bedrock-runtime')) as unknown as {
      BedrockRuntimeClient: ReturnType<typeof vi.fn>
    }
    const { invokeBedrock } = await import('../src/bedrock')
    await invokeBedrock('prompt')

    expect(BedrockRuntimeClient).toHaveBeenCalledWith({ region: 'us-east-1' })
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
