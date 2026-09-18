import { normalizePath, resolveToKnownPath } from './importParser'

export interface AliasEntry {
  /** Specifier prefix, e.g. "@/" or "#ansi-styles". */
  prefix: string
  /** Repo-root-relative path prefix it maps to, e.g. "src/". */
  target: string
}

/** Strips // and block comments from a JSONC string (tsconfig.json allows both). */
function stripJsonComments(source: string): string {
  let result = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    const next = source[i + 1]
    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false
        result += ch
      }
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inString) {
      result += ch
      if (ch === '\\') {
        result += next
        i++
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      result += ch
    } else if (ch === '/' && next === '/') {
      inLineComment = true
      i++
    } else if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
    } else {
      result += ch
    }
  }
  return result
}

/** Joins path segments and normalizes the result (collapses "." and ".." segments anywhere in
 * the path, not just a leading "./" — needed once paths get built from multiple joined parts,
 * e.g. "frontend" + "." + "src" -> "frontend/src", not "frontend/./src"). */
function joinPosix(...parts: string[]): string {
  return normalizePath(parts.join('/'))
}

/** Parses `compilerOptions.baseUrl`/`paths` from a tsconfig.json (or jsconfig.json) source string. */
export function parseTsconfigPaths(tsconfigSource: string): AliasEntry[] {
  try {
    const json = JSON.parse(stripJsonComments(tsconfigSource))
    const baseUrl: string = json?.compilerOptions?.baseUrl ?? '.'
    const paths: Record<string, string[]> = json?.compilerOptions?.paths ?? {}

    const entries: AliasEntry[] = []
    for (const [key, values] of Object.entries(paths)) {
      const value = Array.isArray(values) ? values[0] : values
      if (typeof value !== 'string') continue
      entries.push({
        prefix: key.replace(/\*$/, ''),
        target: joinPosix(baseUrl, value.replace(/\*$/, '')),
      })
    }
    return entries
  } catch {
    return []
  }
}

function resolveConditionValue(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const candidate = obj.default ?? obj.import ?? obj.node ?? Object.values(obj)[0]
    return typeof candidate === 'string' ? candidate : null
  }
  return null
}

/** Parses Node's `imports` subpath-import map (e.g. `"#foo": "./src/foo.js"`) from a package.json source string. */
export function parsePackageJsonImports(packageJsonSource: string): AliasEntry[] {
  try {
    const json = JSON.parse(packageJsonSource)
    const imports: Record<string, unknown> = json?.imports ?? {}

    const entries: AliasEntry[] = []
    for (const [key, value] of Object.entries(imports)) {
      const resolved = resolveConditionValue(value)
      if (!resolved) continue
      entries.push({
        prefix: key.replace(/\*$/, ''),
        target: joinPosix(resolved.replace(/\*$/, '')),
      })
    }
    return entries
  } catch {
    return []
  }
}

/**
 * Resolves a non-relative specifier (TS path alias or Node subpath import, e.g. "@/utils/x"
 * or "#ansi-styles") against known alias mappings. Longest-prefix-match wins.
 */
export function resolveAliasedImport(
  specifier: string,
  aliases: AliasEntry[],
  knownFilePaths: Set<string>,
): string | null {
  const candidates = aliases
    .filter((a) => specifier === a.prefix || specifier.startsWith(a.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)

  for (const { prefix, target } of candidates) {
    const rest = specifier.slice(prefix.length)
    // target is '' when an alias resolves to the repo root itself (e.g. a config with no baseUrl
    // whose paths pattern is "@/*": ["./*"]) — repo-relative paths never carry a leading slash, so
    // that case must produce `rest` alone, not `/${rest}`.
    const candidate = rest ? (target ? `${target}/${rest}` : rest).replace(/\/{2,}/g, '/') : target
    const resolved = resolveToKnownPath(candidate, knownFilePaths)
    if (resolved) return resolved
  }
  return null
}

// -------------------------------------------------------------------------------------------
// Nested-config support: a real repo's tsconfig.json is often NOT at the repo root (e.g. a
// Next.js app inside frontend/ in a polyglot repo) — parseTsconfigPaths above assumes a single,
// root-level config with an implicit baseUrl of '.' (repo root), which is silently wrong for a
// nested one. Everything below finds every tsconfig/jsconfig in the repo, follows relative
// `extends` chains, and resolves paths relative to the CORRECT directory: the directory of
// whichever config in the chain actually declared baseUrl, or the leaf config's own directory
// when nothing in the chain sets baseUrl at all (matching plain tsc behavior).
// -------------------------------------------------------------------------------------------

/** Parses JSONC (comments, per stripJsonComments above) plus trailing commas — tsconfig.json
 * tolerates both. The trailing-comma pass runs on already-comment-stripped text; it can only ever
 * over-match a literal ",}" / ",]" sequence sitting inside a string value, which is exceedingly
 * rare in a tsconfig and never worse than failing to parse the file at all. */
export function parseJsonc(source: string): unknown | null {
  try {
    const withoutComments = stripJsonComments(source)
    const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, '$1')
    return JSON.parse(withoutTrailingCommas)
  } catch {
    return null
  }
}

export interface ConfigReader {
  readFile(path: string): Promise<string>
}

interface RawTsconfig {
  extends?: string
  compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> }
}

function dirnameOf(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

export interface ResolvedTsconfig {
  baseUrl?: string
  /** Directory (repo-root-relative) of whichever config in the extends chain declared baseUrl —
   * baseUrl is resolved relative to ITS file, not necessarily the leaf config's directory. */
  baseUrlDir?: string
  paths?: Record<string, string[]>
}

/**
 * Loads one tsconfig/jsconfig, following relative `extends` targets only (a bare package name,
 * e.g. `"extends": "@tsconfig/node20"`, is out of scope — reading it would mean resolving into
 * node_modules, which this stays deliberately clear of). Cycle-safe and depth-capped; stops and
 * returns whatever was accumulated so far if any file in the chain is missing or unparsable.
 */
export async function loadResolvedTsconfig(
  configPath: string,
  reader: ConfigReader,
  maxDepth = 8,
): Promise<ResolvedTsconfig | null> {
  const chain: Array<{ dir: string; raw: RawTsconfig }> = []
  const seen = new Set<string>()
  let currentPath: string | undefined = configPath

  for (let depth = 0; currentPath && depth < maxDepth; depth++) {
    if (seen.has(currentPath)) break
    seen.add(currentPath)

    let source: string
    try {
      source = await reader.readFile(currentPath)
    } catch {
      break
    }
    const raw = parseJsonc(source) as RawTsconfig | null
    if (!raw) break
    chain.push({ dir: dirnameOf(currentPath), raw })

    if (typeof raw.extends === 'string' && raw.extends.startsWith('.')) {
      const joined = normalizePath(`${dirnameOf(currentPath)}/${raw.extends}`)
      currentPath = /\.json$/.test(joined) ? joined : `${joined}.json`
    } else {
      currentPath = undefined
    }
  }

  if (chain.length === 0) return null

  const result: ResolvedTsconfig = {}
  for (const { dir, raw } of [...chain].reverse()) {
    if (raw.compilerOptions?.baseUrl !== undefined) {
      result.baseUrl = raw.compilerOptions.baseUrl
      result.baseUrlDir = dir
    }
    if (raw.compilerOptions?.paths !== undefined) {
      result.paths = raw.compilerOptions.paths
    }
  }
  return result
}

/** Turns a resolved config's `paths` into AliasEntry objects with repo-root-relative targets.
 * Multiple targets for the same pattern become multiple entries sharing a prefix —
 * resolveAliasedImport already tries same-prefix entries in array order, so no changes needed
 * there for "wildcards, multiple targets" support. */
export function buildAliasEntriesFromPaths(leafConfigDir: string, resolved: ResolvedTsconfig): AliasEntry[] {
  if (!resolved.paths) return []
  const targetBaseDir =
    resolved.baseUrl !== undefined && resolved.baseUrlDir !== undefined
      ? joinPosix(resolved.baseUrlDir, resolved.baseUrl)
      : leafConfigDir

  const entries: AliasEntry[] = []
  for (const [pattern, targets] of Object.entries(resolved.paths)) {
    const prefix = pattern.replace(/\*$/, '')
    for (const targetPattern of targets) {
      entries.push({ prefix, target: joinPosix(targetBaseDir, targetPattern.replace(/\*$/, '')) })
    }
  }
  return entries
}

export interface AliasScope {
  /** Repo-root-relative directory this scope applies to ('' for the repo root). */
  configDir: string
  entries: AliasEntry[]
}

/**
 * Finds every tsconfig.json/jsconfig.json AND package.json (for Node subpath `imports`) in the
 * repo and builds one AliasScope per directory that declares aliases. Malformed/unreadable
 * configs are skipped individually — one bad config never blocks every other directory's aliases.
 */
// Defensive bound on how many config files a single scan will read — a normal repo has a handful;
// this only matters for a pathological one, matching the same-spirit caps used elsewhere (e.g.
// repoParser.ts's MAX_DISCOVERY_FILES_PER_KIND).
const MAX_CONFIG_FILES = 30

export async function loadAliasScopes(reader: ConfigReader, allPaths: string[]): Promise<AliasScope[]> {
  const scopes = new Map<string, AliasEntry[]>()

  function addEntries(configDir: string, entries: AliasEntry[]): void {
    if (entries.length === 0) return
    scopes.set(configDir, [...(scopes.get(configDir) ?? []), ...entries])
  }

  const tsconfigPaths = allPaths.filter((p) => /(^|\/)(tsconfig|jsconfig)\.json$/.test(p)).slice(0, MAX_CONFIG_FILES)
  for (const configPath of tsconfigPaths) {
    try {
      const resolved = await loadResolvedTsconfig(configPath, reader)
      if (resolved) addEntries(dirnameOf(configPath), buildAliasEntriesFromPaths(dirnameOf(configPath), resolved))
    } catch {
      // Skip this one config; every other directory's aliases still load normally.
    }
  }

  const packageJsonPaths = allPaths
    .filter((p) => p === 'package.json' || p.endsWith('/package.json'))
    .slice(0, MAX_CONFIG_FILES)
  for (const pkgPath of packageJsonPaths) {
    try {
      const configDir = dirnameOf(pkgPath)
      const entries = parsePackageJsonImports(await reader.readFile(pkgPath)).map((e) => ({
        prefix: e.prefix,
        target: joinPosix(configDir, e.target),
      }))
      addEntries(configDir, entries)
    } catch {
      // ignore
    }
  }

  return [...scopes.entries()].map(([configDir, entries]) => ({ configDir, entries }))
}

/** Nearest-ancestor lookup: the scope whose configDir is the deepest directory still containing filePath. */
export function scopeForFile(filePath: string, scopes: AliasScope[]): AliasScope | null {
  let best: AliasScope | null = null
  for (const scope of scopes) {
    const withinScope = scope.configDir === '' || filePath.startsWith(`${scope.configDir}/`)
    if (!withinScope) continue
    if (!best || scope.configDir.length > best.configDir.length) best = scope
  }
  return best
}

// -------------------------------------------------------------------------------------------
// Monorepo workspaces: `@scope/pkg` should resolve to a local package's directory (an internal
// file-graph edge), not fall through to vendor discovery as if it were a real external dependency.
// -------------------------------------------------------------------------------------------

/** Parses only the `packages:` list from a pnpm-workspace.yaml — not a general YAML parser, just
 * this one shape, to avoid a YAML dependency for a single well-known field. */
function parsePnpmWorkspaceGlobs(yamlSource: string): string[] {
  const globs: string[] = []
  let inPackagesList = false
  for (const rawLine of yamlSource.split('\n')) {
    const line = rawLine.replace(/#.*/, '')
    if (/^\s*packages\s*:\s*$/.test(line)) {
      inPackagesList = true
      continue
    }
    if (!inPackagesList) continue
    const item = /^\s*-\s*['"]?([^'"]+?)['"]?\s*$/.exec(line)
    if (item) {
      globs.push(item[1])
      continue
    }
    if (line.trim().length > 0) inPackagesList = false // dedent to a new top-level key ends the list
  }
  return globs
}

/** Minimal glob support: only the extremely common single-level "dir/*" form. A package.json's
 * directory matches if its immediate parent equals the glob's prefix. */
function matchWorkspaceMemberDirs(globs: string[], allPaths: string[]): string[] {
  const packageJsonDirs = allPaths
    .filter((p) => p !== 'package.json' && p.endsWith('/package.json'))
    .map((p) => p.slice(0, -'/package.json'.length))

  const dirs = new Set<string>()
  for (const glob of globs) {
    if (!glob.endsWith('/*')) continue
    const parentPrefix = glob.slice(0, -2)
    for (const dir of packageJsonDirs) {
      const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''
      if (parent === parentPrefix) dirs.add(dir)
    }
  }
  return [...dirs]
}

/**
 * Resolves `@scope/pkg` (and its subpaths) to the matching local workspace package's directory,
 * reading `workspaces` from the root package.json (npm/yarn) and/or pnpm-workspace.yaml. Returns
 * [] when the repo isn't a workspace at all — the common case, and a no-op in that case.
 */
export async function loadWorkspaceAliasEntries(reader: ConfigReader, allPaths: string[]): Promise<AliasEntry[]> {
  const globs: string[] = []

  if (allPaths.includes('package.json')) {
    try {
      const pkg = JSON.parse(await reader.readFile('package.json')) as {
        workspaces?: string[] | { packages?: string[] }
      }
      const list = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages
      if (Array.isArray(list)) globs.push(...list)
    } catch {
      // ignore
    }
  }
  if (allPaths.includes('pnpm-workspace.yaml')) {
    try {
      globs.push(...parsePnpmWorkspaceGlobs(await reader.readFile('pnpm-workspace.yaml')))
    } catch {
      // ignore
    }
  }
  if (globs.length === 0) return []

  const entries: AliasEntry[] = []
  for (const dir of matchWorkspaceMemberDirs(globs, allPaths)) {
    try {
      const pkg = JSON.parse(await reader.readFile(`${dir}/package.json`)) as { name?: string }
      if (typeof pkg.name === 'string' && pkg.name.length > 0) entries.push({ prefix: pkg.name, target: dir })
    } catch {
      // ignore
    }
  }
  return entries
}
