import type { UnclassifiedItem, UnclassifiedSummary } from '../../src/lib/types'
import { IGNORED_HOSTS, isPrivateOrLocalHost, looksLikeOwnDomain } from './hostScanner'
import { matchVendorByHostname, matchVendorKey, type FileVendorSignal } from './vendorResolver'
import { ENV_ALIASES } from './vendorMap'

/**
 * Small, curated, and reviewable on purpose — packages that are clearly framework/tooling/UI
 * primitives, never a third-party SERVICE with its own availability/vendor-risk story. Anything not
 * on this list is surfaced, not silently dropped — the point of this whole feature is to not hide
 * what we don't recognize.
 */
export const NON_SERVICE_PACKAGE_ALLOWLIST = new Set([
  // Frameworks / runtime
  'react', 'react-dom', 'react-router-dom', 'react-router', 'next', 'vue', 'svelte', 'solid-js',
  'express', 'fastify', 'koa', 'hono',
  // Styling
  'tailwindcss', 'postcss', 'autoprefixer', 'sass', 'less', 'styled-components', 'clsx', 'classnames',
  '@tailwindcss/vite', '@tailwindcss/postcss',
  // Utilities (no network calls of their own)
  'lodash', 'lodash.debounce', 'lodash.throttle', 'lodash.merge', 'ramda', 'date-fns', 'dayjs',
  'moment', 'uuid', 'zod', 'yup', 'immer', 'nanoid', 'clsx',
  // Build / tooling
  'typescript', 'vite', 'webpack', 'esbuild', 'rollup', 'babel-loader', '@babel/core', 'eslint',
  'prettier', 'tsx', 'ts-node', 'cross-env', 'dotenv', 'concurrently', 'nodemon', 'husky',
  'lint-staged',
  // Testing
  'jest', 'vitest', 'mocha', 'chai', '@testing-library/react', '@testing-library/jest-dom',
  '@testing-library/user-event', 'playwright', '@playwright/test', 'cypress', 'supertest',
  // Icons / UI primitives / animation (client-side only, no service behind them)
  'lucide-react', 'react-icons', '@radix-ui/react-slot', 'framer-motion', 'react-hook-form',
  'motion',
])

const TEST_OR_CONFIG_FILE = new RegExp(
  [
    String.raw`(\.(test|spec)\.[jt]sx?$)`,
    String.raw`((^|/)__tests__/)`,
    String.raw`((^|/)(tests?|e2e)/)`,
    String.raw`((^|/)(vite|vitest|webpack|babel|jest|tailwind|postcss|eslint|next|rollup)\.config\.[cm]?[jt]s$)`,
    String.raw`((^|/)\.eslintrc(\.[a-zA-Z]+)?$)`,
    String.raw`((^|/)(tsconfig|jsconfig)(\.[a-zA-Z0-9.-]+)?\.json$)`,
  ].join('|'),
)

export function isTestOrConfigFile(path: string): boolean {
  return TEST_OR_CONFIG_FILE.test(path)
}

function topLevelPackageName(specifier: string): string {
  const parts = specifier.split('/')
  if (specifier.startsWith('@') && parts.length >= 2) return `${parts[0]}/${parts[1]}`
  return parts[0]
}

function addTo(map: Map<string, Set<string>>, name: string, file: string): void {
  if (!map.has(name)) map.set(name, new Set())
  map.get(name)!.add(file)
}

function toSortedItems(map: Map<string, Set<string>>): UnclassifiedItem[] {
  return [...map.entries()]
    .map(([name, files]) => ({ name, files: [...files].sort() }))
    .sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name))
}

/**
 * Surfaces what the curated vendor map (~33 entries) does NOT recognize: packages, env vars, and
 * hostnames found during the scan that never resolved to a known vendor. Excludes devDependencies,
 * test/config files, and NON_SERVICE_PACKAGE_ALLOWLIST — noise, not signal. Deliberately returns a
 * SEPARATE object from vendor detection: nothing here is a Vendor, and nothing here is meant to
 * ever be merged into vendor counts, substrates, or availability math (see buildGraphFromSource,
 * which keeps this on its own `unclassified` field, never inside `vendors`).
 */
export function findUnclassifiedDependencies(
  fileSignals: FileVendorSignal[],
  owner: string,
  repo: string,
): UnclassifiedSummary {
  const packages = new Map<string, Set<string>>()
  const envVars = new Map<string, Set<string>>()
  const hosts = new Map<string, Set<string>>()

  for (const signal of fileSignals) {
    const file = signal.file
    if (isTestOrConfigFile(file)) continue

    for (const specifier of signal.importSpecifiers ?? []) {
      const name = topLevelPackageName(specifier)
      if (matchVendorKey(specifier)) continue
      if (NON_SERVICE_PACKAGE_ALLOWLIST.has(name)) continue
      addTo(packages, name, file)
    }

    for (const dep of signal.manifestDeps ?? []) {
      if (dep.isDev) continue
      if (matchVendorKey(dep.name)) continue
      if (NON_SERVICE_PACKAGE_ALLOWLIST.has(dep.name)) continue
      addTo(packages, dep.name, file)
    }

    for (const envVar of signal.envVarNames ?? []) {
      if (ENV_ALIASES[envVar]) continue
      addTo(envVars, envVar, file)
    }

    for (const host of signal.hostnames ?? []) {
      if (isPrivateOrLocalHost(host)) continue
      if (IGNORED_HOSTS.has(host)) continue
      if (looksLikeOwnDomain(host, owner, repo)) continue
      if (matchVendorByHostname(host)) continue
      addTo(hosts, host, file)
    }
  }

  const packageItems = toSortedItems(packages)
  const envVarItems = toSortedItems(envVars)
  const hostItems = toSortedItems(hosts)

  return {
    packages: packageItems,
    envVars: envVarItems,
    hosts: hostItems,
    totalCount: packageItems.length + envVarItems.length + hostItems.length,
  }
}
