// Pure validation logic for the vendor knowledge base — no I/O. scripts/validate-kb.ts loads
// vendors/*.json from disk and calls these functions; tests call them directly with fixtures.

import type { VendorKbEntry } from '../lib/types'

export interface KbValidationError {
  vendorId: string
  message: string
}

function err(vendorId: string, message: string): KbValidationError {
  return { vendorId, message }
}

const CATEGORIES = new Set(['auth', 'payments', 'data', 'email', 'observability', 'ai', 'messaging', 'analytics', 'search', 'maps', 'storage'])
const CONFIDENCES = new Set(['verified', 'reported', 'unknown'])
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HTTPS_PATTERN = /^https:\/\//
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/

function isHttpsUrl(v: unknown): v is string {
  return typeof v === 'string' && HTTPS_PATTERN.test(v)
}

/**
 * Validates ONE vendor record against the shape vendors/schema.json describes (required fields,
 * types, enums, https-only URLs) — a hand-written equivalent of a JSON-Schema validator, scoped
 * exactly to this one schema, so this doesn't need a new dependency for something this small.
 * `filename` is passed separately so the id-matches-filename check can run here too.
 */
export function validateVendorSchema(raw: unknown, filename: string): KbValidationError[] {
  const errors: KbValidationError[] = []
  const idForErrors = filename.replace(/\.json$/, '')
  const add = (message: string) => errors.push(err(idForErrors, message))

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    add('must be a JSON object')
    return errors
  }
  const v = raw as Record<string, unknown>

  const required = ['id', 'name', 'category', 'aliases', 'packages', 'envPrefixes', 'hosts', 'statusFeed', 'substrate', 'sla', 'alternatives']
  for (const key of required) {
    if (!(key in v)) add(`missing required field "${key}"`)
  }

  if (typeof v.id !== 'string' || !ID_PATTERN.test(v.id)) {
    add(`"id" must be kebab-case (got ${JSON.stringify(v.id)})`)
  } else if (`${v.id}.json` !== filename) {
    add(`"id" (${v.id}) does not match filename (${filename})`)
  }

  if (typeof v.name !== 'string' || v.name.length === 0) add('"name" must be a non-empty string')
  if (typeof v.category !== 'string' || !CATEGORIES.has(v.category)) add(`"category" must be one of: ${[...CATEGORIES].join(', ')}`)

  if (!Array.isArray(v.aliases) || v.aliases.some((a) => typeof a !== 'string' || a.length === 0)) {
    add('"aliases" must be an array of non-empty strings')
  }

  if (typeof v.packages !== 'object' || v.packages === null) {
    add('"packages" must be an object')
  } else {
    const packages = v.packages as Record<string, unknown>
    for (const eco of ['npm', 'pypi', 'go', 'gem', 'maven']) {
      const val = packages[eco]
      if (val !== null && (typeof val !== 'string' || val.length === 0)) add(`"packages.${eco}" must be a non-empty string or null`)
    }
  }

  if (!Array.isArray(v.envPrefixes) || v.envPrefixes.some((p) => typeof p !== 'string' || p.length === 0)) {
    add('"envPrefixes" must be an array of non-empty strings')
  }
  if (!Array.isArray(v.hosts) || v.hosts.some((h) => typeof h !== 'string' || h.length === 0)) {
    add('"hosts" must be an array of non-empty strings')
  }

  if (v.statusFeed !== null) {
    if (typeof v.statusFeed !== 'object' || v.statusFeed === null) {
      add('"statusFeed" must be null or an object')
    } else {
      const sf = v.statusFeed as Record<string, unknown>
      if (sf.kind !== 'statuspage' && sf.kind !== 'other') add('"statusFeed.kind" must be "statuspage" or "other"')
      if (!isHttpsUrl(sf.url)) add('"statusFeed.url" must be an https:// URL')
    }
  }

  if (!Array.isArray(v.substrate)) {
    add('"substrate" must be an array')
  } else {
    v.substrate.forEach((s, i) => {
      if (typeof s !== 'object' || s === null) {
        add(`substrate[${i}] must be an object`)
        return
      }
      const entry = s as Record<string, unknown>
      if (typeof entry.value !== 'string' || entry.value.length === 0) add(`substrate[${i}].value must be a non-empty string`)
      if (typeof entry.confidence !== 'string' || !CONFIDENCES.has(entry.confidence)) {
        add(`substrate[${i}].confidence must be one of: verified, reported, unknown`)
      }
      if (!Array.isArray(entry.evidence)) {
        add(`substrate[${i}].evidence must be an array`)
      } else {
        entry.evidence.forEach((e, j) => {
          if (typeof e !== 'object' || e === null) {
            add(`substrate[${i}].evidence[${j}] must be an object`)
            return
          }
          const ev = e as Record<string, unknown>
          if (!isHttpsUrl(ev.url)) add(`substrate[${i}].evidence[${j}].url must be an https:// URL`)
          if (typeof ev.note !== 'string' || ev.note.length === 0) add(`substrate[${i}].evidence[${j}].note must be a non-empty string`)
          if (typeof ev.retrievedAt !== 'string' || !DATE_PATTERN.test(ev.retrievedAt)) {
            add(`substrate[${i}].evidence[${j}].retrievedAt must be a YYYY-MM-DD date`)
          }
        })
      }
    })
  }

  if (v.sla !== null) {
    if (typeof v.sla !== 'object' || v.sla === null) {
      add('"sla" must be null or an object')
    } else {
      const sla = v.sla as Record<string, unknown>
      if (typeof sla.value !== 'number' || sla.value <= 0 || sla.value > 1) add('"sla.value" must be a number in (0, 1]')
      if (sla.sourceUrl !== null && !isHttpsUrl(sla.sourceUrl)) add('"sla.sourceUrl" must be null or an https:// URL')
      if (sla.retrievedAt !== null && (typeof sla.retrievedAt !== 'string' || !DATE_PATTERN.test(sla.retrievedAt))) {
        add('"sla.retrievedAt" must be null or a YYYY-MM-DD date')
      }
    }
  }

  if (!Array.isArray(v.alternatives) || v.alternatives.some((a) => typeof a !== 'string' || !ID_PATTERN.test(a))) {
    add('"alternatives" must be an array of kebab-case vendor ids')
  }

  return errors
}

function detectionKeysFor(v: VendorKbEntry): string[] {
  const packageNames = [v.packages.npm, v.packages.pypi, v.packages.go, v.packages.gem, v.packages.maven].filter(
    (k): k is string => k !== null,
  )
  return [...new Set([...packageNames, ...v.aliases])]
}

/**
 * Cross-vendor checks that need the full set: unique ids, no package/alias claimed by two
 * vendors (the thing that would silently make one overwrite the other in VENDOR_MAP), no env
 * prefix claimed by two vendors, every substrate confidence other than "unknown" has evidence,
 * every alternatives[] id resolves to a real vendor.
 */
export function validateVendorKbCrossReferences(vendors: VendorKbEntry[]): KbValidationError[] {
  const errors: KbValidationError[] = []
  const knownIds = new Set(vendors.map((v) => v.id))

  const seenIds = new Map<string, string>() // id -> first vendor id that claimed it (itself, for ids)
  for (const v of vendors) {
    if (seenIds.has(v.id)) errors.push(err(v.id, `duplicate id (also used by ${seenIds.get(v.id)})`))
    else seenIds.set(v.id, v.id)
  }

  const detectionKeyOwner = new Map<string, string>()
  for (const v of vendors) {
    for (const key of detectionKeysFor(v)) {
      const owner = detectionKeyOwner.get(key)
      if (owner && owner !== v.id) {
        errors.push(err(v.id, `package/alias "${key}" is also claimed by "${owner}" — a detection key must belong to exactly one vendor`))
      } else {
        detectionKeyOwner.set(key, v.id)
      }
    }
  }

  const envPrefixOwner = new Map<string, string>()
  for (const v of vendors) {
    for (const prefix of v.envPrefixes) {
      const owner = envPrefixOwner.get(prefix)
      if (owner && owner !== v.id) {
        errors.push(err(v.id, `env prefix "${prefix}" is also claimed by "${owner}" — an env prefix must belong to exactly one vendor`))
      } else {
        envPrefixOwner.set(prefix, v.id)
      }
    }
  }

  for (const v of vendors) {
    for (const s of v.substrate) {
      if (s.confidence !== 'unknown' && s.evidence.length === 0) {
        errors.push(err(v.id, `substrate "${s.value}" has confidence "${s.confidence}" but no evidence — either add an evidence URL or set confidence to "unknown"`))
      }
      if (s.confidence === 'unknown' && s.evidence.length > 0) {
        errors.push(err(v.id, `substrate "${s.value}" has confidence "unknown" but lists evidence — evidence implies it isn't actually unknown`))
      }
    }
    for (const altId of v.alternatives) {
      if (!knownIds.has(altId)) errors.push(err(v.id, `alternatives references unknown vendor id "${altId}"`))
    }
  }

  return errors
}

export function formatKbValidationErrors(errors: KbValidationError[]): string {
  return errors.map((e) => `  ${e.vendorId}: ${e.message}`).join('\n')
}
