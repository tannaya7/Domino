import { describe, expect, it } from 'vitest'
import {
  parsePackageJsonImports,
  parseTsconfigPaths,
  resolveAliasedImport,
} from '../src/aliasResolver'

describe('parseTsconfigPaths', () => {
  it('extracts a wildcard path alias relative to baseUrl', () => {
    const tsconfig = JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } },
    })
    expect(parseTsconfigPaths(tsconfig)).toEqual([{ prefix: '@/', target: 'src' }])
  })

  it('tolerates // and /* */ comments (tsconfig.json is JSONC)', () => {
    const tsconfig = `{
      // this is a comment
      "compilerOptions": {
        /* block comment */
        "baseUrl": ".",
        "paths": { "@/*": ["src/*"] }
      }
    }`
    expect(parseTsconfigPaths(tsconfig)).toEqual([{ prefix: '@/', target: 'src' }])
  })

  it('returns an empty array for invalid JSON instead of throwing', () => {
    expect(parseTsconfigPaths('not json')).toEqual([])
  })
})

describe('parsePackageJsonImports', () => {
  it('extracts a simple subpath import', () => {
    const pkg = JSON.stringify({ imports: { '#ansi-styles': './source/vendor/ansi-styles/index.js' } })
    expect(parsePackageJsonImports(pkg)).toEqual([
      { prefix: '#ansi-styles', target: 'source/vendor/ansi-styles/index.js' },
    ])
  })

  it('resolves a conditional imports entry to its default/import/node value', () => {
    const pkg = JSON.stringify({
      imports: { '#env': { node: './src/env.node.js', default: './src/env.js' } },
    })
    expect(parsePackageJsonImports(pkg)).toEqual([{ prefix: '#env', target: 'src/env.js' }])
  })
})

describe('resolveAliasedImport', () => {
  const known = new Set(['src/utils/format.ts', 'source/vendor/ansi-styles/index.js'])

  it('resolves a TS path alias to a known file', () => {
    const aliases = [{ prefix: '@/', target: 'src/' }]
    expect(resolveAliasedImport('@/utils/format', aliases, known)).toBe('src/utils/format.ts')
  })

  it('resolves correctly when the target has no trailing slash (as parseTsconfigPaths produces)', () => {
    const aliases = [{ prefix: '@/', target: 'src' }]
    expect(resolveAliasedImport('@/utils/format', aliases, known)).toBe('src/utils/format.ts')
  })

  it('resolves a Node subpath import to a known file', () => {
    const aliases = [{ prefix: '#ansi-styles', target: 'source/vendor/ansi-styles/index.js' }]
    expect(resolveAliasedImport('#ansi-styles', aliases, known)).toBe('source/vendor/ansi-styles/index.js')
  })

  it('returns null when nothing matches', () => {
    expect(resolveAliasedImport('react', [{ prefix: '@/', target: 'src/' }], known)).toBeNull()
  })
})
