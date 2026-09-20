/**
 * Validates vendors/*.json against vendors/schema.json plus the cross-vendor invariants (unique
 * ids/aliases, no package or env prefix claimed twice, https-only URLs, evidence required unless
 * confidence is "unknown", alternatives must exist). Run in CI on every PR touching vendors/**.
 *
 * Usage: tsx scripts/validate-kb.ts   (also: npm run kb:check, which also verifies
 * src/data/vendors.generated.ts is up to date with vendors/*.json)
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { VendorKbEntry } from '../src/lib/types'
import { formatKbValidationErrors, validateVendorKbCrossReferences, validateVendorSchema } from '../src/engine/vendorKbValidation'

const VENDORS_DIR = path.join(import.meta.dirname, '..', 'vendors')

async function main() {
  const files = (await readdir(VENDORS_DIR)).filter((f) => f.endsWith('.json') && f !== 'schema.json').sort()
  if (files.length === 0) {
    console.error('No vendor files found in vendors/ — expected at least one vendors/<id>.json.')
    process.exitCode = 1
    return
  }

  const schemaErrors = []
  const vendors: VendorKbEntry[] = []
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(VENDORS_DIR, file), 'utf-8'))
    const errors = validateVendorSchema(raw, file)
    schemaErrors.push(...errors)
    if (errors.length === 0) vendors.push(raw as VendorKbEntry)
  }

  const crossErrors = vendors.length === files.length ? validateVendorKbCrossReferences(vendors) : []
  const allErrors = [...schemaErrors, ...crossErrors]

  if (allErrors.length > 0) {
    console.error(`${allErrors.length} vendor knowledge-base problem(s):\n${formatKbValidationErrors(allErrors)}`)
    process.exitCode = 1
    return
  }

  console.log(`${vendors.length} vendor file(s) valid.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
