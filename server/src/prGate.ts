import { buildWhatIfResult, computeExactAvailability } from '../../src/lib/availability'
import { analyzeConcentration } from '../../src/lib/concentration'
import { buildAdjacencyMap, getBlastRadius } from '../../src/lib/graph'
import type { ConcentrationResult, ExactAvailabilityAssumptions, Vendor } from '../../src/lib/types'
import { getCachedGraph, setCachedGraph } from './cache'
import { extractEnvVarNames } from './envScanner'
import { buildGateMarkdown, type GateMarkdownInput } from './gateMarkdown'
import { getGateNarrative } from './gateNarrative'
import {
  getDefaultBranch,
  getFullPullRequest,
  getPullRequestFiles,
  getRawFileContent,
  GithubApiError,
  parseStrictPrUrl,
  type PullRequestFile,
} from './github'
import { extractImportSpecifiers } from './importParser'
import { KNOWN_MANIFEST_FILENAMES, parseManifest } from './manifestParser'
import { evaluatePolicy, validateGatePolicy, type PolicyEvalInput, type PolicyResult } from './policy'
import { analyzeRepo } from './repoParser'
import { resolveVendors, type FileVendorSignal } from './vendorResolver'

// The changed-file cap this feature is built around (item 1 in the spec) — large PRs still get a
// useful, representative signal (manifests/config first) rather than an ever-growing fetch list.
const MAX_CHANGED_FILES = 40
const TRACKED_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']
const CONFIG_FILENAME = /config|setup/i
const GATE_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour, per spec item 5

export interface GateNewVendor {
  key: string
  vendor: string
  substrate: string[]
  category: string
  detectedVia: string[]
  files: string[]
}

export interface GateResult {
  pr: { owner: string; repo: string; number: number; headSha: string; baseRef: string; baselineNote: string }
  newVendors: GateNewVendor[]
  entrypointsAffected: string[]
  concentration: { before: ConcentrationResult; after: ConcentrationResult }
  exposure: { before: number; after: number; delta: number; currency: string }
  policy: PolicyResult
  markdown: string
  truncated: boolean
}

interface GateCacheEntry {
  result: GateResult
  policyInput: PolicyEvalInput
  markdownInput: Omit<GateMarkdownInput, 'policy'>
  expiresAt: number
}

const gateCache = new Map<string, GateCacheEntry>()

/** Exposed only for tests — production callers never need to reach in and clear this. */
export function clearGateCache(): void {
  gateCache.clear()
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

/** Manifests first (the strongest single vendor-discovery signal), then config-shaped filenames,
 * then everything else — mirrors repoParser.ts's own file-priority heuristic for the full-repo scan. */
function prioritizeChangedFiles(files: PullRequestFile[]): PullRequestFile[] {
  function score(file: PullRequestFile): number {
    const base = basename(file.filename)
    if (KNOWN_MANIFEST_FILENAMES.includes(base)) return 0
    if (CONFIG_FILENAME.test(base)) return 1
    return 2
  }
  return [...files].sort((a, b) => score(a) - score(b))
}

/**
 * Runs the SAME vendor detectors repoParser.ts uses on a full repo scan (import specifiers, env
 * var references, manifest dependency parsing), just against one file's raw content in isolation.
 * A deliberate, documented simplification for the time-boxed first version: a changed file's
 * relative imports can't be resolved without the whole repo's file list (only bare/vendor
 * specifiers are usable here, which is exactly what vendor detection needs anyway), and dedicated
 * .env-file KEY=VALUE parsing / IaC substrate parsing are out of scope — extractEnvVarNames still
 * catches typical env var references in any file's text.
 */
function detectFileSignal(path: string, content: string): FileVendorSignal | null {
  const manifestDeps = parseManifest(basename(path), content)
  if (manifestDeps.length > 0) return { file: path, manifestDeps }

  const isTrackedSource = TRACKED_SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext))
  const importSpecifiers = isTrackedSource ? extractImportSpecifiers(content).filter((s) => !s.startsWith('.')) : []
  const envVarNames = extractEnvVarNames(content)
  if (importSpecifiers.length === 0 && envVarNames.length === 0) return null
  return { file: path, importSpecifiers, envVarNames }
}

/** 404 (file doesn't exist at this ref — added or removed by the PR) is expected and not an error;
 * anything else propagates so a real outage isn't silently treated as "file doesn't exist". */
async function tryGetRawFileContent(owner: string, repo: string, ref: string, path: string): Promise<string | null> {
  try {
    return await getRawFileContent(owner, repo, ref, path)
  } catch (err) {
    if (err instanceof GithubApiError && err.status === 404) return null
    throw err
  }
}

export interface RunPrGateInput {
  prUrl: string
  policy?: unknown
  /** Optional — omitted entirely from the spec's core {prUrl, policy?} input, but without SOME
   * cost figure the exposure-based policy checks (maxExposureIncreasePerYear) are always trivially
   * $0. Mirrors the same optional-assumption-override pattern /simulate already uses. */
  costPerHourOfDowntime?: number
  currency?: string
}

export async function runPrGate(input: RunPrGateInput): Promise<GateResult> {
  const { owner, repo, prNumber } = parseStrictPrUrl(input.prUrl)
  const policy = validateGatePolicy(input.policy)

  const pr = await getFullPullRequest(owner, repo, prNumber)
  if (!pr.head) {
    throw new Error("This PR's source branch (or fork) has been deleted — there is no head content left to fetch.")
  }
  const head = pr.head

  const cacheKey = `${owner}/${repo}#${head.sha}`
  const cached = gateCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    // The policy can differ between two callers of the same cached PR/headSha (e.g. report-only in
    // the UI vs. a strict policy file in CI) — re-evaluate policy against the cached vendor-delta
    // numbers rather than serving a stale verdict computed under a different policy.
    const policyResult = evaluatePolicy(cached.policyInput, policy)
    if (policyResult.status === cached.result.policy.status && policyResult.violations.length === cached.result.policy.violations.length) {
      return cached.result
    }
    return {
      ...cached.result,
      policy: policyResult,
      markdown: buildGateMarkdown({ ...cached.markdownInput, policy: policyResult }),
    }
  }

  // Baseline: the repo's cached analysis, keyed by repo only (not by branch) — see cache.ts. In
  // practice this means "whichever branch was last scanned", which for a repo whose only prior
  // scan came from the app's normal /analyze-repo flow is the default branch. If nothing is
  // cached, we scan the PR's actual base ref fresh, which becomes the new baseline going forward.
  const repoCacheKey = `${owner}/${repo}`
  const cachedBaseline = await getCachedGraph(repoCacheKey)
  let baselineNote: string
  let baseline
  if (cachedBaseline) {
    baseline = cachedBaseline
    baselineNote = 'a previously cached analysis of this repository (the cache is keyed by repo, not by branch, so this may not be an exact re-scan of this PR\'s base ref)'
  } else {
    const defaultBranch = await getDefaultBranch(owner, repo)
    baseline = await analyzeRepo(`https://github.com/${owner}/${repo}`, pr.base.ref)
    await setCachedGraph(repoCacheKey, baseline)
    baselineNote = pr.base.ref === defaultBranch ? `the repository's default branch (${defaultBranch})` : `the PR's base branch (${pr.base.ref})`
  }

  const allFiles = await getPullRequestFiles(owner, repo, prNumber)
  const prioritized = prioritizeChangedFiles(allFiles)
  const changedFiles = prioritized.slice(0, MAX_CHANGED_FILES)
  const filesCapped = prioritized.length > MAX_CHANGED_FILES

  const perFile = await Promise.all(
    changedFiles.map(async (file) => {
      const [baseContent, headContent] = await Promise.all([
        tryGetRawFileContent(pr.base.owner, pr.base.repo, pr.base.sha, file.filename),
        tryGetRawFileContent(head.owner, head.repo, head.sha, file.filename),
      ])
      return { path: file.filename, baseContent, headContent }
    }),
  )

  const baseSignals: FileVendorSignal[] = []
  const headSignals: FileVendorSignal[] = []
  for (const { path, baseContent, headContent } of perFile) {
    if (baseContent !== null) {
      const signal = detectFileSignal(path, baseContent)
      if (signal) baseSignals.push(signal)
    }
    if (headContent !== null) {
      const signal = detectFileSignal(path, headContent)
      if (signal) headSignals.push(signal)
    }
  }

  const baseFileVendors = resolveVendors({ fileSignals: baseSignals })
  const headFileVendors = resolveVendors({ fileSignals: headSignals })
  const knownBaselineKeys = new Set([...baseline.vendors.map((v) => v.key), ...baseFileVendors.map((v) => v.key)])
  const newVendorEntries = headFileVendors.filter((v) => !knownBaselineKeys.has(v.key))

  const newVendors: GateNewVendor[] = newVendorEntries.map((v) => ({
    key: v.key,
    vendor: v.vendor,
    substrate: v.substrate,
    category: v.tier,
    detectedVia: v.detectedVia,
    files: v.detectedInFiles,
  }))

  // Entrypoints affected: reuse the exact same blast-radius logic as /analyze-pr and the vendor
  // headline card — union of every changed file's upstream+downstream+itself, intersected with
  // this repo's known entrypoints.
  const adjacency = buildAdjacencyMap(baseline.graph.nodes, baseline.graph.edges)
  const entrypointSet = new Set(baseline.entrypoints)
  const affectedEntrypoints = new Set<string>()
  for (const { path } of perFile) {
    if (!adjacency.forward.has(path) && !adjacency.reverse.has(path)) continue
    if (entrypointSet.has(path)) affectedEntrypoints.add(path)
    const radius = getBlastRadius(path, adjacency)
    for (const id of [...radius.upstream, ...radius.downstream]) {
      if (entrypointSet.has(id)) affectedEntrypoints.add(id)
    }
  }

  const afterVendors: Vendor[] = [...baseline.vendors, ...newVendorEntries]

  const assumptions: ExactAvailabilityAssumptions = computeExactAvailability(baseline.vendors, {
    costPerHourOfDowntime: input.costPerHourOfDowntime,
  }).assumptions

  const whatIf = buildWhatIfResult(baseline.vendors, afterVendors, [], assumptions, {
    appliedOverrides: [],
    unresolvedFailovers: [],
  })

  const concentrationBefore = analyzeConcentration(baseline.vendors, baseline.iacSubstrates)
  const concentrationAfter = analyzeConcentration(afterVendors, baseline.iacSubstrates)

  const entrypointsAffectedPct = baseline.entrypoints.length > 0 ? (affectedEntrypoints.size / baseline.entrypoints.length) * 100 : 0

  const policyResult = evaluatePolicy(
    {
      newVendorsCount: newVendors.length,
      mostConcentratedSubstrateShare: concentrationAfter.mostConcentrated?.share ?? 0,
      substrateCount: concentrationAfter.substrateCount,
      entrypointsAffectedPct,
      exposureIncreasePerYear: whatIf.delta.expectedAnnualExposure,
    },
    policy,
  )

  const currency = input.currency ?? 'USD'
  const narrative = await getGateNarrative({
    newVendors,
    mostConcentratedSubstrate: concentrationAfter.mostConcentrated?.substrate ?? null,
    mostConcentratedSharePct: (concentrationAfter.mostConcentrated?.share ?? 0) * 100,
    exposureIncreasePerYear: whatIf.delta.expectedAnnualExposure,
    meaningfulChange: whatIf.meaningfulChange,
  })

  const truncated = baseline.truncated || filesCapped
  const exposure = {
    before: whatIf.baseline.expectedAnnualExposure,
    after: whatIf.mitigated.expectedAnnualExposure,
    delta: whatIf.delta.expectedAnnualExposure,
    currency,
  }
  const markdownInput: Omit<GateMarkdownInput, 'policy'> = {
    pr: { owner, repo, number: prNumber },
    baselineNote,
    newVendors,
    entrypointsAffected: [...affectedEntrypoints],
    totalEntrypoints: baseline.entrypoints.length,
    concentration: { before: concentrationBefore, after: concentrationAfter },
    exposure,
    meaningfulChange: whatIf.meaningfulChange,
    narrative,
    truncated,
  }

  const result: GateResult = {
    pr: { owner, repo, number: prNumber, headSha: head.sha, baseRef: pr.base.ref, baselineNote },
    newVendors,
    entrypointsAffected: [...affectedEntrypoints],
    concentration: { before: concentrationBefore, after: concentrationAfter },
    exposure,
    policy: policyResult,
    truncated,
    markdown: buildGateMarkdown({ ...markdownInput, policy: policyResult }),
  }

  gateCache.set(cacheKey, {
    result,
    policyInput: {
      newVendorsCount: newVendors.length,
      mostConcentratedSubstrateShare: concentrationAfter.mostConcentrated?.share ?? 0,
      substrateCount: concentrationAfter.substrateCount,
      entrypointsAffectedPct,
      exposureIncreasePerYear: whatIf.delta.expectedAnnualExposure,
    },
    markdownInput,
    expiresAt: Date.now() + GATE_CACHE_TTL_MS,
  })
  return result
}
