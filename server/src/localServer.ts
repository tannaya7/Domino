import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { getCachedGraph, setCachedGraph } from './cache'
import { GithubApiError, parseRepoUrl } from './github'
import { analyzePr } from './prAnalyzer'
import { analyzeRepo } from './repoParser'
import { getRiskSummary } from './riskSummary'

const PORT = Number(process.env.PORT ?? 8787)

function setCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) return {}
  return JSON.parse(raw)
}

function errorMessage(err: unknown): { status: number; message: string } {
  if (err instanceof GithubApiError) return { status: err.status, message: err.message }
  if (err instanceof Error) return { status: 400, message: err.message }
  return { status: 500, message: 'Unknown error.' }
}

const server = createServer(async (req, res) => {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  try {
    if (req.method === 'POST' && req.url === '/analyze-repo') {
      const body = await readJsonBody(req)
      const repoUrl = String(body.repoUrl ?? '')
      const start = Date.now()

      const { owner, repo } = parseRepoUrl(repoUrl)
      const cacheKey = `${owner}/${repo}`
      const cached = getCachedGraph(cacheKey)
      const result = cached ?? (await analyzeRepo(repoUrl))
      if (!cached) setCachedGraph(cacheKey, result)

      sendJson(res, 200, {
        nodes: result.graph.nodes,
        edges: result.graph.edges,
        meta: {
          owner: result.owner,
          repo: result.repo,
          branch: result.branch,
          filesScanned: result.filesScanned,
          truncated: result.truncated,
          elapsedMs: Date.now() - start,
          cached: Boolean(cached),
        },
      })
      return
    }

    if (req.method === 'POST' && req.url === '/analyze-pr') {
      const body = await readJsonBody(req)
      const prUrl = String(body.prUrl ?? '')
      const result = await analyzePr(prUrl)
      sendJson(res, 200, result)
      return
    }

    if (req.method === 'POST' && req.url === '/risk-summary') {
      const body = await readJsonBody(req)
      const summary = await getRiskSummary({
        name: String(body.name ?? ''),
        type: String(body.type ?? ''),
        downstream: Array.isArray(body.downstream) ? body.downstream.map(String) : [],
        upstream: Array.isArray(body.upstream) ? body.upstream.map(String) : [],
      })
      sendJson(res, 200, { summary })
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    const { status, message } = errorMessage(err)
    sendJson(res, status, { error: message })
  }
})

server.listen(PORT, () => {
  console.log(`Blast Radius backend listening on http://localhost:${PORT}`)
})
