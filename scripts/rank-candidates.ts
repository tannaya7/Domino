/**
 * Ranks candidate public repos for use as demo showcase repos, using the SAME analyzeRepo()
 * pipeline the real app runs — so the numbers here are exactly what the app would show, not an
 * approximation. Local generation uses a higher file cap and time budget than the live API (see
 * LOCAL_MAX_FILES/LOCAL_BUDGET_MS below) so ranking isn't itself distorted by truncation; unreachable
 * repos (private, deleted, rate-limited) are skipped with a reason, never silently dropped.
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

// LOCAL-ONLY generation options — never applied to the live API, which keeps its own 80-file/25s
// defaults regardless of this script.
const LOCAL_MAX_FILES = 1500
const LOCAL_BUDGET_MS = 600_000

// The showcase bar (see docs/kb-todo.md-style reasoning inline): a full (non-truncated) scan,
// >= 8 vendors, >= 3 substrates. IaC presence is a tie-breaker among repos that clear that bar.
const MIN_VENDORS = 8
const MIN_SUBSTRATES = 3

interface Ranked {
  repo: string
  vendors: number
  substrates: number
  filesScanned: number
  filesSelected: number
  truncated: boolean
  truncatedReason?: 'file_cap' | 'time_budget'
  scanMs: number
  /** IaC files this repo's own-infrastructure linter actually scanned — 0 means the "Your
   * infrastructure" card would render empty for this repo, a weak showcase pick. */
  ownIacFilesScanned: number
  ownFindings: number
  status: 'ok' | 'skipped'
  reason?: string
}

function qualifies(r: Ranked): boolean {
  return r.status === 'ok' && !r.truncated && r.vendors >= MIN_VENDORS && r.substrates >= MIN_SUBSTRATES
}

async function analyzeCandidate(repo: string): Promise<Ranked> {
  const start = Date.now()
  try {
    const result = await analyzeRepo(`https://github.com/${repo}`, undefined, {
      maxFiles: LOCAL_MAX_FILES,
      scanBudgetMs: LOCAL_BUDGET_MS,
    })
    const concentration = analyzeConcentration(result.vendors, result.iacSubstrates)
    return {
      repo,
      vendors: result.vendors.length,
      substrates: concentration.substrateCount,
      filesScanned: result.filesScanned,
      filesSelected: result.filesSelected,
      truncated: result.truncated,
      truncatedReason: result.truncatedReason,
      scanMs: Date.now() - start,
      ownIacFilesScanned: result.own.filesScanned,
      ownFindings: result.own.findings.length,
      status: 'ok',
    }
  } catch (err) {
    return {
      repo,
      vendors: 0,
      substrates: 0,
      filesScanned: 0,
      filesSelected: 0,
      truncated: false,
      scanMs: Date.now() - start,
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
  console.log(`Analyzing ${candidates.length} candidate repo(s) (max-files=${LOCAL_MAX_FILES}, budget=${LOCAL_BUDGET_MS / 1000}s)...\n`)

  const results: Ranked[] = []
  for (const repo of candidates) {
    process.stdout.write(`  ${repo}... `)
    const result = await analyzeCandidate(repo)
    console.log(result.status === 'ok' ? `ok (${(result.scanMs / 1000).toFixed(1)}s)` : `SKIPPED (${result.reason})`)
    results.push(result)
  }

  const ok = results.filter((r) => r.status === 'ok')
  const skipped = results.filter((r) => r.status === 'skipped')

  // Fully-qualifying repos (full scan, >= 8 vendors, >= 3 substrates) first, ranked among themselves
  // by vendor count then substrate count then IaC presence (tie-break); everything else follows,
  // ranked the same way, so a "best available" fallback still has a sensible order.
  ok.sort((a, b) => {
    const aQ = qualifies(a) ? 1 : 0
    const bQ = qualifies(b) ? 1 : 0
    if (aQ !== bQ) return bQ - aQ
    if (b.vendors !== a.vendors) return b.vendors - a.vendors
    if (b.substrates !== a.substrates) return b.substrates - a.substrates
    const aHasIac = a.ownIacFilesScanned > 0 ? 1 : 0
    const bHasIac = b.ownIacFilesScanned > 0 ? 1 : 0
    return bHasIac - aHasIac
  })

  console.log(
    '\n' +
      pad('Repo', 30) +
      pad('Vendors', 9) +
      pad('Substrates', 12) +
      pad('Files scanned/selected', 25) +
      pad('Truncated', 20) +
      pad('IaC files', 11) +
      'Seconds',
  )
  console.log('-'.repeat(30 + 9 + 12 + 25 + 20 + 11 + 7))
  for (const r of ok) {
    const flag = qualifies(r) ? ' *' : ''
    const truncatedText = r.truncated ? `yes (${r.truncatedReason ?? 'unknown'})` : 'no'
    console.log(
      pad(r.repo + flag, 30) +
        pad(r.vendors, 9) +
        pad(r.substrates, 12) +
        pad(`${r.filesScanned}/${r.filesSelected}`, 25) +
        pad(truncatedText, 20) +
        pad(r.ownIacFilesScanned, 11) +
        (r.scanMs / 1000).toFixed(1),
    )
  }
  console.log(`\n* qualifies: full scan (not truncated), >= ${MIN_VENDORS} vendors, >= ${MIN_SUBSTRATES} substrates`)
  console.log("'IaC files' > 0 means the \"Your infrastructure\" card would render non-empty for this repo.")

  if (skipped.length > 0) {
    console.log('\nSkipped (unreachable):')
    for (const r of skipped) console.log(`  ${r.repo}: ${r.reason}`)
  }

  const qualifyingCount = ok.filter(qualifies).length
  console.log(
    `\n${qualifyingCount} of ${candidates.length} candidate(s) qualify. Top pick(s): ${ok.slice(0, 3).map((r) => r.repo).join(', ') || '(none reachable)'}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
