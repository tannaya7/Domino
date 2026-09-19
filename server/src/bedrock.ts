import { withTimeout } from './withTimeout'

// Real Amazon Bedrock integration via the Converse API (@aws-sdk/client-bedrock-runtime) — a
// single request/response shape that works across model families (Amazon Nova, Anthropic Claude,
// Meta Llama, ...) on Bedrock, so BEDROCK_MODEL_ID can point at whichever cheap/fast model is
// actually available and granted in your account/region without a code change. Only activates
// when BEDROCK_MODEL_ID is set — without it we skip straight to each caller's deterministic
// fallback rather than making a network call that's certain to fail from an unconfigured account.
// Credentials resolve via the standard AWS SDK credential chain — never hardcoded here.

const DEFAULT_TIMEOUT_MS = 8000
const MAX_ATTEMPTS = 2
// Prompts can include repo-derived content (file paths, import specifiers) from a repo an attacker
// controls — this bounds both runaway token cost and how much of that untrusted text reaches the
// model in one call. It doesn't "fix" prompt injection (no truncation can), but limits its scale.
const MAX_PROMPT_LENGTH = 6000

function getModelId(): string | undefined {
  return process.env.BEDROCK_MODEL_ID
}

/** BEDROCK_REGION lets Bedrock live in a different region than the rest of the stack (e.g. if your
 * chosen model isn't offered where DynamoDB/SNS run) — falls back to AWS_REGION, then us-east-1. */
function getRegion(): string {
  return process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1'
}

export function isBedrockConfigured(): boolean {
  return Boolean(getModelId())
}

let clientPromise: Promise<import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient> | null = null

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime')
      return new BedrockRuntimeClient({ region: getRegion() })
    })()
  }
  return clientPromise
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface ConverseResponseShape {
  output?: { message?: { content?: Array<{ text?: string }> } }
}

async function invokeOnce(modelId: string, prompt: string, timeoutMs: number): Promise<string | null> {
  const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime')
  const client = await getClient()

  const response = (await withTimeout(
    client.send(
      new ConverseCommand({
        modelId,
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 1024, temperature: 0.3 },
      }),
    ),
    timeoutMs,
    'Bedrock Converse',
  )) as ConverseResponseShape

  const text = response.output?.message?.content?.find((block) => typeof block.text === 'string')?.text
  return typeof text === 'string' && text.length > 0 ? text : null
}

/**
 * Sends a prompt to the configured Bedrock model (via Converse) and returns its raw text output,
 * retrying once on failure. Returns null — never throws — if Bedrock isn't configured,
 * credentials/access are unavailable, every attempt times out, or the response is malformed.
 * Callers MUST treat null as "use the deterministic fallback," not as an error to propagate.
 */
export async function invokeBedrock(prompt: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string | null> {
  const modelId = getModelId()
  if (!modelId) return null
  const boundedPrompt = prompt.length > MAX_PROMPT_LENGTH ? prompt.slice(0, MAX_PROMPT_LENGTH) : prompt

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await invokeOnce(modelId, boundedPrompt, timeoutMs)
    } catch {
      if (attempt < MAX_ATTEMPTS) await sleep(300)
    }
  }
  return null
}

/** Extracts the first JSON value from a model response, tolerating ```json fences. Returns null if nothing parses. */
export function extractJson<T>(raw: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw)
  const candidate = fenced ? fenced[1] : raw
  try {
    return JSON.parse(candidate.trim()) as T
  } catch {
    return null
  }
}

// --- Converse with tool use (server/src/ask.ts) -------------------------------------------------
// A second, separate entry point from invokeBedrock() above: "Ask Blast Radius" needs a real
// multi-turn tool-use loop (model asks for a tool, we run it, we hand back the result, repeat),
// which invokeBedrock's single-prompt/single-response shape can't express. This function is
// intentionally just the Bedrock plumbing for ONE Converse call — the loop itself (how many tool
// calls to allow, executing them, deciding when to stop) lives in ask.ts, since only it knows how
// to run these specific tools.

export interface BedrockTool {
  name: string
  description: string
  /** A JSON Schema object (type: 'object', properties, required) — passed through to Converse's
   * toolSpec.inputSchema.json verbatim. */
  inputSchema: Record<string, unknown>
}

export interface BedrockToolUse {
  toolUseId: string
  name: string
  input: Record<string, unknown>
}

export type BedrockConverseRole = 'user' | 'assistant'

/** A minimal, Converse-content-block-shaped message — only the block kinds ask.ts actually needs
 * (text, toolUse, toolResult), not the full SDK union. */
export interface BedrockConverseMessage {
  role: BedrockConverseRole
  content: Array<
    | { text: string }
    | { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } }
    | { toolResult: { toolUseId: string; content: Array<{ json: unknown }>; status?: 'success' | 'error' } }
  >
}

export interface BedrockConverseTurn {
  /** Text the model produced this turn, if any (usually present only on the FINAL turn, once it's
   * done calling tools). */
  text: string | null
  toolUses: BedrockToolUse[]
}

interface ConverseWithToolsResponseShape {
  output?: {
    message?: {
      content?: Array<{ text?: string; toolUse?: { toolUseId: string; name: string; input: Record<string, unknown> } }>
    }
  }
}

/**
 * One Converse call with toolConfig attached. Returns null — never throws — exactly like
 * invokeBedrock: not configured, no credentials/access, a timeout, or a malformed response all
 * collapse to null so the caller (ask.ts) always has a deterministic fallback to reach for.
 */
export async function converseWithTools(
  messages: BedrockConverseMessage[],
  systemPrompt: string,
  tools: BedrockTool[],
  options: { maxOutputTokens?: number; timeoutMs?: number } = {},
): Promise<BedrockConverseTurn | null> {
  const modelId = getModelId()
  if (!modelId) return null

  try {
    const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime')
    const client = await getClient()

    const response = (await withTimeout(
      client.send(
        new ConverseCommand({
          modelId,
          system: [{ text: systemPrompt }],
          messages: messages as never,
          toolConfig: {
            tools: tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema } } })) as never,
          },
          inferenceConfig: { maxTokens: options.maxOutputTokens ?? 400, temperature: 0.2 },
        }),
      ),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      'Bedrock Converse (tools)',
    )) as ConverseWithToolsResponseShape

    const content = response.output?.message?.content ?? []
    const textBlock = content.find((block): block is { text: string } => typeof block.text === 'string')
    const toolUses = content
      .filter((block): block is { toolUse: BedrockToolUse } => block.toolUse !== undefined)
      .map((block) => block.toolUse)

    return { text: textBlock?.text ?? null, toolUses }
  } catch {
    return null
  }
}
