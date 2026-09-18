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
    // Simulate a repo bigger than the fetch cap: file 0 imports file 90, which is
    // past the point where we stop fetching content, but should still resolve
    // and appear as a node since it's a real, known file in the repo.
    const files: Record<string, string> = {
      'src/file0.ts': `import { x } from './file90'`,
    }
    for (let i = 1; i <= 90; i++) {
      files[`src/file${i}.ts`] = `export const x = ${i}`
    }

    const { graph, truncated } = await buildGraphFromSource(fixtureSource(files))

    expect(truncated).toBe(true)
    expect(graph.edges).toContainEqual({ from: 'src/file0.ts', to: 'src/file90.ts' })
    expect(graph.nodes.map((n) => n.id)).toContain('src/file90.ts')
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

  // Concurrency is 8, so the deadline check (evaluated once per worker, before it starts its next
  // item — not mid-flight) only bites at the boundary BETWEEN rounds of 8. These numbers are
  // chosen so round 1 always completes, and round 2's start time reliably lands on either side of
  // the deadline, with a comfortable margin either way.
  it('reports truncated:true and a lower filesScanned when the budget runs out', async () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 30; i++) files[`src/file${i}.ts`] = `export const x = ${i}`
    const source = slowSource(files, 30)

    // Round 1 (8 files) finishes ~30ms; round 2 starts ~30ms > the 20ms deadline -> skipped.
    const result = await buildGraphFromSource(source, { scanBudgetMs: 20 })

    expect(result.truncated).toBe(true)
    expect(result.filesScanned).toBe(8)
  })

  it('does not truncate when everything finishes inside the budget', async () => {
    const source = slowSource({ 'src/a.ts': 'export const a = 1' }, 1)
    const result = await buildGraphFromSource(source, { scanBudgetMs: 5000 })
    expect(result.truncated).toBe(false)
    expect(result.filesScanned).toBe(1)
  })

  it('prioritizes entrypoint files over deeply nested ones when time runs out', async () => {
    const files: Record<string, string> = { 'index.ts': 'export const root = 1' }
    for (let i = 0; i < 10; i++) files[`a/b/c/deep${i}.ts`] = `export const d${i} = ${i}`
    const source = slowSource(files, 30)

    // Without prioritization, index.ts (inserted last) would land in round 2 and get cut here.
    // Round 1 (8 files) finishes ~30ms; round 2 starts ~30ms > the 20ms deadline -> skipped.
    const result = await buildGraphFromSource(source, { scanBudgetMs: 20 })

    expect(result.truncated).toBe(true)
    expect(result.filesScanned).toBe(8)
    const scannedIds = result.graph.nodes.map((n) => n.id)
    expect(scannedIds).toContain('index.ts')
    expect(scannedIds).not.toContain('a/b/c/deep9.ts')
  })
})
