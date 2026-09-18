import { resolveToKnownPath } from './importParser'

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

function joinPosix(...parts: string[]): string {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/$/, '')
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
    const candidate = rest ? `${target}/${rest}`.replace(/\/{2,}/g, '/') : target
    const resolved = resolveToKnownPath(candidate, knownFilePaths)
    if (resolved) return resolved
  }
  return null
}
