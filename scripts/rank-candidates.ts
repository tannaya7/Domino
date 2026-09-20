/**
 * Ranks candidate public repos for use as demo showcase repos, using the SAME analyzeRepo()
 * pipeline the real app runs — so the numbers here are exactly what the app would show, not an
 * approximation. Prints a table ranked by vendor count, substrate diversity, graph connectivity,
 * and scan time; unreachable repos (private, deleted, rate-limited) are skipped with a reason,
 * never silently dropped.
 *
 * Usage: tsx scripts/rank-candidates.ts [owner/repo ...]   (defaults to the built-in candidate list)
 */
import { analyzeConcentration } from '../src/lib/concentration'
import { analyzeRepo } from '../server/src/repoParser'

const DEFAULT_CANDIDATES = [
  'vercel/ai-chatbot',
  'nextjs/saas-starter',
  'vercel/platforms',
  'documenso/documenso',
  'formbricks/formbricks',
]

interface Ranked {
  repo: string
  vendors: number
  substrates: number
  nodes: number
  edges: number
  connectivity: number
  scanMs: number
  truncated: boolean
  /** IaC files this repo's own-infrastructure linter actually scanned — 0 means the "Your
   * infrastructure" card would render empty for this repo, a weak showcase pick. */
  ownIacFilesScanned: number
  ownFindings: number
  status: 'ok' | 'skipped'
  reason?: string
}

async function analyzeCandidate(repo: string): Promise<Ranked> {
  const start = Date.now()
  try {
    const result = await analyzeRepo(`https://github.com/${repo}`)
    const concentration = analyzeConcentration(result.vendors, result.iacSubstrates)
    const nodes = result.graph.nodes.length
    const edges = result.graph.edges.length
    return {
      repo,
      vendors: result.vendors.length,
      substrates: concentration.substrateCount,
      nodes,
      edges,
      connectivity: nodes > 0 ? edges / nodes : 0,
      scanMs: Date.now() - start,
      truncated: result.truncated,
      ownIacFilesScanned: result.own.filesScanned,
      ownFindings: result.own.findings.length,
      status: 'ok',
    }
  } catch (err) {
    return {
      repo,
      vendors: 0,
      substrates: 0,
      nodes: 0,
      edges: 0,
      connectivity: 0,
      scanMs: Date.now() - start,
      truncated: false,
      ownIacFilesScanned: 0,
      ownFindings: 0,
      status: 'skipped',
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width)
}

async function main() {
  const candidates = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_CANDIDATES
  console.log(`Analyzing ${candidates.length} candidate repo(s)...\n`)

  const results: Ranked[] = []
  for (const repo of candidates) {
    process.stdout.write(`  ${repo}... `)
    const result = await analyzeCandidate(repo)
    console.log(result.status === 'ok' ? `ok (${result.scanMs}ms)` : `SKIPPED (${result.reason})`)
    results.push(result)
  }

  const ok = results.filter((r) => r.status === 'ok')
  const skipped = results.filter((r) => r.status === 'skipped')

  // Ranked by: substrate diversity >= 3 first (the whole point of this tool), then vendor count,
  // then connectivity — a repo with a disconnected file graph makes a weak demo regardless of
  // vendor count. Real IaC presence is a tiebreak on top of that, not a primary criterion — it
  // matters for a non-empty "Your infrastructure" card, but shouldn't override the vendor-diversity
  // picks this tool exists for.
  ok.sort((a, b) => {
    const aQualifies = a.substrates >= 3 ? 1 : 0
    const bQualifies = b.substrates >= 3 ? 1 : 0
    if (aQualifies !== bQualifies) return bQualifies - aQualifies
    if (b.vendors !== a.vendors) return b.vendors - a.vendors
    const aHasIac = a.ownIacFilesScanned > 0 ? 1 : 0
    const bHasIac = b.ownIacFilesScanned > 0 ? 1 : 0
    if (aHasIac !== bHasIac) return bHasIac - aHasIac
    return b.connectivity - a.connectivity
  })

  console.log(
    '\n' +
      pad('Repo', 28) +
      pad('Vendors', 9) +
      pad('Substrates', 12) +
      pad('Nodes', 8) +
      pad('Edges', 8) +
      pad('Edges/Node', 12) +
      pad('Scan ms', 9) +
      pad('Truncated', 11) +
      pad('IaC files', 11) +
      'Own findings',
  )
  console.log('-'.repeat(28 + 9 + 12 + 8 + 8 + 12 + 9 + 11 + 11 + 12))
  for (const r of ok) {
    const flag = r.substrates >= 3 ? ' *' : ''
    console.log(
      pad(r.repo + flag, 28) +
        pad(r.vendors, 9) +
        pad(r.substrates, 12) +
        pad(r.nodes, 8) +
        pad(r.edges, 8) +
        pad(r.connectivity.toFixed(2), 12) +
        pad(r.scanMs, 9) +
        pad(r.truncated ? 'yes' : 'no', 11) +
        pad(r.ownIacFilesScanned, 11) +
        r.ownFindings,
    )
  }
  console.log('\n* substrate diversity >= 3 (showcase-worthy for correlated-risk demos)')
  console.log("'IaC files' > 0 means the \"Your infrastructure\" card would render non-empty for this repo.")

  if (skipped.length > 0) {
    console.log('\nSkipped (unreachable):')
    for (const r of skipped) console.log(`  ${r.repo}: ${r.reason}`)
  }

  console.log(`\nTop pick(s) for the demo: ${ok.slice(0, 3).map((r) => r.repo).join(', ') || '(none reachable)'}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
