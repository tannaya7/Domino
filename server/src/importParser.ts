const IMPORT_FROM = /import\s+(?:type\s+)?(?:[\w*{}\s,]+?\s+from\s+)?['"]([^'"]+)['"]/g
const EXPORT_FROM = /export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g
const REQUIRE_CALL = /require\(\s*['"]([^'"]+)['"]\s*\)/g
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/g

/**
 * Extracts raw module specifiers from ES `import`/`export ... from`/dynamic `import()`/
 * CommonJS `require()` statements — including barrel-file re-exports like
 * `export { x } from './y'` and `export * from './y'`.
 */
export function extractImportSpecifiers(source: string): string[] {
  const specifiers = new Set<string>()
  for (const pattern of [IMPORT_FROM, EXPORT_FROM, REQUIRE_CALL, DYNAMIC_IMPORT]) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source))) {
      specifiers.add(match[1])
    }
  }
  return [...specifiers]
}

const CANDIDATE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx']
const CANDIDATE_INDEX_SUFFIXES = [
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
]

export function normalizePath(path: string): string {
  const parts = path.split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

/**
 * Resolves a (possibly extension-less) path to a real file in the repo by trying common
 * extensions and index-file suffixes. Shared by relative-import and alias resolution.
 */
export function resolveToKnownPath(path: string, knownFilePaths: Set<string>): string | null {
  const base = normalizePath(path)
  for (const ext of CANDIDATE_EXTENSIONS) {
    if (knownFilePaths.has(base + ext)) return base + ext
  }
  for (const suffix of CANDIDATE_INDEX_SUFFIXES) {
    // At repo root, base is '' — the suffix's leading '/' would otherwise produce
    // "/index.js" instead of "index.js", which never matches a real (root) file path.
    const candidate = base ? base + suffix : suffix.slice(1)
    if (knownFilePaths.has(candidate)) return candidate
  }
  return null
}

/**
 * Resolves a relative import specifier (e.g. "./foo") to a real file path in the repo.
 * Returns null for bare/package specifiers (e.g. "react") or unresolvable paths.
 */
export function resolveRelativeImport(
  specifier: string,
  fromFilePath: string,
  knownFilePaths: Set<string>,
): string | null {
  if (!specifier.startsWith('.')) return null

  const fromDir = fromFilePath.split('/').slice(0, -1).join('/')
  const joined = fromDir ? `${fromDir}/${specifier}` : specifier
  return resolveToKnownPath(joined, knownFilePaths)
}
