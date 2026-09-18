import type { ConcentrationResult, IacSubstrateSignal, SubstrateConcentration, Vendor } from './types'

const APP_INFRA_KEY = '__app_infra__'
const APP_INFRA_NAME = 'Your application infrastructure'

/**
 * Groups vendors by shared hosting substrate to answer "how many independent vendors do you
 * really have?" IaC substrate signals (from Terraform/serverless.yml/vercel.json) are folded in
 * as a single "Your application infrastructure" entry, distinct from third-party vendors, since
 * a Terraform resource is not itself a vendor — it's evidence of where *your own* app runs.
 */
export function analyzeConcentration(vendors: Vendor[], iacSubstrates: IacSubstrateSignal[] = []): ConcentrationResult {
  const bySubstrate = new Map<string, { vendorKeys: Set<string>; vendorNames: Set<string> }>()

  function addToSubstrate(substrate: string, key: string, name: string): void {
    if (!bySubstrate.has(substrate)) bySubstrate.set(substrate, { vendorKeys: new Set(), vendorNames: new Set() })
    const entry = bySubstrate.get(substrate)!
    entry.vendorKeys.add(key)
    entry.vendorNames.add(name)
  }

  for (const vendor of vendors) {
    for (const substrate of vendor.substrate) addToSubstrate(substrate, vendor.key, vendor.vendor)
  }

  const infraProviders = new Set(iacSubstrates.map((s) => s.provider).filter((p) => p !== 'other'))
  for (const provider of infraProviders) addToSubstrate(provider, APP_INFRA_KEY, APP_INFRA_NAME)

  // "Things" sharing substrates = detected vendors, plus your own infrastructure as one more entity
  // if IaC evidence exists for it. Share is relative to this total, not just the vendor count.
  const totalEntities = vendors.length + (infraProviders.size > 0 ? 1 : 0)

  const bySubstrateRows: SubstrateConcentration[] = [...bySubstrate.entries()]
    .map(([substrate, { vendorKeys, vendorNames }]) => ({
      substrate,
      vendorKeys: [...vendorKeys],
      vendorNames: [...vendorNames],
      share: totalEntities > 0 ? vendorKeys.size / totalEntities : 0,
    }))
    .sort((a, b) => b.share - a.share || b.vendorKeys.length - a.vendorKeys.length)

  return {
    vendorCount: vendors.length,
    substrateCount: bySubstrate.size,
    bySubstrate: bySubstrateRows,
    mostConcentrated: bySubstrateRows[0] ?? null,
  }
}
