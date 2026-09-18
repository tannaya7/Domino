// Framework-aware entrypoint detection, replacing the generic "nothing else depends on it"
// structural heuristic (still available as criticality.ts's inferEntrypoints fallback) with real
// route/entry conventions when the repo actually follows one. Pure path-pattern matching only —
// package.json main/bin resolution needs manifest content, so it lives in server/src/entrypoints.ts
// and gets merged with this module's output there.

const TEST_PATTERN = /(^|\/)(test|tests|__tests__|spec)(\/|$)|\.(test|spec)\.[jt]sx?$/i

// Matches app/page.tsx AND app/dashboard/settings/page.tsx alike — zero or more nested segments.
const NEXT_APP_ROUTER_FILE = /(^|\/)app\/(?:.*\/)?(page|layout|route|loading|error|not-found|template)\.[jt]sx?$/i
const NEXT_PAGES_ROUTER_FILE = /(^|\/)pages\/.+\.[jt]sx?$/i
// Deliberately NOT `(^|\/)` unrestricted — a utility file that happens to be named middleware.ts
// deep in the tree isn't Next.js's special root middleware. Project root or one directory in only.
const NEXT_MIDDLEWARE_FILE = /^([^/]+\/)?(middleware|proxy)\.[jt]sx?$/i
const VITE_MAIN_FILE = /(^|\/)src\/main\.[jt]sx?$/i

/**
 * Detects file-path-pattern-based entrypoints: Next.js App Router (page/layout/route/loading/
 * error/not-found/template), Pages Router (pages/**, including pages/api/**), middleware/proxy,
 * and Vite's src/main.*. Test files are excluded even if they'd otherwise match. Returns [] when
 * nothing in the repo follows any of these conventions — callers should fall back to a structural
 * heuristic in that case, not treat an empty result as "no entrypoints exist".
 */
export function inferProjectEntrypoints(nodeIds: string[]): string[] {
  return nodeIds.filter((id) => {
    if (TEST_PATTERN.test(id)) return false
    return (
      NEXT_APP_ROUTER_FILE.test(id) ||
      NEXT_PAGES_ROUTER_FILE.test(id) ||
      NEXT_MIDDLEWARE_FILE.test(id) ||
      VITE_MAIN_FILE.test(id)
    )
  })
}
