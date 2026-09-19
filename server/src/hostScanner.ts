// A SINGLE flat quantifier over the host charset — deliberately NOT `(?:[a-zA-Z0-9-]+\.)+`, which
// looks equivalent but is a classic catastrophic-backtracking shape: nesting a `+` inside a group
// that's itself repeated with `+` gives the engine exponentially many ways to partition a long
// non-matching run, and a single large/minified/generated file can then burn the entire scan
// budget on one regex call. This shape can't backtrack that way — one greedy character-class match,
// validated afterward with plain string ops (linear time either way).
const HTTPS_PREFIX = /https:\/\/([a-zA-Z0-9.-]{1,253})/g

function isValidHostnameShape(host: string): boolean {
  if (host.length < 4) return false
  const labels = host.split('.')
  if (labels.length < 2) return false
  if (!/^[a-zA-Z]{2,63}$/.test(labels[labels.length - 1])) return false
  return labels.every((label) => label.length > 0 && /^[a-zA-Z0-9-]+$/.test(label))
}

/** Extracts distinct hostnames from `https://<host>...` literals anywhere in source text. */
export function extractHostnames(source: string): string[] {
  const hosts = new Set<string>()
  HTTPS_PREFIX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = HTTPS_PREFIX.exec(source))) {
    // The charset match can trail a '.' or '-' right where a real URL would continue with '/' or a
    // query char (neither is in the charset, so the match just stops) — trim it before validating.
    const host = match[1].replace(/[.-]+$/, '').toLowerCase()
    if (isValidHostnameShape(host)) hosts.add(host)
  }
  return [...hosts]
}

const PRIVATE_OR_LOCAL_HOST = [
  /^localhost$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^::1$/,
]

export function isPrivateOrLocalHost(host: string): boolean {
  return PRIVATE_OR_LOCAL_HOST.some((pattern) => pattern.test(host))
}

/** XML/RDF/schema namespace hosts (appear in markup as identifiers, never real service calls) and
 * well-known CDN/font hosts (infrastructure, not a vendor with its own risk story here). Small and
 * curated on purpose — anything not on this list is surfaced, not silently dropped. */
export const IGNORED_HOSTS = new Set([
  'w3.org',
  'www.w3.org',
  'schemas.xmlsoap.org',
  'purl.org',
  'schema.org',
  'xml.apache.org',
  'json-schema.org',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'raw.githubusercontent.com',
  'github.com',
  'avatars.githubusercontent.com',
  'user-images.githubusercontent.com',
  'i.imgur.com',
  'via.placeholder.com',
])

/**
 * A host that plausibly belongs to the repo itself (its marketing site, docs, or deployment
 * domain) — checked by substring against the owner/repo name, e.g. "documenso.com" contains
 * "documenso". A heuristic, not a lookup against real DNS/whois data; documented as such, never
 * presented as verified.
 */
export function looksLikeOwnDomain(host: string, owner: string, repo: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/[^a-z0-9.]/g, '')
  for (const name of [owner, repo]) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normalized.length > 2 && normalizedHost.includes(normalized)) return true
  }
  return false
}
