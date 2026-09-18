import type { Vendor } from '../../src/lib/types'
import type { ManifestDependency } from './manifestParser'
import { ENV_ALIASES, VENDOR_MAP } from './vendorMap'

/** @deprecated use `Vendor` from src/lib/types — kept as an alias so existing imports keep working. */
export type DetectedVendor = Vendor

/** The same signal shapes as VendorSignals, but attributed to the file/manifest they were found in. */
export interface FileVendorSignal {
  file: string
  importSpecifiers?: string[]
  envVarNames?: string[]
  manifestDeps?: ManifestDependency[]
}

export interface VendorSignals {
  /** Bare (non-relative) import/require specifiers seen across scanned files. */
  importSpecifiers?: string[]
  /** Env-var names referenced in code or found in a .env/.env.example file. */
  envVarNames?: string[]
  /** Dependencies parsed from package manifests (package.json, requirements.txt, go.mod, ...). */
  manifestDeps?: ManifestDependency[]
  /** Same signal types, attributed per-file — enables drilling down from a vendor to the files that use it. */
  fileSignals?: FileVendorSignal[]
}

/** Matches a bare import specifier against a known vendor key, allowing subpath imports (e.g. "stripe/webhooks"). */
export function matchVendorKey(specifier: string): string | null {
  if (VENDOR_MAP[specifier]) return specifier
  return Object.keys(VENDOR_MAP).find((key) => specifier.startsWith(`${key}/`)) ?? null
}

function record(byKey: Map<string, DetectedVendor>, key: string, via: string, file?: string): void {
  const entry = VENDOR_MAP[key]
  if (!entry) return
  let existing = byKey.get(key)
  if (!existing) {
    existing = { ...entry, key, detectedVia: [], detectedInFiles: [] }
    byKey.set(key, existing)
  }
  if (!existing.detectedVia.includes(via)) existing.detectedVia.push(via)
  if (file && !existing.detectedInFiles.includes(file)) existing.detectedInFiles.push(file)
}

function recordManifestDep(byKey: Map<string, DetectedVendor>, dep: ManifestDependency, file?: string): void {
  const key = matchVendorKey(dep.name)
  if (key) record(byKey, key, `manifest:${dep.ecosystem}:${dep.name}`, file)
}

function recordEnvVar(byKey: Map<string, DetectedVendor>, envVar: string, file?: string): void {
  const key = ENV_ALIASES[envVar]
  if (key) record(byKey, key, `env:${envVar}`, file)
}

function recordImportSpecifier(byKey: Map<string, DetectedVendor>, specifier: string, file?: string): void {
  const key = matchVendorKey(specifier)
  if (key) record(byKey, key, `import:${specifier}`, file)
}

/** Merges import/env/manifest signals (globally and/or per-file) into a deduplicated, provenance-tagged vendor list. */
export function resolveVendors(signals: VendorSignals): DetectedVendor[] {
  const byKey = new Map<string, DetectedVendor>()

  for (const specifier of signals.importSpecifiers ?? []) recordImportSpecifier(byKey, specifier)
  for (const dep of signals.manifestDeps ?? []) recordManifestDep(byKey, dep)
  for (const envVar of signals.envVarNames ?? []) recordEnvVar(byKey, envVar)

  for (const fileSignal of signals.fileSignals ?? []) {
    for (const specifier of fileSignal.importSpecifiers ?? []) {
      recordImportSpecifier(byKey, specifier, fileSignal.file)
    }
    for (const dep of fileSignal.manifestDeps ?? []) recordManifestDep(byKey, dep, fileSignal.file)
    for (const envVar of fileSignal.envVarNames ?? []) recordEnvVar(byKey, envVar, fileSignal.file)
  }

  return [...byKey.values()].sort((a, b) => a.vendor.localeCompare(b.vendor))
}
