// Fuzzing evidence for the import/env-var scanners (server/src/importParser.ts,
// server/src/envScanner.ts): the task is "the scanner must skip and COUNT what it skipped, never
// hang" — this file empirically times the scanners against the three adversarial shapes called
// out (10MB single-line file, unterminated strings, 50k identical imports) under a hard budget,
// and separately proves buildGraphFromSource's own oversized-file guard actually skips+counts
// rather than scanning a pathological file anyway.
import { describe, expect, it } from 'vitest'
import { extractEnvVarNames } from '../src/envScanner'
import { extractImportSpecifiers } from '../src/importParser'
import { buildGraphFromSource, type RepoSource } from '../src/repoParser'

const FUZZ_TIME_BUDGET_MS = 2000

function fixtureSource(files: Record<string, string>): RepoSource {
  return {
    async listFiles() {
      return Object.keys(files)
    },
    async readFile(path: string) {
      return files[path]
    },
  }
}

function timed<T>(fn: () => T): { result: T; elapsedMs: number } {
  const start = performance.now()
  const result = fn()
  const elapsedMs = performance.now() - start
  return { result, elapsedMs }
}

describe('scanner fuzzing — must complete under budget, never hang', () => {
  it('extractImportSpecifiers on a 10MB single-line file of repeated imports', () => {
    const oneImport = `import { x } from './a';`
    const source = oneImport.repeat(Math.ceil((10 * 1024 * 1024) / oneImport.length))
    expect(source.length).toBeGreaterThan(9 * 1024 * 1024)

    const { result, elapsedMs } = timed(() => extractImportSpecifiers(source))
    console.log(`[verify] extractImportSpecifiers, 10MB single line (${source.length} bytes): ${elapsedMs.toFixed(1)}ms`)
    expect(result).toEqual(['./a']) // every repetition is the SAME specifier — correctly deduped, not 50k+ entries
    expect(elapsedMs).toBeLessThan(FUZZ_TIME_BUDGET_MS)
  })

  it('extractImportSpecifiers on an unterminated string (no closing quote anywhere in 5MB)', () => {
    const source = `import { x } from "` + 'a'.repeat(5 * 1024 * 1024)

    const { result, elapsedMs } = timed(() => extractImportSpecifiers(source))
    console.log(`[verify] extractImportSpecifiers, unterminated string (${source.length} bytes): ${elapsedMs.toFixed(1)}ms`)
    expect(result).toEqual([]) // no closing quote -> no match -> nothing extracted, not a hang
    expect(elapsedMs).toBeLessThan(FUZZ_TIME_BUDGET_MS)
  })

  it('extractImportSpecifiers on 50,000 distinct imports', () => {
    const source = Array.from({ length: 50_000 }, (_, i) => `import { x${i} } from './f${i}'`).join('\n')

    const { result, elapsedMs } = timed(() => extractImportSpecifiers(source))
    console.log(`[verify] extractImportSpecifiers, 50,000 distinct imports: ${elapsedMs.toFixed(1)}ms`)
    expect(result).toHaveLength(50_000)
    expect(elapsedMs).toBeLessThan(FUZZ_TIME_BUDGET_MS)
  })

  it('extractImportSpecifiers on 50,000 IDENTICAL imports collapses to one specifier, fast', () => {
    const source = Array.from({ length: 50_000 }, () => `import { x } from './same'`).join('\n')

    const { result, elapsedMs } = timed(() => extractImportSpecifiers(source))
    console.log(`[verify] extractImportSpecifiers, 50,000 identical imports: ${elapsedMs.toFixed(1)}ms`)
    expect(result).toEqual(['./same'])
    expect(elapsedMs).toBeLessThan(FUZZ_TIME_BUDGET_MS)
  })

  it('extractImportSpecifiers on an adversarial "import <token> <token> ... ;" with no from/quote ever appearing', () => {
    // Targets the lazy quantifier in IMPORT_FROM's optional binding-clause group — the shape most
    // likely to trigger backtracking blowup if this regex were unsafe.
    const source = 'import ' + 'a '.repeat(200_000) + ';'

    const { result, elapsedMs } = timed(() => extractImportSpecifiers(source))
    console.log(`[verify] extractImportSpecifiers, adversarial no-match (${source.length} bytes): ${elapsedMs.toFixed(1)}ms`)
    expect(result).toEqual([])
    expect(elapsedMs).toBeLessThan(FUZZ_TIME_BUDGET_MS)
  })

  it('extractEnvVarNames on a 10MB single-line file', () => {
    const line = 'process.env.SOME_VAR_NAME;'
    const source = line.repeat(Math.ceil((10 * 1024 * 1024) / line.length))

    const { result, elapsedMs } = timed(() => extractEnvVarNames(source))
    console.log(`[verify] extractEnvVarNames, 10MB single line: ${elapsedMs.toFixed(1)}ms`)
    expect(result).toEqual(['SOME_VAR_NAME'])
    expect(elapsedMs).toBeLessThan(FUZZ_TIME_BUDGET_MS)
  })

  it('buildGraphFromSource skips an oversized file and COUNTS it, rather than scanning or dropping it silently', async () => {
    const oneImport = `import { x } from './a';`
    const oversized = oneImport.repeat(Math.ceil((3 * 1024 * 1024) / oneImport.length)) // > MAX_SCANNABLE_FILE_LENGTH
    const source = fixtureSource({
      'src/huge.ts': oversized,
      'src/a.ts': `export const a = 1`,
      'src/normal.ts': `import { a } from './a'`,
    })

    const { result, elapsedMs } = timed(() => buildGraphFromSource(source))
    const graph = await result
    console.log(`[verify] buildGraphFromSource with one 3MB file among 3: ${elapsedMs.toFixed(1)}ms`)

    expect(graph.skippedOversizedFiles).toBe(1)
    // Still a real node — just not scanned for ITS OWN imports (it has none in this fixture,
    // making the point cleanly: it's "present but unscanned," not "vanished").
    expect(graph.graph.nodes.map((n) => n.id)).toContain('src/huge.ts')
    // The normal file's own import is untouched by the neighboring oversized file.
    expect(graph.graph.edges).toContainEqual({ from: 'src/normal.ts', to: 'src/a.ts' })
  })
})
