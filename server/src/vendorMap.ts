// Curated knowledge base mapping package names / env-var keys to the third-party vendor they
// belong to. This is intentionally curated, not dynamically discovered — accuracy here is the
// whole point. `substrate` is a coarse hosting-provider tag (not a specific region), because exact
// regions aren't reliably publishable/verifiable for most vendors; SLA and substrate are both
// editable per-node once surfaced in the UI, not treated as ground truth.
//
// The data itself now lives in vendors/*.json (with evidence, confidence, and a schema — see
// CONTRIBUTING.md), compiled into src/data/vendors.generated.ts by scripts/generate-vendor-map.ts.
// This file is just the same stable import path every existing consumer already uses.

export type { VendorEntry, VendorTier } from '../../src/lib/types'
export { ENV_ALIASES, VENDOR_MAP } from '../../src/data/vendors.generated'
