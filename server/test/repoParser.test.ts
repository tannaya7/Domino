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
})
