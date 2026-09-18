import { describe, expect, it } from 'vitest'
import {
  buildAliasEntriesFromPaths,
  loadAliasScopes,
  loadResolvedTsconfig,
  loadWorkspaceAliasEntries,
  parseJsonc,
  parsePackageJsonImports,
  parseTsconfigPaths,
  resolveAliasedImport,
  scopeForFile,
  type ConfigReader,
} from '../src/aliasResolver'

function fixtureReader(files: Record<string, string>): ConfigReader {
  return {
    async readFile(path: string) {
      if (!(path in files)) throw new Error(`no such file: ${path}`)
      return files[path]
    },
  }
}

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

describe('parseJsonc', () => {
  it('parses a plain JSON object', () => {
    expect(parseJsonc('{"a": 1}')).toEqual({ a: 1 })
  })

  it('tolerates line and block comments', () => {
    expect(parseJsonc('{\n // comment\n "a": /* inline */ 1\n}')).toEqual({ a: 1 })
  })

  it('tolerates trailing commas in objects and arrays', () => {
    expect(parseJsonc('{"a": [1, 2,], "b": 3,}')).toEqual({ a: [1, 2], b: 3 })
  })

  it('returns null for genuinely invalid JSON instead of throwing', () => {
    expect(parseJsonc('not json at all')).toBeNull()
  })
})

describe('loadResolvedTsconfig', () => {
  it('resolves paths relative to the tsconfig directory when there is no baseUrl (the SkillSprint case)', async () => {
    const reader = fixtureReader({
      'frontend/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
    })
    const resolved = await loadResolvedTsconfig('frontend/tsconfig.json', reader)
    expect(resolved).toEqual({ paths: { '@/*': ['./*'] } })
    expect(buildAliasEntriesFromPaths('frontend', resolved!)).toEqual([{ prefix: '@/', target: 'frontend' }])
  })

  it('resolves baseUrl relative to the tsconfig directory when both baseUrl and paths are set', async () => {
    const reader = fixtureReader({
      'apps/web/tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: 'src', paths: { '@/*': ['./*'] } } }),
    })
    const resolved = await loadResolvedTsconfig('apps/web/tsconfig.json', reader)
    expect(buildAliasEntriesFromPaths('apps/web', resolved!)).toEqual([{ prefix: '@/', target: 'apps/web/src' }])
  })

  it('follows a relative extends chain, letting the child override the parent', async () => {
    const reader = fixtureReader({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['./shared/*'] } } }),
      'apps/web/tsconfig.json': JSON.stringify({
        extends: '../../tsconfig.base.json',
        compilerOptions: { paths: { '@/*': ['./*'] } },
      }),
    })
    const resolved = await loadResolvedTsconfig('apps/web/tsconfig.json', reader)
    // baseUrl came from the base config and — per real tsc's documented extends behavior — a
    // relative value resolves relative to the file that DECLARED it (the base, at repo root),
    // not the leaf. The child redeclared paths, which fully replaces the parent's (no merge).
    expect(resolved).toEqual({ baseUrl: '.', baseUrlDir: '', paths: { '@/*': ['./*'] } })
    expect(buildAliasEntriesFromPaths('apps/web', resolved!)).toEqual([{ prefix: '@/', target: '' }])
  })

  it('inherits baseUrl AND paths from the parent when the child declares neither', async () => {
    const reader = fixtureReader({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['./shared/*'] } } }),
      'apps/web/tsconfig.json': JSON.stringify({ extends: '../../tsconfig.base.json' }),
    })
    const resolved = await loadResolvedTsconfig('apps/web/tsconfig.json', reader)
    expect(resolved).toEqual({ baseUrl: '.', baseUrlDir: '', paths: { '@shared/*': ['./shared/*'] } })
  })

  it('does not loop forever on a circular extends chain', async () => {
    const reader = fixtureReader({
      'a.json': JSON.stringify({ extends: './b.json', compilerOptions: { paths: { '@a/*': ['./a/*'] } } }),
      'b.json': JSON.stringify({ extends: './a.json', compilerOptions: { paths: { '@b/*': ['./b/*'] } } }),
    })
    const resolved = await loadResolvedTsconfig('a.json', reader)
    expect(resolved).not.toBeNull() // terminates instead of hanging/throwing
  })

  it('returns null when the config itself cannot be read', async () => {
    const resolved = await loadResolvedTsconfig('missing/tsconfig.json', fixtureReader({}))
    expect(resolved).toBeNull()
  })

  it('stops the chain (keeping what it has) when an extends target is missing', async () => {
    const reader = fixtureReader({
      'apps/web/tsconfig.json': JSON.stringify({
        extends: './does-not-exist.json',
        compilerOptions: { paths: { '@/*': ['./*'] } },
      }),
    })
    const resolved = await loadResolvedTsconfig('apps/web/tsconfig.json', reader)
    expect(resolved?.paths).toEqual({ '@/*': ['./*'] })
  })

  it('leaves a bare-package extends (non-relative) alone rather than trying to resolve into node_modules', async () => {
    const reader = fixtureReader({
      'tsconfig.json': JSON.stringify({ extends: '@tsconfig/node20/tsconfig.json', compilerOptions: { paths: { '@/*': ['./*'] } } }),
    })
    const resolved = await loadResolvedTsconfig('tsconfig.json', reader)
    expect(resolved?.paths).toEqual({ '@/*': ['./*'] })
  })
})

describe('buildAliasEntriesFromPaths', () => {
  it('produces one entry per target for a wildcard pattern with multiple targets', () => {
    const entries = buildAliasEntriesFromPaths('frontend', {
      paths: { '@/*': ['./src/*', './generated/*'] },
    })
    expect(entries).toEqual([
      { prefix: '@/', target: 'frontend/src' },
      { prefix: '@/', target: 'frontend/generated' },
    ])
  })

  it('returns [] when there are no paths at all', () => {
    expect(buildAliasEntriesFromPaths('frontend', {})).toEqual([])
  })
})

describe('loadAliasScopes + scopeForFile', () => {
  it('gives each config its own scope and resolves the nearest ancestor per file', async () => {
    const reader = fixtureReader({
      'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
      'frontend/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
    })
    const allPaths = ['tsconfig.json', 'frontend/tsconfig.json', 'src/a.ts', 'frontend/lib/b.ts']
    const scopes = await loadAliasScopes(reader, allPaths)

    const rootScope = scopeForFile('src/a.ts', scopes)
    expect(rootScope?.configDir).toBe('')
    expect(rootScope?.entries).toEqual([{ prefix: '@/', target: 'src' }])

    const frontendScope = scopeForFile('frontend/lib/b.ts', scopes)
    expect(frontendScope?.configDir).toBe('frontend')
    expect(frontendScope?.entries).toEqual([{ prefix: '@/', target: 'frontend' }])
  })

  it('returns null for a file under no config at all', async () => {
    const scopes = await loadAliasScopes(fixtureReader({}), [])
    expect(scopeForFile('anywhere/file.ts', scopes)).toBeNull()
  })

  it('skips one malformed config without losing every other directory’s aliases', async () => {
    const reader = fixtureReader({
      'broken/tsconfig.json': 'not even json',
      'frontend/tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }),
    })
    const scopes = await loadAliasScopes(reader, ['broken/tsconfig.json', 'frontend/tsconfig.json'])
    expect(scopeForFile('frontend/x.ts', scopes)?.entries).toEqual([{ prefix: '@/', target: 'frontend' }])
    expect(scopeForFile('broken/x.ts', scopes)).toBeNull()
  })
})

describe('loadWorkspaceAliasEntries', () => {
  it('resolves an npm/yarn workspace package name to its directory', async () => {
    const reader = fixtureReader({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/ui/package.json': JSON.stringify({ name: '@acme/ui' }),
    })
    const entries = await loadWorkspaceAliasEntries(reader, ['package.json', 'packages/ui/package.json'])
    expect(entries).toEqual([{ prefix: '@acme/ui', target: 'packages/ui' }])
  })

  it('resolves via pnpm-workspace.yaml when there is no workspaces field', async () => {
    const reader = fixtureReader({
      'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n  - "packages/*"\n',
      'apps/web/package.json': JSON.stringify({ name: '@acme/web' }),
    })
    const entries = await loadWorkspaceAliasEntries(reader, ['pnpm-workspace.yaml', 'apps/web/package.json'])
    expect(entries).toEqual([{ prefix: '@acme/web', target: 'apps/web' }])
  })

  it('resolves an internal workspace import via the standard alias mechanism, not as a vendor', () => {
    const known = new Set(['packages/ui/index.ts'])
    const resolved = resolveAliasedImport('@acme/ui', [{ prefix: '@acme/ui', target: 'packages/ui' }], known)
    expect(resolved).toBe('packages/ui/index.ts')
  })

  it('returns [] for a repo with no workspaces config at all', async () => {
    const entries = await loadWorkspaceAliasEntries(fixtureReader({ 'package.json': '{}' }), ['package.json'])
    expect(entries).toEqual([])
  })
})
