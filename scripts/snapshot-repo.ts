/**
 * Runs the full analysis for one repo and writes a demo snapshot to public/demo/<owner>__<repo>.json
 * — the exact shape the frontend's example cards load with zero calls to GitHub or the live
 * backend. The risk summary is generated with the deterministic (non-AI) path only, never the live
 * Bedrock call, so the snapshot is byte-identical every time it's regenerated for the same commit.
 *
 * (public/, not frontend/public/ — this repo has no frontend/ subdirectory; public/ is Vite's own
 * static-asset folder and is served at the site root, so public/demo/x.json -> /demo/x.json.)
 *
 * Usage: tsx scripts/snapshot-repo.ts <owner/repo> [--max-files 1500] [--budget 600]
 *
 * --max-files and --budget (seconds) are LOCAL-ONLY generation options — they raise this script's
 * own analyzeRepo() call above the live API's defaults (MAX_FILES=80, 25s), never the other way
 * around; the live /analyze-repo route always uses its own defaults regardless of these flags.
 * Refuses to write a snapshot (nonzero exit, reason printed, no partial file) when the scan was
 * rate-limited, or when it completed but fetched under 90% of the files it set out to fetch —
 * either way, writing it would ship a demo card built from real numbers that don't reflect the repo.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { analyzeConcentration } from '../src/lib/concentration'
import { analyzeCriticality } from '../src/lib/criticality'
import { buildAdjacencyMap, buildVendorGraph } from '../src/lib/graph'
import type { SubstrateVerificationData } from '../src/lib/substrateVerification'
import { getBranchSha, GithubApiError } from '../server/src/github'
import { analyzeRepo, type AnalyzeRepoResult } from '../server/src/repoParser'
import { generateDeterministicSummary } from '../server/src/riskSummary'

const OUT_DIR = path.join(import.meta.dirname, '..', 'public', 'demo')
const SUBSTRATE_VERIFICATION_PATH = path.join(import.meta.dirname, '..', 'public', 'substrate-verification.json')
const DEFAULT_LOCAL_MAX_FILES = 1500
const DEFAULT_LOCAL_BUDGET_SECONDS = 600
const MIN_COMPLETE_FRACTION = 0.9

function parseFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

export class SnapshotRefusedError extends Error {}

/**
 * Refuses (throws SnapshotRefusedError) rather than writing a snapshot built from a degraded scan —
 * one that fetched under 90% of the files it set out to fetch (almost always the wall-clock budget
 * running out mid-fetch: `truncatedReason: 'time_budget'`). Exported for direct unit testing.
 *
 * A hard rate-limit (GitHub returning 403 on the initial tree/branch lookup) never reaches this
 * check at all — analyzeRepo() throws a GithubApiError first, main() lets it propagate with GitHub's
 * own "rate limit exceeded" message, and no snapshot is written. That's the same "refuse and print
 * why" outcome for that case, just via the error path rather than this function.
 */
export function checkScanIsGoodEnoughToSnapshot(result: AnalyzeRepoResult): void {
  const fraction = result.filesSelected > 0 ? result.filesScanned / result.filesSelected : 1
  if (fraction < MIN_COMPLETE_FRACTION) {
    throw new SnapshotRefusedError(
      `Refusing to snapshot: only fetched ${result.filesScanned} of ${result.filesSelected} selected files (${(fraction * 100).toFixed(0)}%, below the ${MIN_COMPLETE_FRACTION * 100}% floor). truncatedReason=${result.truncatedReason ?? 'none'}.`,
    )
  }
}

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
  const args = process.argv.slice(2)
  const arg = args[0]
  if (!arg) {
    console.error('Usage: tsx scripts/snapshot-repo.ts <owner/repo> [--max-files 1500] [--budget 600]')
    process.exit(1)
  }
  const [owner, repo] = arg.replace(/^https?:\/\/github\.com\//, '').split('/')
  if (!owner || !repo) {
    console.error(`Could not parse "${arg}" as owner/repo.`)
    process.exit(1)
  }
  const maxFiles = Number(parseFlag(args, '--max-files') ?? DEFAULT_LOCAL_MAX_FILES)
  const budgetSeconds = Number(parseFlag(args, '--budget') ?? DEFAULT_LOCAL_BUDGET_SECONDS)

  console.log(`Analyzing ${owner}/${repo}... (local generation: max-files=${maxFiles}, budget=${budgetSeconds}s)`)
  const start = Date.now()
  let result: AnalyzeRepoResult
  try {
    result = await analyzeRepo(`https://github.com/${owner}/${repo}`, undefined, {
      maxFiles,
      scanBudgetMs: budgetSeconds * 1000,
    })
  } catch (err) {
    if (err instanceof GithubApiError && err.status === 403) {
      throw new SnapshotRefusedError(`Refusing to snapshot: ${err.message}`)
    }
    throw err
  }
  checkScanIsGoodEnoughToSnapshot(result)
  console.log(
    `Scanned ${result.filesScanned} of ${result.filesSelected} selected files` +
      (result.truncated ? ` (truncated: ${result.truncatedReason})` : ' (full scan, not truncated)'),
  )
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
    own: result.own,
    riskSummary,
    ...(substrateVerification ? { substrateVerification } : {}),
    meta: {
      owner,
      repo,
      branch: result.branch,
      filesScanned: result.filesScanned,
      filesSelected: result.filesSelected,
      truncated: result.truncated,
      truncatedReason: result.truncatedReason,
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

// Only runs when invoked directly (tsx scripts/snapshot-repo.ts ...) — guarded so a test can import
// checkScanIsGoodEnoughToSnapshot/SnapshotRefusedError without triggering a real GitHub scan.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    if (err instanceof SnapshotRefusedError) {
      console.error(err.message)
    } else {
      console.error(err)
    }
    process.exit(1)
  })
}
