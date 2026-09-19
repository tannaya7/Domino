import { errorMessage, healthCheck, HttpError, routeApi } from './apiRouter'
import { MAX_BODY_BYTES } from './limits'

// Real Lambda entry point for the API Gateway HTTP API (payload format 2.0) integration. Not a
// dependency on @types/aws-lambda — the two shapes below are the minimal documented subset of the
// v2.0 event/response contract this handler actually uses, avoiding an extra package for types
// alone. This has NOT been deployed or run against real API Gateway/Lambda yet; it is written to
// the documented contract and exercised by unit tests in server/test/lambdaHandler.test.ts, but
// that is not the same as a verified live deployment — see DEPLOYMENT.md.

export interface ApiGatewayV2Event {
  rawPath: string
  requestContext: { http: { method: string } }
  body?: string | null
  isBase64Encoded?: boolean
}

export interface ApiGatewayV2Result {
  statusCode: number
  headers: Record<string, string>
  body: string
}

/** Locked to the deployed CloudFront origin via ALLOWED_ORIGIN; '*' is a local/dev-only default —
 * the SAM template always sets this to the real distribution domain. Read live (not cached at
 * module load) so it can't go stale across a warm Lambda container if ever changed without a
 * redeploy, and so tests can vary it per-case. */
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
}

function json(statusCode: number, body: unknown): ApiGatewayV2Result {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) }
}

/** API Gateway hands this whole thing over already-buffered (unlike the local http server, there's
 * no stream to abort mid-flight) — so the size check runs on the decoded byte length BEFORE
 * JSON.parse, not during accumulation. A base64 body's decoded length is checked, not the
 * (shorter) encoded string length, so this can't be bypassed by base64-encoding a payload that
 * decodes to something larger than MAX_BODY_BYTES. */
function decodeBody(event: ApiGatewayV2Event): string {
  if (!event.body) return ''
  if (event.isBase64Encoded) {
    const decoded = Buffer.from(event.body, 'base64')
    if (decoded.byteLength > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large.')
    return decoded.toString('utf-8')
  }
  if (Buffer.byteLength(event.body, 'utf-8') > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large.')
  return event.body
}

export async function handler(event: ApiGatewayV2Event): Promise<ApiGatewayV2Result> {
  const method = event.requestContext?.http?.method ?? 'GET'
  if (method === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' }
  if (method === 'GET' && event.rawPath === '/health') {
    const { status, body } = healthCheck()
    return json(status, body)
  }
  if (method !== 'POST') return json(404, { error: 'Not found' })

  let body: Record<string, unknown> = {}
  try {
    const raw = decodeBody(event)
    body = raw ? JSON.parse(raw) : {}
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message })
    return json(400, { error: 'Malformed JSON body.' })
  }

  try {
    const result = await routeApi(event.rawPath, body)
    return json(result.status, result.body)
  } catch (err) {
    const { status, message } = errorMessage(err)
    return json(status, { error: message })
  }
}
