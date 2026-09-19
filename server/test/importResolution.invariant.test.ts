// Invariant test (Prompt: verification pack, item 1c): "resolved + unresolved == total" on every
// fixture — nothing an import specifier extracts to is ever silently dropped from the "X% of
// internal imports resolved" data-quality badge — plus determinism (same fixture, same numbers,
// every time; this pipeline has no randomness anywhere in it, and a differential/invariant test is
// exactly where a stray Set/Map iteration-order assumption would first show up as flakiness).
import { describe, expect, it } from 'vitest'
import { buildGraphFromSource, type RepoSource } from '../src/repoParser'

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

/** Deterministic seeded PRNG (mulberry32) — same generator used elsewhere in this test suite. */
function mulberry32(seed: number): () => number {
  let state = seed
  return function next() {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface GeneratedFixture {
  files: Record<string, string>
  /** Every DISTINCT relative specifier this generator wrote, and whether it points at a file that
   * actually exists in `files` — computed independently of repoParser's own resolution logic. */
  expectedTotal: number
  expectedResolved: number
}

/** Builds a small flat repo of .ts files, each importing a random mix of specifiers that resolve
 * to a real sibling file and specifiers that don't (a typo'd path, a deleted file still imported) —
 * the exact "nothing silently dropped" case: an unresolved-but-internal-looking specifier must
 * still land in the denominator, not vanish from the count. */
function generateFixture(rng: () => number, fileCount: number): GeneratedFixture {
  const fileNames = Array.from({ length: fileCount }, (_, i) => `src/file${i}.ts`)
  const files: Record<string, string> = {}
  let expectedTotal = 0
  let expectedResolved = 0

  for (let i = 0; i < fileCount; i++) {
    const specifierCount = Math.floor(rng() * 4) // 0-3 distinct relative specifiers per file
    const specifiers = new Set<string>()
    for (let s = 0; s < specifierCount; s++) {
      const resolvable = rng() < 0.5
      const targetIndex = Math.floor(rng() * fileCount)
      const specifier = resolvable ? `./file${targetIndex}` : `./does-not-exist-${i}-${s}`
      specifiers.add(specifier)
    }
    const lines = [...specifiers].map((spec, idx) => `import { x${idx} } from '${spec}'`)
    files[fileNames[i]] = lines.join('\n') || '// no imports'

    for (const spec of specifiers) {
      expectedTotal++
      // Mirrors resolveToKnownPath's own extension-suffix search (the fixture writes bare
      // "./fileN", and fileN.ts is the real tracked path) — independent of repoParser's code path.
      if (spec.startsWith('./does-not-exist')) continue
      const target = `src/${spec.slice(2)}.ts`
      if (files[target] !== undefined || fileNames.includes(target)) expectedResolved++
    }
  }

  return { files, expectedTotal, expectedResolved }
}

const TRIALS = 40

describe('import resolution — invariant: nothing is silently dropped from total', () => {
  it(`resolved <= total, and total matches the independently-counted internal-looking specifiers, on ${TRIALS} generated fixtures`, async () => {
    const rng = mulberry32(20260303)

    for (let trial = 0; trial < TRIALS; trial++) {
      const fileCount = 2 + Math.floor(rng() * 10)
      const fixture = generateFixture(rng, fileCount)
      const source = fixtureSource(fixture.files)

      const { importResolution } = await buildGraphFromSource(source)

      const context = `trial ${trial}: fileCount=${fileCount} expected=${JSON.stringify(fixture)}`
      expect(importResolution.total, context).toBe(fixture.expectedTotal)
      expect(importResolution.resolved, context).toBe(fixture.expectedResolved)
      expect(importResolution.resolved, context).toBeLessThanOrEqual(importResolution.total)
    }
  })

  it('is deterministic — running the same fixture twice yields byte-identical resolution stats', async () => {
    const rng = mulberry32(777)
    const fixture = generateFixture(rng, 12)

    const first = await buildGraphFromSource(fixtureSource(fixture.files))
    const second = await buildGraphFromSource(fixtureSource(fixture.files))

    expect(second.importResolution).toEqual(first.importResolution)
    expect(second.graph.nodes.map((n) => n.id).sort()).toEqual(first.graph.nodes.map((n) => n.id).sort())
    expect(second.graph.edges).toEqual(first.graph.edges)
  })

  it('counts an unresolved-but-internal-looking specifier in the total, not just resolved ones', async () => {
    const source = fixtureSource({
      'src/a.ts': `import { missing } from './does-not-exist'`,
    })
    const { importResolution } = await buildGraphFromSource(source)
    expect(importResolution.total).toBe(1)
    expect(importResolution.resolved).toBe(0)
  })

  it('never counts a bare/external specifier as an internal import at all', async () => {
    const source = fixtureSource({
      'src/a.ts': `import React from 'react'\nimport { z } from 'zod'`,
    })
    const { importResolution } = await buildGraphFromSource(source)
    expect(importResolution.total).toBe(0)
    expect(importResolution.resolved).toBe(0)
  })
})
