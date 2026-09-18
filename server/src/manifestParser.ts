export type ManifestEcosystem = 'npm' | 'pip' | 'go' | 'gem' | 'maven'

export interface ManifestDependency {
  name: string
  ecosystem: ManifestEcosystem
}

/** Extracts `dependencies`/`devDependencies` package names from a package.json source string. */
export function parsePackageJsonDependencies(source: string): ManifestDependency[] {
  try {
    const json = JSON.parse(source)
    const names = new Set<string>([
      ...Object.keys(json?.dependencies ?? {}),
      ...Object.keys(json?.devDependencies ?? {}),
    ])
    return [...names].map((name) => ({ name, ecosystem: 'npm' as const }))
  } catch {
    return []
  }
}

const REQUIREMENTS_LINE = /^\s*([A-Za-z0-9][A-Za-z0-9_.-]*)/

/** Extracts package names from a requirements.txt source string, ignoring comments and version pins. */
export function parseRequirementsTxt(source: string): ManifestDependency[] {
  const names = new Set<string>()
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('-')) continue
    const match = REQUIREMENTS_LINE.exec(line)
    if (match) names.add(match[1])
  }
  return [...names].map((name) => ({ name, ecosystem: 'pip' as const }))
}

const GO_REQUIRE_LINE = /^\s*([a-zA-Z0-9.\-/]+)\s+v\d+\S*/

/** Extracts module paths from `require` lines/blocks in a go.mod source string. */
export function parseGoMod(source: string): ManifestDependency[] {
  const names = new Set<string>()
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('//')) continue
    const withoutKeyword = line.replace(/^require\s+/, '')
    if (withoutKeyword === '(' || withoutKeyword === ')') continue
    const match = GO_REQUIRE_LINE.exec(withoutKeyword)
    if (match) names.add(match[1])
  }
  return [...names].map((name) => ({ name, ecosystem: 'go' as const }))
}

const GEM_LINE = /^\s*gem\s+['"]([^'"]+)['"]/

/** Extracts gem names from a Gemfile source string. */
export function parseGemfile(source: string): ManifestDependency[] {
  const names = new Set<string>()
  for (const line of source.split('\n')) {
    const match = GEM_LINE.exec(line)
    if (match) names.add(match[1])
  }
  return [...names].map((name) => ({ name, ecosystem: 'gem' as const }))
}

/** Extracts artifactIds from `<dependency>` blocks in a pom.xml source string. */
export function parsePomXml(source: string): ManifestDependency[] {
  const names = new Set<string>()
  const dependencyBlocks = source.match(/<dependency>[\s\S]*?<\/dependency>/g) ?? []
  for (const block of dependencyBlocks) {
    const match = /<artifactId>([^<]+)<\/artifactId>/.exec(block)
    if (match) names.add(match[1].trim())
  }
  return [...names].map((name) => ({ name, ecosystem: 'maven' as const }))
}

const MANIFEST_PARSERS: Record<string, (source: string) => ManifestDependency[]> = {
  'package.json': parsePackageJsonDependencies,
  'requirements.txt': parseRequirementsTxt,
  'go.mod': parseGoMod,
  Gemfile: parseGemfile,
  'pom.xml': parsePomXml,
}

/** Filenames (repo-root or nested) this module knows how to parse for dependencies. */
export const KNOWN_MANIFEST_FILENAMES = Object.keys(MANIFEST_PARSERS)

/** Parses a manifest file's dependencies by its basename. Returns [] for an unrecognized filename. */
export function parseManifest(filename: string, source: string): ManifestDependency[] {
  const basename = filename.split('/').pop() ?? filename
  const parser = MANIFEST_PARSERS[basename]
  if (!parser) return []
  try {
    return parser(source)
  } catch {
    return []
  }
}
