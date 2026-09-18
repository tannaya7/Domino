// Default (unselected) node-type palette — dark-surface categorical hues (dataviz skill reference
// palette, dark column). Deliberately avoids the blue/orange/red family reserved for selection
// highlighting below, so clicking a node is always a clear hue change, not a subtle shift.
const TYPE_COLORS: Record<string, string> = {
  service: '#9085e9', // violet
  database: '#199e70', // aqua
  queue: '#d55181', // magenta
  cache: '#c98500', // yellow
  // Types inferred for repo-parsed files (server/src/inferFileType.ts). Reuses the
  // same hue family above — a graph is either manually-typed or repo-parsed, never both.
  component: '#9085e9', // violet
  api: '#d55181', // magenta
  config: '#c98500', // yellow
  util: '#199e70', // aqua
  test: '#008300', // green
  file: '#6b7280', // grey — generic fallback for a repo file we couldn't classify further
}
const DEFAULT_TYPE_COLOR = '#6b7280'

export function colorForType(type: string): string {
  return TYPE_COLORS[type] ?? DEFAULT_TYPE_COLOR
}

// Selection-state palette (dark-surface tuned).
export const SELECTED_COLOR = '#e66767' // red — the clicked node
export const DOWNSTREAM_COLOR = '#d95926' // orange — will break
export const UPSTREAM_COLOR = '#3987e5' // blue — depends on
export const DIMMED_COLOR = '#3a3f4d' // muted slate — unaffected, recedes into the dark surface
export const FAILED_COLOR = '#d03b3b' // status-critical — a node in an active failure simulation

// Substrate palette — fixed order (aws/gcp/azure/cloudflare get the four leading, validated
// adjacent-safe categorical slots; less-central substrates share a muted neutral rather than
// stretching the fixed order past what's been validated together).
const SUBSTRATE_COLORS: Record<string, string> = {
  aws: '#3987e5',
  gcp: '#d95926',
  azure: '#199e70',
  cloudflare: '#c98500',
  vercel: '#9085e9',
}
const DEFAULT_SUBSTRATE_COLOR = '#6b7280'

export function colorForSubstrate(substrate: string): string {
  return SUBSTRATE_COLORS[substrate] ?? DEFAULT_SUBSTRATE_COLOR
}

export const SUBSTRATE_LEGEND: Array<{ key: string; label: string; color: string }> = [
  { key: 'aws', label: 'AWS', color: SUBSTRATE_COLORS.aws },
  { key: 'gcp', label: 'GCP', color: SUBSTRATE_COLORS.gcp },
  { key: 'azure', label: 'Azure', color: SUBSTRATE_COLORS.azure },
  { key: 'cloudflare', label: 'Cloudflare', color: SUBSTRATE_COLORS.cloudflare },
  { key: 'vercel', label: 'Vercel', color: SUBSTRATE_COLORS.vercel },
  { key: 'other', label: 'Other / self-hosted', color: DEFAULT_SUBSTRATE_COLOR },
]

// Status palette — fixed, never reused for series identity (dataviz skill: "status colors are
// reserved"). Always pair with an icon/label; never rely on color alone (handled by StatusBadge).
export const STATUS_COLORS: Record<string, string> = {
  operational: '#0ca30c',
  degraded: '#fab219',
  outage: '#d03b3b',
  unknown: '#6b7280',
}
