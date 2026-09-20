import type { GraphData, OwnInfrastructure, UnclassifiedSummary } from '../../src/lib/types'
import { loadAliasScopes, loadWorkspaceAliasEntries, resolveAliasedImport, scopeForFile } from './aliasResolver'
import { extractEnvVarNames, parseEnvFile } from './envScanner'
import { getDefaultBranch, getRawFileContent, getRepoTree, parseRepoUrl } from './github'
import { extractHostnames } from './hostScanner'
import { inferFileType } from './inferFileType'
import { inferEntrypointsForRepo } from './entrypoints'
import { extractImportSpecifiers, resolveRelativeImport } from './importParser'
import { isIacFile, parseIacFile, type IacSubstrateSignal } from './iacParser'
import { KNOWN_MANIFEST_FILENAMES, parseManifest } from './manifestParser'
import { buildOwnInfrastructure } from './ownInfra'
import { findUnclassifiedDependencies } from './unclassifiedDependencies'
import { resolveVendors, type DetectedVendor, type FileVendorSignal } from './vendorResolver'

const TRACKED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']
const EXCLUDED_DIR_SEGMENTS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.next', 'out'])
// Raised from 80: most real repos need far more than 80 files scanned before a genuine vendor
// import shows up, so the live scan was stopping early on ordinary-sized repos, not just huge ones.
// The 25s wall-clock budget (unchanged) is still what actually bounds a request — at CONCURRENCY=12
// raw.githubusercontent.com fetches, 250 files comfortably finishes well inside that budget for a
// typical repo; a repo too big/slow to fit still reports truncated:true (now file_cap OR
// time_budget, whichever hit first) rather than silently claiming completeness either way.
const MAX_FILES = 250
const CONCURRENCY = 12

const ENV_FILENAMES = new Set(['.env.example', '.env.sample', 'env.example'])
// Bounds targeted fetches for vendor-discovery sources (manifests/env/IaC), kept separate from and
// much smaller than MAX_FILES — these are a handful of well-known filenames, not the whole tree.
const MAX_DISCOVERY_FILES_PER_KIND = 20

// API Gateway's HTTP API integration has a hard 30s timeout — this leaves headroom for the
// response to actually be sent. Any run that hits this budget reports truncated:true instead of
// letting the platform kill the request with no useful response at all.
const DEFAULT_SCAN_BUDGET_MS = 25_000
const ENTRY_FILENAME = /^(index|main|app)\.(tsx?|jsx?)$/i
const CONFIG_FILENAME = /config|setup/i

export interface RepoSource {
  /** All file paths in the repo (blobs only, relative to repo root). */
  listFiles(): Promise<string[]>
  readFile(path: string): Promise<string>
}

class GithubRepoSource implements RepoSource {
  private owner: string
  private repo: string
  private ref: string

  constructor(owner: string, repo: string, ref: string) {
    this.owner = owner
    this.repo = repo
    this.ref = ref
  }

  async listFiles(): Promise<string[]> {
    const tree = await getRepoTree(this.owner, this.repo, this.ref)
    return tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path)
  }

  async readFile(path: string): Promise<string> {
    return getRawFileContent(this.owner, this.repo, this.ref, path)
  }
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function isTrackedFile(path: string): boolean {
  if (!TRACKED_EXTENSIONS.some((ext) => path.endsWith(ext))) return false
  return !path.split('/').some((segment) => EXCLUDED_DIR_SEGMENTS.has(segment))
}

/** `deadline` (epoch ms) stops dispatching new work past it; already-started calls still finish.
 * Items never started or interrupted are left `undefined` in the result — never partially applied. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  deadline = Infinity,
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      if (Date.now() > deadline) return
      const index = cursor++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Files most representative of a repo's shape when time runs out before everything can be fetched:
 * entrypoints and config files first, then shallow (repo-root-ish) files, then everything else. */
function priorityScore(path: string): number {
  const base = basename(path)
  if (ENTRY_FILENAME.test(base)) return 0
  if (CONFIG_FILENAME.test(base)) return 1
  if (path.split('/').length <= 2) return 2
  return 3
}

function prioritizeFiles(paths: string[]): string[] {
  return [...paths].sort((a, b) => priorityScore(a) - priorityScore(b))
}

/** A specifier "looks internal" — and so belongs in the data-quality badge's denominator — if
 * it's a relative import, or if it matches a known alias prefix (even when resolution ultimately
 * fails, e.g. a genuinely broken "@/nonexistent/file"). A bare "react"-style specifier with no
 * matching alias is presumed external and never counted as an unresolved internal import. */
function looksInternal(specifier: string, aliasEntries: Array<{ prefix: string }>): boolean {
  if (specifier.startsWith('.')) return true
  return aliasEntries.some((e) => specifier === e.prefix || specifier.startsWith(e.prefix))
}

interface DiscoveryFile {
  path: string
  content: string
}

interface DiscoverySources {
  manifestFiles: DiscoveryFile[]
  envFiles: DiscoveryFile[]
  iacFiles: DiscoveryFile[]
}

/**
 * Fetches a small, bounded set of manifest/.env/IaC files for vendor discovery — deliberately
 * separate from and much cheaper than the tracked-file walk above (a handful of well-known
 * filenames, not every file in the repo). Never throws; unreadable files are silently skipped.
 */
async function loadVendorDiscoverySources(
  source: RepoSource,
  allPaths: string[],
  deadline: number,
): Promise<DiscoverySources> {
  const manifestPaths = allPaths
    .filter((path) => KNOWN_MANIFEST_FILENAMES.includes(basename(path)))
    .slice(0, MAX_DISCOVERY_FILES_PER_KIND)
  const envPaths = allPaths.filter((path) => ENV_FILENAMES.has(basename(path))).slice(0, MAX_DISCOVERY_FILES_PER_KIND)
  const iacPaths = allPaths.filter(isIacFile).slice(0, MAX_DISCOVERY_FILES_PER_KIND)

  async function readAll(paths: string[]): Promise<DiscoveryFile[]> {
    const results = await mapWithConcurrency(
      paths,
      CONCURRENCY,
      async (path): Promise<DiscoveryFile | null> => {
        try {
          return { path, content: await source.readFile(path) }
        } catch {
          return null
        }
      },
      deadline,
    )
    return results.filter((r): r is DiscoveryFile => r != null)
  }

  const [manifestFiles, envFiles, iacFiles] = await Promise.all([
    readAll(manifestPaths),
    readAll(envPaths),
    readAll(iacPaths),
  ])
  return { manifestFiles, envFiles, iacFiles }
}

export interface ImportResolutionStats {
  /** Import specifiers that looked internal (relative, or alias-shaped) — the denominator. */
  total: number
  /** Of those, how many actually resolved to a known file. */
  resolved: number
}

export interface BuildGraphResult {
  graph: GraphData
  truncated: boolean
  /** Why `truncated` is true — 'file_cap' when the tracked-file list exceeded the file cap,
   * 'time_budget' when the wall-clock scan budget ran out first. Undefined when not truncated. */
  truncatedReason?: 'file_cap' | 'time_budget'
  filesScanned: number
  /** Files this run actually SET OUT to fetch — the tracked-file list after the file cap and
   * priority ordering (== filesScanned when nothing failed mid-fetch). The right denominator for
   * "how reliably did this run complete", independent of whether the whole repo was covered (that's
   * `truncated`/`truncatedReason`) — a per-file fetch failure or rate-limit mid-scan shows up here
   * as filesScanned < filesSelected even when the cap/budget weren't the limiting factor. */
  filesSelected: number
  /** Third-party vendors detected from imports, env vars, and manifests — the app's blast-radius layer. */
  vendors: DetectedVendor[]
  /** Cloud-provider signals found in IaC files (Terraform, serverless.yml, vercel.json). */
  iacSubstrates: IacSubstrateSignal[]
  /** Framework-aware entrypoints (Next.js/Vite/package.json main-bin) when the repo follows one of
   * those conventions; [] otherwise — callers should fall back to a structural heuristic then. */
  entrypoints: string[]
  /** Powers the "X% of internal imports resolved" data-quality badge. */
  importResolution: ImportResolutionStats
  /** External dependencies found but NOT in the curated vendor knowledge base — see
   * unclassifiedDependencies.ts. Deliberately separate from `vendors`: never merged into vendor
   * counts, substrates, or availability math anywhere downstream. */
  unclassified: UnclassifiedSummary
  /** Static IaC resilience linter over the repo's OWN infrastructure — display only. Never merged
   * into `vendors`, concentration, the correlated-failure engine, or a snapshot's vendor list. */
  own: OwnInfrastructure
}

export interface BuildGraphOptions {
  /** Wall-clock budget in ms from the start of the scan. Defaults to 25s (API Gateway's HTTP API
   * integration has a hard 30s ceiling) — running past it reports truncated:true instead of the
   * platform killing the request with no response at all. The LIVE API never overrides this. */
  scanBudgetMs?: number
  /** Cap on tracked files fetched. Defaults to 80 (MAX_FILES) — the live API's own budget already
   * makes a much higher cap moot there; this exists so a local, offline tool (scripts/snapshot-
   * repo.ts) can ask for a fuller scan of a big repo without touching the live API's default. */
  maxFiles?: number
  /** Used only to exclude the repo's own domain from the unclassified-hosts list — a caller that
   * omits these just gets a slightly less complete filter there, never a crash. */
  owner?: string
  repo?: string
}

/** Builds a {nodes, edges} import graph plus vendor/substrate signals from any RepoSource. */
export async function buildGraphFromSource(
  source: RepoSource,
  options: BuildGraphOptions = {},
): Promise<BuildGraphResult> {
  const deadline = Date.now() + (options.scanBudgetMs ?? DEFAULT_SCAN_BUDGET_MS)
  const maxFiles = options.maxFiles ?? MAX_FILES

  const allPaths = await source.listFiles()
  const trackedPaths = allPaths.filter(isTrackedFile)
  const countCapped = trackedPaths.length > maxFiles

  // Resolution uses the FULL tracked-file list, not just filesToFetch — otherwise a file
  // we don't fetch content for (because of the cap) can still never be a valid edge target,
  // silently dropping real edges into every file past the cap.
  const knownFilePaths = new Set(trackedPaths)
  // Per-directory alias scopes (nearest tsconfig/jsconfig ancestor wins) plus workspace package
  // names, which apply everywhere regardless of which tsconfig scope a file falls under.
  const [aliasScopes, workspaceEntries] = await Promise.all([
    loadAliasScopes(source, allPaths),
    loadWorkspaceAliasEntries(source, allPaths),
  ])

  // Vendor-discovery sources (manifests/env/IaC) run to completion FIRST, ahead of the file-import
  // walk — they're small, bounded (<=60 files total), and carry the vendor-detection signal the
  // whole product depends on. If the budget runs out, the file graph is what gets thinner.
  const discoverySources = await loadVendorDiscoverySources(source, allPaths, deadline)

  const filesToFetch = prioritizeFiles(trackedPaths).slice(0, maxFiles)
  const remainingBudget = Math.max(0, deadline - Date.now())
  const fetchDeadline = Date.now() + remainingBudget
  const contents = await mapWithConcurrency(
    filesToFetch,
    CONCURRENCY,
    (path) => source.readFile(path),
    fetchDeadline,
  )

  const edgeKeys = new Set<string>()
  const edges: GraphData['edges'] = []
  const nodeIds = new Set<string>()
  // Bare (non-relative) specifiers never become file-graph edges/nodes — the file graph stays
  // exactly what it was — but they're the primary vendor-discovery signal, so we keep them here.
  const fileSignals: FileVendorSignal[] = []
  let fetchedCount = 0
  let internalImportsTotal = 0
  let internalImportsResolved = 0

  filesToFetch.forEach((path, i) => {
    const content = contents[i]
    if (content === undefined) return // skipped — the scan budget ran out before reaching it
    fetchedCount++
    nodeIds.add(path)

    const specifiers = extractImportSpecifiers(content)
    const bareSpecifiers: string[] = []
    const scope = scopeForFile(path, aliasScopes)
    const aliasEntriesForFile = scope ? [...scope.entries, ...workspaceEntries] : workspaceEntries

    for (const specifier of specifiers) {
      const resolved =
        resolveRelativeImport(specifier, path, knownFilePaths) ??
        (scope ? resolveAliasedImport(specifier, scope.entries, knownFilePaths) : null) ??
        resolveAliasedImport(specifier, workspaceEntries, knownFilePaths)

      if (looksInternal(specifier, aliasEntriesForFile)) {
        internalImportsTotal++
        if (resolved) internalImportsResolved++
      }

      if (resolved && resolved !== path) {
        const key = `${path}|${resolved}`
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key)
          edges.push({ from: path, to: resolved })
          nodeIds.add(resolved)
        }
        continue
      }

      // Doesn't resolve to a known file — a real (non-relative) vendor/package specifier,
      // not a broken relative import — the primary signal for vendor discovery below.
      if (!specifier.startsWith('.')) bareSpecifiers.push(specifier)
    }

    const envVarNames = extractEnvVarNames(content)
    const hostnames = extractHostnames(content)
    if (bareSpecifiers.length > 0 || envVarNames.length > 0 || hostnames.length > 0) {
      fileSignals.push({ file: path, importSpecifiers: bareSpecifiers, envVarNames, hostnames })
    }
  })

  for (const { path, content } of discoverySources.manifestFiles) {
    const manifestDeps = parseManifest(path, content)
    if (manifestDeps.length > 0) fileSignals.push({ file: path, manifestDeps })
  }
  for (const { path, content } of discoverySources.envFiles) {
    const envVarNames = parseEnvFile(content)
    if (envVarNames.length > 0) fileSignals.push({ file: path, envVarNames })
  }

  const vendors = resolveVendors({ fileSignals })
  const iacSubstrates = discoverySources.iacFiles.flatMap(({ path, content }) => parseIacFile(path, content))
  const unclassified = findUnclassifiedDependencies(fileSignals, options.owner ?? '', options.repo ?? '')
  const own = buildOwnInfrastructure(discoverySources.iacFiles)

  const nodes = [...nodeIds].map((path) => ({ id: path, label: path, type: inferFileType(path) }))
  const budgetCapped = fetchedCount < filesToFetch.length
  const entrypoints = inferEntrypointsForRepo([...nodeIds], discoverySources.manifestFiles, knownFilePaths)
  // File-cap takes precedence when both are true — it's usually the more fundamental reason (a
  // budget-capped-only run would have kept going past filesToFetch.length if maxFiles allowed it).
  const truncatedReason: BuildGraphResult['truncatedReason'] = countCapped ? 'file_cap' : budgetCapped ? 'time_budget' : undefined

  return {
    graph: { nodes, edges },
    truncated: countCapped || budgetCapped,
    truncatedReason,
    filesScanned: fetchedCount,
    filesSelected: filesToFetch.length,
    vendors,
    iacSubstrates,
    entrypoints,
    unclassified,
    own,
    importResolution: { total: internalImportsTotal, resolved: internalImportsResolved },
  }
}

export interface AnalyzeRepoResult extends BuildGraphResult {
  owner: string
  repo: string
  branch: string
}

export async function analyzeRepo(
  repoUrl: string,
  branch?: string,
  options: BuildGraphOptions = {},
): Promise<AnalyzeRepoResult> {
  const { owner, repo } = parseRepoUrl(repoUrl)
  const ref = branch ?? (await getDefaultBranch(owner, repo))
  const source = new GithubRepoSource(owner, repo, ref)
  const result = await buildGraphFromSource(source, { ...options, owner, repo })
  return { ...result, owner, repo, branch: ref }
}
