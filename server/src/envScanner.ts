const PROCESS_ENV = /process\.env\.([A-Z][A-Z0-9_]*)/g
const IMPORT_META_ENV = /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g
const ENV_FILE_LINE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/

/** Extracts env-var names referenced via `process.env.X` / `import.meta.env.X` in source text. */
export function extractEnvVarNames(source: string): string[] {
  const names = new Set<string>()
  for (const pattern of [PROCESS_ENV, IMPORT_META_ENV]) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source))) {
      names.add(match[1])
    }
  }
  return [...names]
}

/** Parses `KEY=value` lines from a `.env`/`.env.example`-style file, ignoring comments and blanks. */
export function parseEnvFile(content: string): string[] {
  const names = new Set<string>()
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('#')) continue
    const match = ENV_FILE_LINE.exec(line)
    if (match) names.add(match[1])
  }
  return [...names]
}
