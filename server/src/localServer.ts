import { createServer } from 'node:http'
import { handleRequest } from './requestHandler'

const PORT = Number(process.env.PORT ?? 8787)

const server = createServer(handleRequest)

server.listen(PORT, () => {
  console.log(`Blast Radius backend listening on http://localhost:${PORT}`)
})
