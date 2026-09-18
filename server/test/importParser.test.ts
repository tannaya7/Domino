import { describe, expect, it } from 'vitest'
import { extractImportSpecifiers, resolveRelativeImport } from '../src/importParser'

describe('extractImportSpecifiers', () => {
  it('extracts ES import specifiers', () => {
    const source = `
      import React from 'react'
      import { foo } from './foo'
      import type { Bar } from '../types'
      import './side-effect.css'
    `
    expect(extractImportSpecifiers(source)).toEqual(
      expect.arrayContaining(['react', './foo', '../types', './side-effect.css']),
    )
  })

  it('extracts require() and dynamic import() specifiers', () => {
    const source = `
      const a = require('./a')
      const b = await import('./b')
    `
    const result = extractImportSpecifiers(source)
    expect(result).toContain('./a')
    expect(result).toContain('./b')
  })

  it('returns no duplicates for a specifier imported twice', () => {
    const source = `import { a } from './a'\nimport { b } from './a'`
    expect(extractImportSpecifiers(source)).toEqual(['./a'])
  })
})

describe('resolveRelativeImport', () => {
  const knownFiles = new Set([
    'src/App.tsx',
    'src/lib/graph.ts',
    'src/components/GraphView.tsx',
    'src/components/index.ts',
  ])

  it('resolves a same-directory relative import with an inferred extension', () => {
    expect(resolveRelativeImport('./graph', 'src/lib/risk.ts', knownFiles)).toBe('src/lib/graph.ts')
  })

  it('resolves a parent-directory relative import', () => {
    expect(resolveRelativeImport('../lib/graph', 'src/components/GraphView.tsx', knownFiles)).toBe(
      'src/lib/graph.ts',
    )
  })

  it('resolves a directory import to its index file', () => {
    expect(resolveRelativeImport('./components', 'src/App.tsx', knownFiles)).toBe('src/components/index.ts')
  })

  it('returns null for a bare package specifier', () => {
    expect(resolveRelativeImport('react', 'src/App.tsx', knownFiles)).toBeNull()
  })

  it('returns null for a relative import that does not resolve to a known file', () => {
    expect(resolveRelativeImport('./missing', 'src/App.tsx', knownFiles)).toBeNull()
  })

  it('resolves "../" from a nested file to the repo root\'s index file (common in test/ dirs)', () => {
    const rootFiles = new Set(['index.js', 'lib/application.js'])
    expect(resolveRelativeImport('../', 'test/app.all.js', rootFiles)).toBe('index.js')
    expect(resolveRelativeImport('..', 'test/app.all.js', rootFiles)).toBe('index.js')
  })
})
