import { describe, expect, it } from 'vitest'
import { inferProjectEntrypoints } from './entrypoints'

describe('inferProjectEntrypoints', () => {
  it('detects Next.js App Router special files at both root and nested depths', () => {
    const nodeIds = [
      'app/page.tsx',
      'app/layout.tsx',
      'app/dashboard/settings/page.tsx',
      'app/api/users/route.ts',
      'app/loading.tsx',
      'app/error.tsx',
      'app/not-found.tsx',
      'app/template.tsx',
      'app/dashboard/components/Widget.tsx', // NOT an entrypoint — just a regular component
    ]
    const result = inferProjectEntrypoints(nodeIds)
    expect(result).toEqual(nodeIds.filter((id) => id !== 'app/dashboard/components/Widget.tsx'))
  })

  it('detects Next.js Pages Router files, including pages/api/**', () => {
    const nodeIds = ['pages/index.tsx', 'pages/about.tsx', 'pages/api/users.ts', 'src/notPages.ts']
    expect(inferProjectEntrypoints(nodeIds)).toEqual(['pages/index.tsx', 'pages/about.tsx', 'pages/api/users.ts'])
  })

  it('detects middleware/proxy at the project root or one directory in (e.g. a monorepo app)', () => {
    const nodeIds = ['middleware.ts', 'frontend/middleware.ts', 'proxy.ts']
    expect(inferProjectEntrypoints(nodeIds)).toEqual(nodeIds)
  })

  it('does not treat a deeply nested file merely named middleware.ts as the Next.js convention', () => {
    const nodeIds = ['src/server/utils/middleware.ts']
    expect(inferProjectEntrypoints(nodeIds)).toEqual([])
  })

  it('detects a Vite src/main entrypoint', () => {
    const nodeIds = ['src/main.tsx', 'src/main.ts', 'src/App.tsx']
    expect(inferProjectEntrypoints(nodeIds)).toEqual(['src/main.tsx', 'src/main.ts'])
  })

  it('excludes test files even when they would otherwise match a route pattern', () => {
    const nodeIds = ['app/page.test.tsx', 'pages/__tests__/index.tsx', 'app/page.tsx']
    expect(inferProjectEntrypoints(nodeIds)).toEqual(['app/page.tsx'])
  })

  it('returns [] for a repo following none of these conventions', () => {
    expect(inferProjectEntrypoints(['src/index.ts', 'src/utils.ts'])).toEqual([])
  })
})
