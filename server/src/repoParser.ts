import type { GraphData } from '../../src/lib/types'
import { parsePackageJsonImports, parseTsconfigPaths, resolveAliasedImport, type AliasEntry } from './aliasResolver'
import { getDefaultBranch, getRawFileContent, getRepoTree, parseRepoUrl } from './github'
import { inferFileType } from './inferFileType'
import { extractImportSpecifiers, resolveRelativeImport } from './importParser'

const TRACKED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']
const EXCLUDED_DIR_SEGMENTS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage'])
const MAX_FILES = 80
const CONCURRENCY = 8

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

function isTrackedFile(path: string): boolean {
  if (!TRACKED_EXTENSIONS.some((ext) => path.endsWith(ext))) return false
  return !path.split('/').some((segment) => EXCLUDED_DIR_SEGMENTS.has(segment))
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Loads TS path aliases and Node subpath imports from the repo root, if present. Never throws. */
async function loadAliasEntries(source: RepoSource, allPaths: string[]): Promise<AliasEntry[]> {
  const entries: AliasEntry[] = []

  for (const configPath of ['tsconfig.json', 'jsconfig.json']) {
    if (!allPaths.includes(configPath)) continue
    try {
      entries.push(...parseTsconfigPaths(await source.readFile(configPath)))
    } catch {
      // Missing or unreadable config — proceed without these aliases.
    }
    break
  }

  if (allPaths.includes('package.json')) {
    try {
      entries.push(...parsePackageJsonImports(await source.readFile('package.json')))
    } catch {
      // Missing or unreadable package.json — proceed without subpath imports.
    }
  }

  return entries
}

export interface BuildGraphResult {
  graph: GraphData
  truncated: boolean
  filesScanned: number
}

/** Builds a {nodes, edges} import graph from any RepoSource — used for both live GitHub repos and tests. */
export async function buildGraphFromSource(source: RepoSource): Promise<BuildGraphResult> {
  const allPaths = await source.listFiles()
  const trackedPaths = allPaths.filter(isTrackedFile)
  const truncated = trackedPaths.length > MAX_FILES
  const filesToFetch = trackedPaths.slice(0, MAX_FILES)

  // Resolution uses the FULL tracked-file list, not just filesToFetch — otherwise a file
  // we don't fetch content for (because of the cap) can still never be a valid edge target,
  // silently dropping real edges into every file past the cap.
  const knownFilePaths = new Set(trackedPaths)
  const aliasEntries = await loadAliasEntries(source, allPaths)

  const contents = await mapWithConcurrency(filesToFetch, CONCURRENCY, (path) => source.readFile(path))

  const edgeKeys = new Set<string>()
  const edges: GraphData['edges'] = []
  const nodeIds = new Set(filesToFetch)

  filesToFetch.forEach((path, i) => {
    const specifiers = extractImportSpecifiers(contents[i])
    for (const specifier of specifiers) {
      const resolved =
        resolveRelativeImport(specifier, path, knownFilePaths) ??
        resolveAliasedImport(specifier, aliasEntries, knownFilePaths)
      if (!resolved || resolved === path) continue

      const key = `${path}|${resolved}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      edges.push({ from: path, to: resolved })
      nodeIds.add(resolved)
    }
  })

  const nodes = [...nodeIds].map((path) => ({ id: path, label: path, type: inferFileType(path) }))

  return { graph: { nodes, edges }, truncated, filesScanned: filesToFetch.length }
}

export interface AnalyzeRepoResult extends BuildGraphResult {
  owner: string
  repo: string
  branch: string
}

export async function analyzeRepo(repoUrl: string, branch?: string): Promise<AnalyzeRepoResult> {
  const { owner, repo } = parseRepoUrl(repoUrl)
  const ref = branch ?? (await getDefaultBranch(owner, repo))
  const source = new GithubRepoSource(owner, repo, ref)
  const result = await buildGraphFromSource(source)
  return { ...result, owner, repo, branch: ref }
}
