/** Bump this when the exact-engine's computational methodology changes (correlated.ts, scenario.ts,
 * concentration/criticality math) in a way that would make two analyses of the SAME repo/assumptions
 * produce different numbers. Snapshots record the version they were computed with — diffAnalyses()
 * warns when comparing across versions, since a change there isn't a real repo/infra change. */
export const ENGINE_VERSION = '1.0.0'
