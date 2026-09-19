import { describe, expect, it } from 'vitest'
import { findUnclassifiedDependencies, isTestOrConfigFile } from '../src/unclassifiedDependencies'
import type { FileVendorSignal } from '../src/vendorResolver'

describe('findUnclassifiedDependencies', () => {
  it('surfaces a bare import that matches no known vendor', () => {
    const signals: FileVendorSignal[] = [{ file: 'src/x.ts', importSpecifiers: ['@acme/widgets'] }]
    const result = findUnclassifiedDependencies(signals, 'me', 'repo')
    expect(result.packages).toEqual([{ name: '@acme/widgets', files: ['src/x.ts'] }])
    expect(result.totalCount).toBe(1)
  })

  it('subtracts a package that IS a known vendor (classified already)', () => {
    const signals: FileVendorSignal[] = [{ file: 'src/x.ts', importSpecifiers: ['stripe'] }]
    expect(findUnclassifiedDependencies(signals, 'me', 'repo').packages).toEqual([])
  })

  it('excludes a devDependencies-only manifest entry', () => {
    const signals: FileVendorSignal[] = [
      { file: 'package.json', manifestDeps: [{ name: '@acme/build-tool', ecosystem: 'npm', isDev: true }] },
    ]
    expect(findUnclassifiedDependencies(signals, 'me', 'repo').packages).toEqual([])
  })

  it('still surfaces a prod (non-dev) manifest entry not in the vendor map', () => {
    const signals: FileVendorSignal[] = [
      { file: 'package.json', manifestDeps: [{ name: '@acme/prod-service', ecosystem: 'npm' }] },
    ]
    expect(findUnclassifiedDependencies(signals, 'me', 'repo').packages).toEqual([
      { name: '@acme/prod-service', files: ['package.json'] },
    ])
  })

  it('excludes packages on the non-service allow-list (react, lodash, tailwind, ...)', () => {
    const signals: FileVendorSignal[] = [{ file: 'src/x.ts', importSpecifiers: ['react', 'lodash', 'tailwindcss'] }]
    expect(findUnclassifiedDependencies(signals, 'me', 'repo').packages).toEqual([])
  })

  it('excludes signals found only in test files', () => {
    const signals: FileVendorSignal[] = [
      { file: 'src/x.test.ts', importSpecifiers: ['@acme/widgets'] },
      { file: 'src/__tests__/y.ts', envVarNames: ['ACME_KEY'] },
    ]
    const result = findUnclassifiedDependencies(signals, 'me', 'repo')
    expect(result.packages).toEqual([])
    expect(result.envVars).toEqual([])
  })

  it('excludes signals found only in config files', () => {
    const signals: FileVendorSignal[] = [{ file: 'vite.config.ts', importSpecifiers: ['@acme/vite-plugin'] }]
    expect(findUnclassifiedDependencies(signals, 'me', 'repo').packages).toEqual([])
  })

  it('subtracts a known env var (ENV_ALIASES) but surfaces an unrecognized one', () => {
    const signals: FileVendorSignal[] = [
      { file: 'src/x.ts', envVarNames: ['STRIPE_SECRET_KEY', 'ACME_WIDGET_TOKEN'] },
    ]
    const result = findUnclassifiedDependencies(signals, 'me', 'repo')
    expect(result.envVars).toEqual([{ name: 'ACME_WIDGET_TOKEN', files: ['src/x.ts'] }])
  })

  it('excludes a host that resolves to a known vendor by statusUrl hostname', () => {
    const signals: FileVendorSignal[] = [{ file: 'src/x.ts', hostnames: ['status.stripe.com'] }]
    expect(findUnclassifiedDependencies(signals, 'me', 'repo').hosts).toEqual([])
  })

  it('excludes localhost/private-IP hosts', () => {
    const signals: FileVendorSignal[] = [{ file: 'src/x.ts', hostnames: ['localhost', '10.0.0.5'] }]
    expect(findUnclassifiedDependencies(signals, 'me', 'repo').hosts).toEqual([])
  })

  it('excludes the repo\'s own domain', () => {
    const signals: FileVendorSignal[] = [{ file: 'src/x.ts', hostnames: ['documenso.com'] }]
    expect(findUnclassifiedDependencies(signals, 'documenso', 'documenso').hosts).toEqual([])
  })

  it('excludes XML-namespace and CDN/font allow-listed hosts', () => {
    const signals: FileVendorSignal[] = [{ file: 'src/x.ts', hostnames: ['w3.org', 'fonts.googleapis.com'] }]
    expect(findUnclassifiedDependencies(signals, 'me', 'repo').hosts).toEqual([])
  })

  it('surfaces a genuinely unrecognized host, with the file that referenced it', () => {
    const signals: FileVendorSignal[] = [{ file: 'src/x.ts', hostnames: ['api.mystery-vendor.io'] }]
    expect(findUnclassifiedDependencies(signals, 'me', 'repo').hosts).toEqual([
      { name: 'api.mystery-vendor.io', files: ['src/x.ts'] },
    ])
  })

  it('aggregates files across multiple signals referencing the same unclassified item', () => {
    const signals: FileVendorSignal[] = [
      { file: 'src/a.ts', importSpecifiers: ['@acme/widgets'] },
      { file: 'src/b.ts', importSpecifiers: ['@acme/widgets'] },
    ]
    const result = findUnclassifiedDependencies(signals, 'me', 'repo')
    expect(result.packages).toEqual([{ name: '@acme/widgets', files: ['src/a.ts', 'src/b.ts'] }])
  })

  it('sorts items by file count descending, then name', () => {
    const signals: FileVendorSignal[] = [
      { file: 'a.ts', importSpecifiers: ['@zeta/pkg'] },
      { file: 'b.ts', importSpecifiers: ['@alpha/pkg'] },
      { file: 'c.ts', importSpecifiers: ['@alpha/pkg'] },
    ]
    const result = findUnclassifiedDependencies(signals, 'me', 'repo')
    expect(result.packages.map((p) => p.name)).toEqual(['@alpha/pkg', '@zeta/pkg'])
  })

  it('totalCount sums packages, envVars, and hosts', () => {
    const signals: FileVendorSignal[] = [
      { file: 'a.ts', importSpecifiers: ['@acme/widgets'], envVarNames: ['ACME_TOKEN'], hostnames: ['acme-api.io'] },
    ]
    expect(findUnclassifiedDependencies(signals, 'me', 'repo').totalCount).toBe(3)
  })
})

describe('isTestOrConfigFile', () => {
  it('matches .test./.spec. files', () => {
    expect(isTestOrConfigFile('src/x.test.ts')).toBe(true)
    expect(isTestOrConfigFile('src/x.spec.tsx')).toBe(true)
  })

  it('matches __tests__ and tests/ directories', () => {
    expect(isTestOrConfigFile('src/__tests__/x.ts')).toBe(true)
    expect(isTestOrConfigFile('tests/x.ts')).toBe(true)
  })

  it('matches known config filenames', () => {
    expect(isTestOrConfigFile('vite.config.ts')).toBe(true)
    expect(isTestOrConfigFile('tsconfig.json')).toBe(true)
    expect(isTestOrConfigFile('frontend/tsconfig.app.json')).toBe(true)
  })

  it('does not match an ordinary source file', () => {
    expect(isTestOrConfigFile('src/api/pay.ts')).toBe(false)
  })
})
