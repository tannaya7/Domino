import type { Vendor, VendorKbEntry } from '../../src/lib/types'
import { VENDOR_KB } from '../../src/data/vendors.generated'
import type { ManifestDependency } from './manifestParser'
import { ENV_ALIASES, VENDOR_MAP } from './vendorMap'

/** The KB entry's own package name, in the same ecosystem-preference order the generator uses to
 * pick a `primaryKey` — this is the string a KB entry is actually reachable at in VENDOR_MAP. Null
 * when the entry has no package in any ecosystem (host/env-only detection can't attach a
 * severity/tier/SLA from VENDOR_MAP for it today — a narrow, documented limitation, not a bug). */
function vendorMapKeyForKbEntry(entry: VendorKbEntry): string | null {
  return entry.packages.npm ?? entry.packages.pypi ?? entry.packages.go ?? entry.packages.gem ?? entry.packages.maven ?? null
}

/** @deprecated use `Vendor` from src/lib/types — kept as an alias so existing imports keep working. */
export type DetectedVendor = Vendor

/** The same signal shapes as VendorSignals, but attributed to the file/manifest they were found in. */
export interface FileVendorSignal {
  file: string
  importSpecifiers?: string[]
  envVarNames?: string[]
  manifestDeps?: ManifestDependency[]
  /** Hostnames found in `https://<host>` string literals in this file — see hostScanner.ts. */
  hostnames?: string[]
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

/** Matches an env var name against the KB's envPrefixes — a real PREFIX match (`envVar.startsWith`),
 * not the exact-only match this used to be: the schema itself documents envPrefixes as "today:
 * exact names, each trivially a valid prefix of itself" — this makes that prefix semantics real, so
 * an env var like "GEMINI_API_KEY" matches a KB entry whose envPrefixes includes "GEMINI_", the
 * moment that entry (with real evidence) exists — never fabricated for a vendor that isn't curated. */
export function matchVendorByEnvPrefix(envVar: string): string | null {
  const prefix = Object.keys(ENV_ALIASES).find((p) => envVar.startsWith(p))
  return prefix ? ENV_ALIASES[prefix] : null
}

let hostnameIndexCache: Map<string, string> | null = null
let wildcardHostIndexCache: Array<{ suffix: string; key: string }> | null = null

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function buildHostnameIndexes(): void {
  hostnameIndexCache = new Map()
  wildcardHostIndexCache = []
  // Narrow but real: each curated entry's `statusUrl` host (e.g. "status.stripe.com") — often a
  // different host from the one actual API calls use ("api.stripe.com"), so this alone only fires
  // when code happens to literally reference the status host.
  for (const [key, entry] of Object.entries(VENDOR_MAP)) {
    if (!entry.statusUrl) continue
    const host = hostnameFromUrl(entry.statusUrl)
    if (host) hostnameIndexCache.set(host, key)
  }
  // Broader, evidence-backed signal: the KB's own curated `hosts[]` — real global API hostnames
  // (see vendors/schema.json), not guessed. `*.suffix` entries match any subdomain.
  for (const entry of Object.values(VENDOR_KB)) {
    const key = vendorMapKeyForKbEntry(entry)
    if (!key || !VENDOR_MAP[key]) continue
    for (const host of entry.hosts) {
      const lower = host.toLowerCase()
      if (lower.startsWith('*.')) wildcardHostIndexCache.push({ suffix: lower.slice(1), key })
      else if (!hostnameIndexCache.has(lower)) hostnameIndexCache.set(lower, key)
    }
  }
}

/**
 * Maps a hostname to a vendor key, from two curated sources: each vendor's `statusUrl` host, and
 * the KB's own `hosts[]` (exact or `*.suffix` wildcard) — see vendors/<id>.json. Only ever a vendor
 * that already exists in VENDOR_MAP (needed to attach tier/SLA/substrate); a KB entry with no
 * package in any ecosystem can't be attached this way today — a narrow, documented limitation, not
 * a fabricated match.
 */
export function matchVendorByHostname(host: string): string | null {
  if (!hostnameIndexCache || !wildcardHostIndexCache) buildHostnameIndexes()
  const lower = host.toLowerCase()
  const exact = hostnameIndexCache!.get(lower)
  if (exact) return exact
  const wildcard = wildcardHostIndexCache!.find((w) => lower.endsWith(w.suffix))
  return wildcard?.key ?? null
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
  const key = matchVendorByEnvPrefix(envVar)
  if (key) record(byKey, key, `env:${envVar}`, file)
}

function recordImportSpecifier(byKey: Map<string, DetectedVendor>, specifier: string, file?: string): void {
  const key = matchVendorKey(specifier)
  if (key) record(byKey, key, `import:${specifier}`, file)
}

function recordHostname(byKey: Map<string, DetectedVendor>, host: string, file?: string): void {
  const key = matchVendorByHostname(host)
  if (key) record(byKey, key, `hostname:${host}`, file)
}

/** Merges import/env/manifest/hostname signals (globally and/or per-file) into a deduplicated,
 * provenance-tagged vendor list. */
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
    for (const host of fileSignal.hostnames ?? []) recordHostname(byKey, host, fileSignal.file)
  }

  return [...byKey.values()].sort((a, b) => a.vendor.localeCompare(b.vendor))
}
