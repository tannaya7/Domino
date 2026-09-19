import type { IncomingMessage, ServerResponse } from 'node:http'
import { errorMessage, HttpError, routeApi } from './apiRouter'
import { MAX_BODY_BYTES } from './limits'

function setCors(res: ServerResponse) {
  // '*' is the local-dev default; set ALLOWED_ORIGIN to lock this down (the deployed Lambda always does).
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).length
    if (total > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large.')
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) return {}
  return JSON.parse(raw)
}

/** The local dev / Node-http entry point. Everything routing-related lives in ./apiRouter, shared with lambdaHandler.ts. */
export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    if (req.method !== 'POST' || !req.url) {
      sendJson(res, 404, { error: 'Not found' })
      return
    }
    const body = await readJsonBody(req)
    const { status, body: responseBody } = await routeApi(req.url, body)
    sendJson(res, status, responseBody)
  } catch (err) {
    const { status, message } = errorMessage(err)
    sendJson(res, status, { error: message })
  }
}
