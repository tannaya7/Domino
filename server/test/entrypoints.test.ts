import { describe, expect, it } from 'vitest'
import { inferEntrypointsForRepo, resolveManifestEntrypoints } from '../src/entrypoints'

describe('resolveManifestEntrypoints', () => {
  it('resolves package.json "main" to a tracked file', () => {
    const known = new Set(['src/index.ts'])
    const manifest = [{ path: 'package.json', content: JSON.stringify({ main: './src/index.ts' }) }]
    expect(resolveManifestEntrypoints(manifest, known)).toEqual(['src/index.ts'])
  })

  it('resolves a string "bin" entry', () => {
    const known = new Set(['bin/cli.js'])
    const manifest = [{ path: 'package.json', content: JSON.stringify({ bin: './bin/cli.js' }) }]
    expect(resolveManifestEntrypoints(manifest, known)).toEqual(['bin/cli.js'])
  })

  it('resolves every entry of an object-form "bin" map', () => {
    const known = new Set(['bin/a.js', 'bin/b.js'])
    const manifest = [{ path: 'package.json', content: JSON.stringify({ bin: { a: './bin/a.js', b: './bin/b.js' } }) }]
    expect(resolveManifestEntrypoints(manifest, known).sort()).toEqual(['bin/a.js', 'bin/b.js'])
  })

  it('resolves relative to the manifest’s own directory in a monorepo', () => {
    const known = new Set(['packages/cli/src/index.ts'])
    const manifest = [{ path: 'packages/cli/package.json', content: JSON.stringify({ main: './src/index.ts' }) }]
    expect(resolveManifestEntrypoints(manifest, known)).toEqual(['packages/cli/src/index.ts'])
  })

  it('skips a main/bin target that does not resolve to any tracked file', () => {
    const manifest = [{ path: 'package.json', content: JSON.stringify({ main: './does-not-exist.ts' }) }]
    expect(resolveManifestEntrypoints(manifest, new Set())).toEqual([])
  })

  it('skips a malformed package.json instead of throwing', () => {
    const manifest = [{ path: 'package.json', content: 'not json' }]
    expect(resolveManifestEntrypoints(manifest, new Set())).toEqual([])
  })

  it('ignores a non-package.json manifest file', () => {
    const manifest = [{ path: 'requirements.txt', content: 'flask==2.0' }]
    expect(resolveManifestEntrypoints(manifest, new Set())).toEqual([])
  })
})

describe('inferEntrypointsForRepo', () => {
  it('merges pattern-based and manifest-based entrypoints, deduplicated', () => {
    const nodeIds = ['app/page.tsx', 'src/index.ts']
    const manifestFiles = [{ path: 'package.json', content: JSON.stringify({ main: './src/index.ts' }) }]
    const known = new Set(['src/index.ts'])
    const result = inferEntrypointsForRepo(nodeIds, manifestFiles, known)
    expect(result.sort()).toEqual(['app/page.tsx', 'src/index.ts'])
  })

  it('returns [] when neither source finds anything', () => {
    expect(inferEntrypointsForRepo(['src/util.ts'], [], new Set())).toEqual([])
  })
})
