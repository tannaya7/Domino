/**
 * Reads vendors/*.json and writes src/data/vendors.generated.ts — the ONLY place VENDOR_MAP /
 * ENV_ALIASES / the vendor knowledge base are defined at runtime. The running app never reads
 * vendors/*.json itself (no runtime file I/O); this generated module is statically imported like
 * any other source file, exactly like every other generated-data file in this repo.
 *
 * Deterministic: same vendors/*.json content always produces byte-identical output (vendors are
 * sorted by id, object keys are written in a fixed order) — a CI check can diff the output to
 * catch a stale generated file.
 *
 * Usage: tsx scripts/generate-vendor-map.ts   (also: npm run kb:generate)
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import type { VendorEntry, VendorKbEntry } from '../src/lib/types'

const VENDORS_DIR = path.join(import.meta.dirname, '..', 'vendors')
const OUT_PATH = path.join(import.meta.dirname, '..', 'src', 'data', 'vendors.generated.ts')

export async function loadVendorKbEntries(): Promise<VendorKbEntry[]> {
  const files = (await readdir(VENDORS_DIR)).filter((f) => f.endsWith('.json') && f !== 'schema.json').sort()
  const vendors: VendorKbEntry[] = []
  for (const file of files) {
    const raw = await readFile(path.join(VENDORS_DIR, file), 'utf-8')
    const entry = JSON.parse(raw) as VendorKbEntry
    if (`${entry.id}.json` !== file) throw new Error(`vendors/${file}: id "${entry.id}" does not match its filename`)
    vendors.push(entry)
  }
  return vendors.sort((a, b) => a.id.localeCompare(b.id))
}

function detectionKeysFor(v: VendorKbEntry): string[] {
  const packageNames = [v.packages.npm, v.packages.pypi, v.packages.go, v.packages.gem, v.packages.maven].filter(
    (k): k is string => k !== null,
  )
  return [...new Set([...packageNames, ...v.aliases])]
}

function toVendorEntry(v: VendorKbEntry, byId: Map<string, VendorKbEntry>): VendorEntry {
  if (v.sla === null) throw new Error(`vendors/${v.id}.json: sla is null — VendorEntry.sla is required at runtime; add a value first`)
  const entry: VendorEntry = {
    vendor: v.name,
    tier: v.category,
    substrate: v.substrate.map((s) => s.value),
    sla: v.sla.value,
  }
  if (v.statusFeed) entry.statusUrl = v.statusFeed.url
  if (v.alternatives.length > 0) {
    entry.fallbacks = v.alternatives.map((id) => {
      const alt = byId.get(id)
      if (!alt) throw new Error(`vendors/${v.id}.json: alternatives references unknown id "${id}"`)
      return alt.name
    })
  }
  return entry
}

/** Builds VENDOR_MAP (keyed by every detection string: packages.npm/pypi/go/gem/maven + aliases)
 * and ENV_ALIASES (keyed by every envPrefixes entry, pointing at the vendor's primary npm key —
 * same target every alias key would resolve to, since they share one VendorEntry). */
export function buildLegacyShapes(vendors: VendorKbEntry[]): { vendorMap: Record<string, VendorEntry>; envAliases: Record<string, string> } {
  const byId = new Map(vendors.map((v) => [v.id, v]))
  const vendorMap: Record<string, VendorEntry> = {}
  const envAliases: Record<string, string> = {}

  for (const v of vendors) {
    const entry = toVendorEntry(v, byId)
    const primaryKey = v.packages.npm ?? detectionKeysFor(v)[0]
    if (!primaryKey) throw new Error(`vendors/${v.id}.json: no detection key at all (no packages, no aliases)`)
    for (const key of detectionKeysFor(v)) vendorMap[key] = entry
    for (const envVar of v.envPrefixes) envAliases[envVar] = primaryKey
  }

  return { vendorMap, envAliases }
}

function kbVersion(vendors: VendorKbEntry[]): string {
  const hash = createHash('sha256').update(JSON.stringify(vendors)).digest('hex').slice(0, 10)
  return hash
}

/** The most recent date any vendor's data was actually touched (an evidence retrievedAt, or an sla
 * retrievedAt) — a function of the vendor data itself, not wall-clock time, so regenerating this
 * file from unchanged vendors/*.json always produces byte-identical output (see the determinism
 * test). "Never generated/verified" data has no date at all and can't contribute one. */
function kbLastUpdated(vendors: VendorKbEntry[]): string | null {
  const dates = vendors.flatMap((v) => [
    ...v.substrate.flatMap((s) => s.evidence.map((e) => e.retrievedAt)),
    ...(v.sla?.retrievedAt ? [v.sla.retrievedAt] : []),
  ])
  return dates.length > 0 ? dates.sort().at(-1)! : null
}

function tsLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

async function main() {
  const vendors = await loadVendorKbEntries()
  const { vendorMap, envAliases } = buildLegacyShapes(vendors)
  const version = kbVersion(vendors)
  const lastUpdated = kbLastUpdated(vendors)

  const header = `// GENERATED FILE — do not edit by hand. Source of truth: vendors/*.json (see CONTRIBUTING.md).
// Regenerate with: npm run kb:generate (also runs automatically in npm run kb:check / CI).
//
// This is the ONLY place VENDOR_MAP / ENV_ALIASES / the vendor knowledge base are defined at
// runtime — the app never reads vendors/*.json itself at runtime, only this compiled module.

import type { VendorEntry, VendorKbEntry } from '../lib/types'
`

  const body = `
/** Keyed by the npm/pypi/go/gem/maven package name (or alias) most commonly imported/required. */
export const VENDOR_MAP: Record<string, VendorEntry> = ${tsLiteral(vendorMap)}

/** Maps env-var names to the VENDOR_MAP key they imply. */
export const ENV_ALIASES: Record<string, string> = ${tsLiteral(envAliases)}

/** Every vendor's full knowledge-base record (evidence, confidence, hosts, alternatives, ...),
 * keyed by its stable id — see vendors/<id>.json and vendors/schema.json. */
export const VENDOR_KB: Record<string, VendorKbEntry> = ${tsLiteral(Object.fromEntries(vendors.map((v) => [v.id, v])))}

/** Same knowledge-base records, keyed by every VENDOR_MAP detection key instead of by id — so UI
 * code that already has a detected Vendor.key can look up its KB record directly. */
export const VENDOR_KB_BY_DETECTION_KEY: Record<string, VendorKbEntry> = ${tsLiteral(
    Object.fromEntries(vendors.flatMap((v) => detectionKeysFor(v).map((key) => [key, v]))),
  )}

/** A short content hash of vendors/*.json — changes only when the data actually changes. */
export const KB_VERSION = ${tsLiteral(version)}
/** The most recent evidence/SLA retrievedAt date across all vendors, or null if none has one yet. */
export const KB_LAST_UPDATED = ${tsLiteral(lastUpdated)}
`

  const output = header + body

  if (process.argv.includes('--check')) {
    const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf-8') : null
    if (current !== output) {
      console.error(`${OUT_PATH} is stale — run \`npm run kb:generate\` and commit the result.`)
      process.exitCode = 1
      return
    }
    console.log(`${OUT_PATH} is up to date (KB version ${version}).`)
    return
  }

  await writeFile(OUT_PATH, output)
  console.log(`Wrote ${OUT_PATH}`)
  console.log(`  ${vendors.length} vendors -> ${Object.keys(vendorMap).length} VENDOR_MAP keys, ${Object.keys(envAliases).length} ENV_ALIASES keys, KB version ${version}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
