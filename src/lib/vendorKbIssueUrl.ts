// Pure URL builders for the two "open a prefilled GitHub issue" buttons. Repo data (a vendor name,
// an unclassified item's name/count) can come from a scanned repo, which is untrusted input — every
// value is length-capped and lets encodeURIComponent do the escaping, never string-concatenated
// into the URL raw. Only names and counts are ever included, never file paths or other repo detail.

const REPO_URL = 'https://github.com/tannaya7/Domino'
const MAX_FIELD_LENGTH = 200

function cap(value: string, max = MAX_FIELD_LENGTH): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function issueUrl(template: string, params: Record<string, string>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) search.set(key, cap(value))
  return `${REPO_URL}/issues/new?template=${encodeURIComponent(template)}&${search.toString()}`
}

/** "Report wrong substrate" — prefills the vendor.yml issue template with the vendor's name, its
 * curated substrate value(s), and the detected tier. Never includes evidence text, hosts, or
 * anything else that could carry someone else's data into a public issue body unreviewed. */
export function buildReportWrongSubstrateIssueUrl(vendor: { name: string; substrate: string[]; tier: string }): string {
  return issueUrl('vendor.yml', {
    title: cap(`Wrong substrate: ${vendor.name}`),
    'vendor-name': cap(vendor.name),
    'current-substrate': cap(vendor.substrate.join(', ') || 'unknown'),
    category: cap(vendor.tier),
  })
}

/** "Suggest this vendor" (shown on an unclassified item, when Prompt 17's unclassified-dependencies
 * panel exists) — prefills only the item's name and how many times it was seen, never file paths. */
export function buildSuggestVendorIssueUrl(item: { name: string; occurrenceCount: number }): string {
  return issueUrl('vendor.yml', {
    title: cap(`Suggest vendor: ${item.name}`),
    'vendor-name': cap(item.name),
    'occurrence-count': String(Math.max(0, Math.trunc(item.occurrenceCount))),
  })
}
