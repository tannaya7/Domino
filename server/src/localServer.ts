import { config as loadDotenv } from 'dotenv'
import { createServer } from 'node:http'
import { handleRequest } from './requestHandler'

// Local dev only: reads server/.env (git-ignored) into process.env before anything else touches
// it — GITHUB_TOKEN, BEDROCK_MODEL_ID, etc. never need to be typed into a terminal command or
// pasted anywhere that gets logged. A real deployment (Lambda) sets these via its own config, not
// a file, so this has no equivalent in lambdaHandler.ts. A missing .env is not an error — every
// var here already has a documented fallback (see README's AWS integration table).
loadDotenv({ path: new URL('../.env', import.meta.url) })

const PORT = Number(process.env.PORT ?? 8787)

const server = createServer(handleRequest)

server.listen(PORT, () => {
  console.log(`Blast Radius backend listening on http://localhost:${PORT}`)
})
