// Default (unselected) node-type palette. Deliberately avoids the blue/orange/red
// family reserved for selection highlighting below, so clicking a node is always
// a clear hue change rather than a subtle shift within the same color family.
const TYPE_COLORS: Record<string, string> = {
  service: '#4a3aa7', // violet
  database: '#1baf7a', // aqua
  queue: '#e87ba4', // magenta
  cache: '#eda100', // yellow
  // Types inferred for repo-parsed files (server/src/inferFileType.ts). Reuses the
  // same hue family above — a graph is either manually-typed or repo-parsed, never both.
  component: '#4a3aa7', // violet
  api: '#e87ba4', // magenta
  config: '#eda100', // yellow
  util: '#1baf7a', // aqua
  test: '#008300', // green
  file: '#9ca3af', // grey — generic fallback for a repo file we couldn't classify further
}
const DEFAULT_TYPE_COLOR = '#9ca3af'

export function colorForType(type: string): string {
  return TYPE_COLORS[type] ?? DEFAULT_TYPE_COLOR
}

// Selection-state palette, validated for pairwise contrast with
// scripts/validate_palette.js from the dataviz skill (all checks pass).
export const SELECTED_COLOR = '#be123c' // crimson — the clicked node
export const DOWNSTREAM_COLOR = '#eb6834' // orange — will break
export const UPSTREAM_COLOR = '#2a78d6' // blue — depends on
export const DIMMED_COLOR = '#d1d5db' // grey — unaffected
