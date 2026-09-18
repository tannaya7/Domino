/**
 * Diagnoses the file-import graph's resolution rate on a real repo, using the SAME resolver
 * primitives repoParser.ts uses today — so this reproduces production behavior exactly, not an
 * approximation of it. Reports total imports found, how many resolved, and why the rest didn't,
 * plus the resulting node/edge counts (cross-checked against the real analyzeRepo() pipeline).
 *
 * Usage: tsx scripts/diagnose-imports.ts <github-repo-url>
 */
import { parsePackageJsonImports, parseTsconfigPaths, resolveAliasedImport, type AliasEntry } from '../server/src/aliasResolver'
import { analyzeRepo } from '../server/src/repoParser'
import { getDefaultBranch, getRawFileContent, getRepoTree, parseRepoUrl } from '../server/src/github'
import { extractImportSpecifiers, resolveRelativeImport } from '../server/src/importParser'
import { parsePackageJsonDependencies } from '../server/src/manifestParser'

const TRACKED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']
const EXCLUDED_DIR_SEGMENTS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.next', 'out'])
const MAX_FILES = 80

function isTrackedFile(path: string): boolean {
  if (!TRACKED_EXTENSIONS.some((ext) => path.endsWith(ext))) return false
  return !path.split('/').some((segment) => EXCLUDED_DIR_SEGMENTS.has(segment))
}

type UnresolvedReason = 'missing-relative-file' | 'unresolved-alias-like' | 'external-package' | 'possibly-unsupported-syntax'

async function main() {
  const repoUrl = process.argv[2]
  if (!repoUrl) {
    console.error('Usage: tsx scripts/diagnose-imports.ts <github-repo-url>')
    process.exit(1)
  }

  const { owner, repo } = parseRepoUrl(repoUrl)
  const branch = await getDefaultBranch(owner, repo)
  console.log(`Repo: ${owner}/${repo} @ ${branch}`)

  const tree = await getRepoTree(owner, repo, branch)
  const allPaths = tree.filter((e) => e.type === 'blob').map((e) => e.path)
  const trackedPaths = allPaths.filter(isTrackedFile)
  console.log(`Total blobs: ${allPaths.length}, tracked (.ts/.tsx/.js/.jsx): ${trackedPaths.length}`)

  // --- Where do tsconfig/jsconfig/package.json actually live in this repo? ---
  const tsconfigs = allPaths.filter((p) => /(^|\/)(tsconfig|jsconfig)\.json$/.test(p))
  const packageJsons = allPaths.filter((p) => /(^|\/)package\.json$/.test(p))
  console.log(`\ntsconfig/jsconfig.json found at: ${tsconfigs.length ? tsconfigs.join(', ') : '(none)'}`)
  console.log(`package.json found at: ${packageJsons.length ? packageJsons.join(', ') : '(none)'}`)

  // --- Reproduce TODAY's alias loading exactly: root-only, matching repoParser.ts's current loadAliasEntries. ---
  const aliasEntries: AliasEntry[] = []
  for (const configPath of ['tsconfig.json', 'jsconfig.json']) {
    if (!allPaths.includes(configPath)) continue
    try {
      aliasEntries.push(...parseTsconfigPaths(await getRawFileContent(owner, repo, branch, configPath)))
    } catch {
      /* ignore */
    }
    break
  }
  if (allPaths.includes('package.json')) {
    try {
      aliasEntries.push(...parsePackageJsonImports(await getRawFileContent(owner, repo, branch, 'package.json')))
    } catch {
      /* ignore */
    }
  }
  console.log(`\nAlias entries loaded (root-only, today's behavior): ${aliasEntries.length}`)
  for (const a of aliasEntries) console.log(`  ${a.prefix} -> ${a.target}`)

  // Known npm dependency names (scanned from EVERY package.json in the repo, for classification only).
  const npmPackageNames = new Set<string>()
  for (const pkgPath of packageJsons) {
    try {
      const content = await getRawFileContent(owner, repo, branch, pkgPath)
      for (const dep of parsePackageJsonDependencies(content)) npmPackageNames.add(dep.name)
    } catch {
      /* ignore */
    }
  }

  const filesToFetch = trackedPaths.slice(0, MAX_FILES)
  const knownFilePaths = new Set(trackedPaths)

  let totalImports = 0
  let resolved = 0
  const unresolvedByReason: Record<UnresolvedReason, number> = {
    'missing-relative-file': 0,
    'unresolved-alias-like': 0,
    'external-package': 0,
    'possibly-unsupported-syntax': 0,
  }
  const unresolvedExamples: Record<UnresolvedReason, string[]> = {
    'missing-relative-file': [],
    'unresolved-alias-like': [],
    'external-package': [],
    'possibly-unsupported-syntax': [],
  }
  let edgeCount = 0
  const edgeKeys = new Set<string>()

  for (const path of filesToFetch) {
    let content: string
    try {
      content = await getRawFileContent(owner, repo, branch, path)
    } catch {
      continue
    }
    const specifiers = extractImportSpecifiers(content)

    // Rough "possibly unsupported syntax" signal: lines that look like they reference a module
    // (contain `require(` / `from '...'` / `import(`) but produced zero specifiers from the same line.
    const suspectLines = content
      .split('\n')
      .filter((line) => /\brequire\(|(\bfrom\s+['"])|import\(/.test(line) && !specifiers.some((s) => line.includes(s)))
    unresolvedByReason['possibly-unsupported-syntax'] += suspectLines.length
    if (suspectLines.length > 0 && unresolvedExamples['possibly-unsupported-syntax'].length < 5) {
      unresolvedExamples['possibly-unsupported-syntax'].push(`${path}: ${suspectLines[0].trim().slice(0, 80)}`)
    }

    for (const specifier of specifiers) {
      totalImports++
      const resolvedPath =
        resolveRelativeImport(specifier, path, knownFilePaths) ??
        resolveAliasedImport(specifier, aliasEntries, knownFilePaths)

      if (resolvedPath && resolvedPath !== path) {
        resolved++
        const key = `${path}|${resolvedPath}`
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key)
          edgeCount++
        }
        continue
      }

      if (specifier.startsWith('.')) {
        unresolvedByReason['missing-relative-file']++
        if (unresolvedExamples['missing-relative-file'].length < 5) {
          unresolvedExamples['missing-relative-file'].push(`${path}: "${specifier}"`)
        }
        continue
      }

      const pkgName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
      if (npmPackageNames.has(pkgName)) {
        unresolvedByReason['external-package']++
        continue
      }
      if (specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('#')) {
        unresolvedByReason['unresolved-alias-like']++
        if (unresolvedExamples['unresolved-alias-like'].length < 5) {
          unresolvedExamples['unresolved-alias-like'].push(`${path}: "${specifier}"`)
        }
        continue
      }
      unresolvedByReason['external-package']++
    }
  }

  console.log(`\n--- Import resolution (today's resolver, root-config-only) ---`)
  console.log(`Total import specifiers found: ${totalImports}`)
  console.log(`Resolved to a known file:      ${resolved} (${totalImports > 0 ? ((resolved / totalImports) * 100).toFixed(1) : '0'}%)`)
  console.log(`Unique file-graph edges:        ${edgeCount}`)
  console.log(`\nUnresolved by reason:`)
  for (const [reason, count] of Object.entries(unresolvedByReason)) {
    console.log(`  ${reason}: ${count}`)
    for (const ex of unresolvedExamples[reason as UnresolvedReason]) console.log(`    e.g. ${ex}`)
  }

  console.log(`\n--- Cross-check against the real analyzeRepo() pipeline ---`)
  const result = await analyzeRepo(repoUrl)
  console.log(`nodes: ${result.graph.nodes.length}, edges: ${result.graph.edges.length}, filesScanned: ${result.filesScanned}, truncated: ${result.truncated}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
