/**
 * Runs the full analysis for one repo and writes a demo snapshot to public/demo/<owner>__<repo>.json
 * — the exact shape the frontend's example cards load with zero calls to GitHub or the live
 * backend. The risk summary is generated with the deterministic (non-AI) path only, never the live
 * Bedrock call, so the snapshot is byte-identical every time it's regenerated for the same commit.
 *
 * (public/, not frontend/public/ — this repo has no frontend/ subdirectory; public/ is Vite's own
 * static-asset folder and is served at the site root, so public/demo/x.json -> /demo/x.json.)
 *
 * Usage: tsx scripts/snapshot-repo.ts <owner/repo>
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { analyzeConcentration } from '../src/lib/concentration'
import { analyzeCriticality } from '../src/lib/criticality'
import { buildAdjacencyMap, buildVendorGraph } from '../src/lib/graph'
import type { SubstrateVerificationData } from '../src/lib/substrateVerification'
import { getBranchSha } from '../server/src/github'
import { analyzeRepo } from '../server/src/repoParser'
import { generateDeterministicSummary } from '../server/src/riskSummary'

const OUT_DIR = path.join(import.meta.dirname, '..', 'public', 'demo')
const SUBSTRATE_VERIFICATION_PATH = path.join(import.meta.dirname, '..', 'public', 'substrate-verification.json')

/** Embeds whatever scripts/verify-substrates.ts last produced, frozen at this snapshot's
 * generation time — undefined (never a fabricated empty result) if that script has never been run
 * in this checkout. */
async function readCurrentSubstrateVerification(): Promise<SubstrateVerificationData | undefined> {
  try {
    return JSON.parse(await readFile(SUBSTRATE_VERIFICATION_PATH, 'utf-8')) as SubstrateVerificationData
  } catch {
    return undefined
  }
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: tsx scripts/snapshot-repo.ts <owner/repo>')
    process.exit(1)
  }
  const [owner, repo] = arg.replace(/^https?:\/\/github\.com\//, '').split('/')
  if (!owner || !repo) {
    console.error(`Could not parse "${arg}" as owner/repo.`)
    process.exit(1)
  }

  console.log(`Analyzing ${owner}/${repo}...`)
  const start = Date.now()
  const result = await analyzeRepo(`https://github.com/${owner}/${repo}`)
  const sha = await getBranchSha(owner, repo, result.branch)

  const adjacency = buildAdjacencyMap(result.graph.nodes, result.graph.edges)
  const vendorGraph = buildVendorGraph(result.vendors, adjacency)
  const concentration = analyzeConcentration(result.vendors, result.iacSubstrates)
  const criticality = analyzeCriticality(
    adjacency,
    result.graph.nodes.map((n) => n.id),
    result.entrypoints.length > 0 ? result.entrypoints : undefined,
  )

  // The single highest-blast-radius vendor (or, if there are none, the highest-criticality file)
  // gets a real, reproducible risk summary — a representative "why this matters" for the snapshot,
  // not a summary of everything.
  const topVendor = [...vendorGraph.vendors].sort((a, b) => b.affectedFiles.length - a.affectedFiles.length)[0]
  const riskSummary = topVendor
    ? {
        subject: `vendor:${topVendor.vendor}`,
        text: generateDeterministicSummary({
          name: topVendor.vendor,
          type: topVendor.tier,
          downstream: topVendor.affectedFiles,
          upstream: [],
        }),
      }
    : (() => {
        const topFile = [...criticality.byNode].sort(
          (a, b) => b.affectedEntrypoints.length + b.orphanedNodes.length - (a.affectedEntrypoints.length + a.orphanedNodes.length),
        )[0]
        if (!topFile) return null
        return {
          subject: `file:${topFile.nodeId}`,
          text: generateDeterministicSummary({
            name: topFile.nodeId,
            type: 'file',
            downstream: [...topFile.affectedEntrypoints, ...topFile.orphanedNodes],
            upstream: [],
          }),
        }
      })()

  const substrateVerification = await readCurrentSubstrateVerification()

  const snapshot = {
    owner,
    repo,
    branch: result.branch,
    commitSha: sha,
    generatedAt: new Date().toISOString(),
    nodes: result.graph.nodes,
    edges: result.graph.edges,
    vendors: result.vendors,
    vendorGraph,
    concentration,
    criticality,
    unclassified: result.unclassified,
    riskSummary,
    ...(substrateVerification ? { substrateVerification } : {}),
    meta: {
      owner,
      repo,
      branch: result.branch,
      filesScanned: result.filesScanned,
      truncated: result.truncated,
      elapsedMs: Date.now() - start,
      cached: false,
      importResolution: result.importResolution,
    },
  }

  await mkdir(OUT_DIR, { recursive: true })
  const outPath = path.join(OUT_DIR, `${owner}__${repo}.json`)
  await writeFile(outPath, JSON.stringify(snapshot, null, 2))

  console.log(`Wrote ${outPath}`)
  console.log(
    `  ${result.vendors.length} vendor(s) -> ${concentration.substrateCount} substrate(s), ${result.graph.nodes.length} nodes / ${result.graph.edges.length} edges, sha ${sha.slice(0, 7)}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
