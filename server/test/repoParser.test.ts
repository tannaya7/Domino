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

describe('buildGraphFromSource', () => {
  it('builds nodes for tracked files and edges for resolved relative imports', async () => {
    const source = fixtureSource({
      'src/main.tsx': `import { view } from './components/graphView'\nimport React from 'react'`,
      'src/components/graphView.ts': `import { getBlastRadius } from '../lib/graph'`,
      'src/lib/graph.ts': `export function getBlastRadius() {}`,
      'README.md': '# not a tracked file',
    })

    const { graph, truncated, filesScanned } = await buildGraphFromSource(source)

    expect(filesScanned).toBe(3)
    expect(truncated).toBe(false)
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(
      ['src/main.tsx', 'src/components/graphView.ts', 'src/lib/graph.ts'].sort(),
    )
    expect(graph.nodes.every((n) => n.type.length > 0)).toBe(true)

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'src/main.tsx', to: 'src/components/graphView.ts' },
        { from: 'src/components/graphView.ts', to: 'src/lib/graph.ts' },
      ]),
    )
    // Bare package import ('react') must not produce an edge.
    expect(graph.edges).toHaveLength(2)
  })

  it('excludes node_modules and non-tracked-extension files entirely', async () => {
    const source = fixtureSource({
      'src/index.ts': `import x from './x'`,
      'src/x.ts': `export const x = 1`,
      'node_modules/some-pkg/index.js': `module.exports = {}`,
      'package.json': '{}',
    })

    const { graph } = await buildGraphFromSource(source)
    expect(graph.nodes.map((n) => n.id)).toEqual(['src/index.ts', 'src/x.ts'])
  })

  it('deduplicates repeated imports of the same file into a single edge', async () => {
    const source = fixtureSource({
      'src/a.ts': `import { x } from './b'\nimport { y } from './b'`,
      'src/b.ts': `export const x = 1; export const y = 2`,
    })

    const { graph } = await buildGraphFromSource(source)
    expect(graph.edges).toEqual([{ from: 'src/a.ts', to: 'src/b.ts' }])
  })

  it('follows barrel-file re-exports (export { x } from / export * from)', async () => {
    const source = fixtureSource({
      'src/index.ts': `export { helper } from './utils/helper'\nexport * from './lib/graph'`,
      'src/utils/helper.ts': `export const helper = () => {}`,
      'src/lib/graph.ts': `export function getBlastRadius() {}`,
    })

    const { graph } = await buildGraphFromSource(source)
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'src/index.ts', to: 'src/utils/helper.ts' },
        { from: 'src/index.ts', to: 'src/lib/graph.ts' },
      ]),
    )
  })

  it('resolves TS path aliases and Node subpath imports using tsconfig.json/package.json', async () => {
    const source = fixtureSource({
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
      'package.json': JSON.stringify({ imports: { '#ansi-styles': './source/ansi.js' } }),
      'src/main.ts': `import { format } from '@/utils/format'\nimport ansi from '#ansi-styles'`,
      'src/utils/format.ts': `export const format = () => {}`,
      'source/ansi.js': `module.exports = {}`,
    })

    const { graph } = await buildGraphFromSource(source)
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'src/main.ts', to: 'src/utils/format.ts' },
        { from: 'src/main.ts', to: 'source/ansi.js' },
      ]),
    )
  })

  it('infers node types instead of leaving every file the same generic type', async () => {
    const source = fixtureSource({
      'src/components/Button.tsx': `export const Button = () => null`,
      'src/utils/format.ts': `export const format = () => {}`,
      'test/app.test.ts': `it('works', () => {})`,
      'src/index.ts': `export * from './components/Button'`,
    })

    const { graph } = await buildGraphFromSource(source)
    const typeById = Object.fromEntries(graph.nodes.map((n) => [n.id, n.type]))
    expect(typeById['src/components/Button.tsx']).toBe('component')
    expect(typeById['src/utils/format.ts']).toBe('util')
    expect(typeById['test/app.test.ts']).toBe('test')
    // Not every node collapses to the same bucket.
    expect(new Set(Object.values(typeById)).size).toBeGreaterThan(1)
  })

  it('does not drop edges into files that exceed the file-fetch cap', async () => {
    // Simulate a repo bigger than the fetch cap: file 0 imports file 260, which is
    // past the point where we stop fetching content, but should still resolve
    // and appear as a node since it's a real, known file in the repo.
    const files: Record<string, string> = {
      'src/file0.ts': `import { x } from './file260'`,
    }
    for (let i = 1; i <= 260; i++) {
      files[`src/file${i}.ts`] = `export const x = ${i}`
    }

    const { graph, truncated } = await buildGraphFromSource(fixtureSource(files))

    expect(truncated).toBe(true)
    expect(graph.edges).toContainEqual({ from: 'src/file0.ts', to: 'src/file260.ts' })
    expect(graph.nodes.map((n) => n.id)).toContain('src/file260.ts')
  })

  it('does not turn a bare package import into a file-graph node or edge', async () => {
    const source = fixtureSource({ 'src/pay.ts': `import Stripe from 'stripe'` })
    const { graph } = await buildGraphFromSource(source)
    expect(graph.nodes.map((n) => n.id)).toEqual(['src/pay.ts'])
    expect(graph.edges).toEqual([])
  })
})

describe('buildGraphFromSource — vendor discovery', () => {
  it('detects a vendor from a bare import and attributes it to the importing file', async () => {
    const source = fixtureSource({ 'src/pay.ts': `import Stripe from 'stripe'` })
    const { vendors } = await buildGraphFromSource(source)
    expect(vendors).toEqual([expect.objectContaining({ key: 'stripe', detectedInFiles: ['src/pay.ts'] })])
  })

  it('detects a vendor from a process.env reference', async () => {
    const source = fixtureSource({ 'src/pay.ts': `const key = process.env.STRIPE_SECRET_KEY` })
    const { vendors } = await buildGraphFromSource(source)
    expect(vendors).toEqual([
      expect.objectContaining({ key: 'stripe', detectedVia: ['env:STRIPE_SECRET_KEY'] }),
    ])
  })

  it('detects a vendor from package.json dependencies', async () => {
    const source = fixtureSource({
      'package.json': JSON.stringify({ dependencies: { stripe: '^14.0.0' } }),
      'src/index.ts': `export const noop = () => {}`,
    })
    const { vendors } = await buildGraphFromSource(source)
    expect(vendors).toEqual([
      expect.objectContaining({ key: 'stripe', detectedInFiles: ['package.json'] }),
    ])
  })

  it('detects a vendor from a .env.example file', async () => {
    const source = fixtureSource({
      '.env.example': 'STRIPE_SECRET_KEY=\nOPENAI_API_KEY=',
      'src/index.ts': `export const noop = () => {}`,
    })
    const { vendors } = await buildGraphFromSource(source)
    expect(vendors.map((v) => v.key).sort()).toEqual(['openai', 'stripe'])
  })

  it('merges detection across imports, env, and manifest into one vendor entry', async () => {
    const source = fixtureSource({
      'package.json': JSON.stringify({ dependencies: { stripe: '^14.0.0' } }),
      'src/pay.ts': `import Stripe from 'stripe'\nconst key = process.env.STRIPE_SECRET_KEY`,
    })
    const { vendors } = await buildGraphFromSource(source)
    expect(vendors).toHaveLength(1)
    expect(vendors[0].detectedVia.sort()).toEqual(
      ['import:stripe', 'env:STRIPE_SECRET_KEY', 'manifest:npm:stripe'].sort(),
    )
  })

  it('reports no vendors for a repo with no recognized signals', async () => {
    const source = fixtureSource({ 'src/index.ts': `import React from 'react'` })
    const { vendors } = await buildGraphFromSource(source)
    expect(vendors).toEqual([])
  })

  it('extracts IaC substrate signals from a Terraform file', async () => {
    const source = fixtureSource({
      'infra/main.tf': `resource "aws_lambda_function" "api" {}`,
      'src/index.ts': `export const noop = () => {}`,
    })
    const { iacSubstrates } = await buildGraphFromSource(source)
    expect(iacSubstrates).toEqual([
      { provider: 'aws', resourceType: 'aws_lambda_function', source: 'infra/main.tf' },
    ])
  })
})

describe('buildGraphFromSource — scan budget', () => {
  function slowSource(files: Record<string, string>, delayMs: number): RepoSource {
    return {
      async listFiles() {
        return Object.keys(files)
      },
      async readFile(path: string) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        return files[path]
      },
    }
  }

  // Concurrency is 12, so the deadline check (evaluated once per worker, before it starts its next
  // item — not mid-flight) only bites at the boundary BETWEEN rounds of 12. These numbers are
  // chosen so round 1 always completes, and round 2's start time reliably lands on either side of
  // the deadline, with a comfortable margin either way.
  it('reports truncated:true and a lower filesScanned when the budget runs out', async () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 30; i++) files[`src/file${i}.ts`] = `export const x = ${i}`
    const source = slowSource(files, 30)

    // Round 1 (12 files) finishes ~30ms; round 2 starts ~30ms > the 20ms deadline -> skipped.
    const result = await buildGraphFromSource(source, { scanBudgetMs: 20 })

    expect(result.truncated).toBe(true)
    expect(result.filesScanned).toBe(12)
  })

  it('does not truncate when everything finishes inside the budget', async () => {
    const source = slowSource({ 'src/a.ts': 'export const a = 1' }, 1)
    const result = await buildGraphFromSource(source, { scanBudgetMs: 5000 })
    expect(result.truncated).toBe(false)
    expect(result.filesScanned).toBe(1)
  })

  it('prioritizes entrypoint files over deeply nested ones when time runs out', async () => {
    const files: Record<string, string> = { 'index.ts': 'export const root = 1' }
    for (let i = 0; i < 20; i++) files[`a/b/c/deep${i}.ts`] = `export const d${i} = ${i}`
    const source = slowSource(files, 30)

    // Without prioritization, index.ts (inserted last) would land in round 2 and get cut here.
    // Round 1 (12 files) finishes ~30ms; round 2 starts ~30ms > the 20ms deadline -> skipped.
    const result = await buildGraphFromSource(source, { scanBudgetMs: 20 })

    expect(result.truncated).toBe(true)
    expect(result.filesScanned).toBe(12)
    const scannedIds = result.graph.nodes.map((n) => n.id)
    expect(scannedIds).toContain('index.ts')
    expect(scannedIds).not.toContain('a/b/c/deep19.ts')
  })
})

describe('buildGraphFromSource — nested tsconfig alias resolution (SkillSprint regression)', () => {
  it('resolves "@/" imports against a tsconfig nested in a subdirectory, not just the repo root', async () => {
    // Reproduces nishantbkl3345-ship-it/SkillSprint: a Next.js app in frontend/, with
    // frontend/tsconfig.json (not root) declaring {"@/*": ["./*"]} and no baseUrl.
    const source = fixtureSource({
      'frontend/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
      'frontend/app/page.tsx': `import { getConfig } from '@/lib/api-config'\nimport '@/app/globals.css'`,
      'frontend/lib/api-config.ts': `export function getConfig() {}`,
      'go-backend/main.go': 'package main', // untracked extension — must not interfere
    })

    const { graph, vendors } = await buildGraphFromSource(source)

    expect(graph.edges).toContainEqual({ from: 'frontend/app/page.tsx', to: 'frontend/lib/api-config.ts' })
    // '@/app/globals.css' has no tracked-extension match — correctly falls through to vendor
    // discovery rather than a fabricated edge, and doesn't match any curated vendor either.
    expect(vendors).toEqual([])
  })

  it('does not cross-resolve "@/" between two sibling apps with their own tsconfig', async () => {
    const source = fixtureSource({
      'apps/a/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
      'apps/b/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
      'apps/a/index.ts': `import { x } from '@/shared'`,
      'apps/a/shared.ts': `export const x = 1`,
      'apps/b/shared.ts': `export const x = 2`, // must NOT be what apps/a resolves to
    })

    const { graph } = await buildGraphFromSource(source)
    expect(graph.edges).toEqual([{ from: 'apps/a/index.ts', to: 'apps/a/shared.ts' }])
  })

  it('resolves a workspace package import as an internal file-graph edge, not a vendor', async () => {
    const source = fixtureSource({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/ui/package.json': JSON.stringify({ name: '@acme/ui' }),
      'packages/ui/index.ts': `export const Button = () => null`,
      'apps/web/index.ts': `import { Button } from '@acme/ui'`,
    })

    const { graph, vendors } = await buildGraphFromSource(source)
    expect(graph.edges).toContainEqual({ from: 'apps/web/index.ts', to: 'packages/ui/index.ts' })
    expect(vendors).toEqual([]) // never misclassified as a third-party vendor
  })

  it('follows an extends chain when the child declares its own baseUrl+paths (the common real pattern)', async () => {
    const source = fixtureSource({
      // A realistic shared base: language/strictness options, deliberately NOT baseUrl/paths —
      // those are inherently per-package, so each app declares its own alongside extending this.
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { strict: true, target: 'ES2020' } }),
      'frontend/tsconfig.json': JSON.stringify({
        extends: '../tsconfig.base.json',
        compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } },
      }),
      'frontend/app/page.tsx': `import { x } from '@/lib/x'`,
      'frontend/lib/x.ts': `export const x = 1`,
    })

    const { graph } = await buildGraphFromSource(source)
    expect(graph.edges).toContainEqual({ from: 'frontend/app/page.tsx', to: 'frontend/lib/x.ts' })
  })

  it('resolves relative to the repo root when an EXTENDED base sets baseUrl — a real tsc gotcha, not a bug', async () => {
    // If a shared base config sets baseUrl itself, tsc resolves it relative to THAT file's
    // location, not the child's — so a child extending it without its own baseUrl gets paths
    // resolved from the repo root, even though the child lives in a subdirectory. This
    // deliberately documents that behavior rather than silently "fixing" it into something
    // tsc itself wouldn't do.
    const source = fixtureSource({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { baseUrl: '.' } }),
      'frontend/tsconfig.json': JSON.stringify({
        extends: '../tsconfig.base.json',
        compilerOptions: { paths: { '@/*': ['./*'] } },
      }),
      'frontend/app/page.tsx': `import { x } from '@/lib/x'`,
      'lib/x.ts': `export const x = 1`, // repo ROOT lib/x.ts — where real tsc would actually look
    })

    const { graph } = await buildGraphFromSource(source)
    expect(graph.edges).toContainEqual({ from: 'frontend/app/page.tsx', to: 'lib/x.ts' })
  })
})
