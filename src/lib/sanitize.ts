/** Escapes HTML special characters. Required before interpolating any repo-controlled string
 * (file paths, import specifiers) into an HTML template — react-force-graph-2d's `nodeLabel`
 * renders its return value as raw innerHTML, and file paths come from a scanned, untrusted repo. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
