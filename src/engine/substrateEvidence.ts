// Pure math/string logic only — no I/O, no dns, no fetch. scripts/verify-substrates.ts does the
// network work (DNS resolution, downloading published IP ranges) and calls the functions here to
// turn raw DNS/IP observations into a classification. Kept here (not in the script) so it can be
// unit-tested with recorded fixtures, no network, the same way src/engine/correlated.ts is.

export type SubstrateLayer = 'edge' | 'hosting'
export type SubstrateVerdict = 'agrees' | 'agrees-edge' | 'conflict' | 'inconclusive'

export interface CnameSuffixRule {
  suffix: string
  provider: string
  layer: SubstrateLayer
}

/**
 * Each rule was checked against a real example before being kept (never trust a suffix pattern
 * from memory alone):
 * - amazonaws.com: confirmed live in this session — a real vendor's (PostHog's) CNAME chain
 *   terminated in `*.elb.amazonaws.com`.
 * - cloudfront.net / awsglobalaccelerator.com / run.app / appspot.com / azurewebsites.net /
 *   azurefd.net / trafficmanager.net / vercel-dns.com / fastly.net: each is that provider's own
 *   documented default or custom-domain-CNAME-target hostname suffix (CloudFront distributions,
 *   Global Accelerator accelerators, Cloud Run services, App Engine apps, Azure App Service,
 *   Azure Front Door, Azure Traffic Manager, Vercel's documented custom-domain CNAME target, and
 *   Fastly's service hostnames, respectively) — stable, long-published conventions, not guessed.
 *
 * Layer: CloudFront/Global Accelerator/Front Door/Traffic Manager/vercel-dns.com/fastly.net are
 * CDN/anycast-routing products — the suffix alone tells you "traffic enters through this edge",
 * never the origin behind it. Plain amazonaws.com/run.app/appspot.com/azurewebsites.net are direct
 * compute/platform hostnames with no separate caching layer in front, so a match there is treated
 * as "hosting" (as close to origin as CNAME evidence gets).
 */
export const CNAME_SUFFIX_RULES: CnameSuffixRule[] = [
  { suffix: 'cloudfront.net', provider: 'aws', layer: 'edge' },
  { suffix: 'amazonaws.com', provider: 'aws', layer: 'hosting' },
  { suffix: 'awsglobalaccelerator.com', provider: 'aws', layer: 'edge' },
  { suffix: 'run.app', provider: 'gcp', layer: 'hosting' },
  { suffix: 'appspot.com', provider: 'gcp', layer: 'hosting' },
  { suffix: 'azurewebsites.net', provider: 'azure', layer: 'hosting' },
  { suffix: 'azurefd.net', provider: 'azure', layer: 'edge' },
  { suffix: 'trafficmanager.net', provider: 'azure', layer: 'edge' },
  { suffix: 'vercel-dns.com', provider: 'vercel', layer: 'edge' },
  { suffix: 'fastly.net', provider: 'fastly', layer: 'edge' },
]

export function classifyByCnameSuffix(name: string): (CnameSuffixRule & { matchedName: string }) | null {
  const lower = name.toLowerCase().replace(/\.$/, '')
  for (const rule of CNAME_SUFFIX_RULES) {
    if (lower === rule.suffix || lower.endsWith(`.${rule.suffix}`)) return { ...rule, matchedName: lower }
  }
  return null
}

// --- Tiny CIDR matcher — IPv4 + IPv6 via BigInt, no dependencies. ---

export function ipv4ToBigInt(ip: string): bigint {
  const parts = ip.split('.')
  if (parts.length !== 4) throw new Error(`Invalid IPv4 address: ${ip}`)
  let n = 0n
  for (const part of parts) {
    const octet = Number(part)
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) throw new Error(`Invalid IPv4 address: ${ip}`)
    n = (n << 8n) | BigInt(octet)
  }
  return n
}

/** Expands `::` and parses each 16-bit group as hex. Does not handle embedded-IPv4 (`::ffff:1.2.3.4`)
 * forms — none of the four published range sources this module consumes use that notation. */
export function ipv6ToBigInt(ip: string): bigint {
  const doubleColonCount = (ip.match(/::/g) ?? []).length
  if (doubleColonCount > 1) throw new Error(`Invalid IPv6 address: ${ip}`)

  let head: string[]
  let tail: string[]
  if (doubleColonCount === 1) {
    const [h, t] = ip.split('::')
    head = h ? h.split(':') : []
    tail = t ? t.split(':') : []
  } else {
    head = ip.split(':')
    tail = []
  }

  const missing = 8 - head.length - tail.length
  if (missing < 0) throw new Error(`Invalid IPv6 address: ${ip}`)
  const groups = [...head, ...Array(missing).fill('0'), ...tail]
  if (groups.length !== 8) throw new Error(`Invalid IPv6 address: ${ip}`)

  let n = 0n
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) throw new Error(`Invalid IPv6 address: ${ip}`)
    n = (n << 16n) | BigInt(parseInt(g, 16))
  }
  return n
}

export function isIpv4(ip: string): boolean {
  return ip.includes('.') && !ip.includes(':')
}

/** Auto-detects IPv4 vs IPv6 by address family, then by CIDR family — an IPv4 address never
 * matches an IPv6 CIDR and vice versa, regardless of prefix length. */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const slashIndex = cidr.lastIndexOf('/')
  if (slashIndex === -1) throw new Error(`Invalid CIDR (missing "/"): ${cidr}`)
  const range = cidr.slice(0, slashIndex)
  const bits = Number(cidr.slice(slashIndex + 1))

  const ipIsV4 = isIpv4(ip)
  const rangeIsV4 = isIpv4(range)
  if (ipIsV4 !== rangeIsV4) return false

  if (ipIsV4) {
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error(`Invalid IPv4 CIDR prefix: ${cidr}`)
    const ipNum = ipv4ToBigInt(ip)
    const rangeNum = ipv4ToBigInt(range)
    const mask = bits === 0 ? 0n : (0xffffffffn << BigInt(32 - bits)) & 0xffffffffn
    return (ipNum & mask) === (rangeNum & mask)
  }

  if (!Number.isInteger(bits) || bits < 0 || bits > 128) throw new Error(`Invalid IPv6 CIDR prefix: ${cidr}`)
  const ipNum = ipv6ToBigInt(ip)
  const rangeNum = ipv6ToBigInt(range)
  const FULL_128 = (1n << 128n) - 1n
  const mask = bits === 0 ? 0n : (FULL_128 << BigInt(128 - bits)) & FULL_128
  return (ipNum & mask) === (rangeNum & mask)
}

export interface RangeEntry {
  cidr: string
  provider: string
  layer: SubstrateLayer
  /** e.g. an AWS region or GCP scope — "observed, may be anycast": a published range's region
   * label is not a location guarantee, since the same prefix can be announced from multiple
   * physical sites (anycast). Never presented as "this vendor's infra is physically in <region>". */
  region?: string
}

export function matchIpAgainstRanges(ip: string, ranges: RangeEntry[]): RangeEntry | null {
  for (const entry of ranges) {
    try {
      if (isIpInCidr(ip, entry.cidr)) return entry
    } catch {
      continue // a malformed entry in a downloaded range file should never crash classification
    }
  }
  return null
}

// --- Per-host classification, combining CNAME-suffix and IP-range evidence. ---

export interface HostObservation {
  host: string
  /** CNAME targets in order, NOT including `host` itself. Empty when there was no CNAME (or DNS
   * resolution failed before reaching one). */
  cnameChain: string[]
  addresses: string[]
  observedProvider: string | null
  layer: SubstrateLayer | null
  source: 'cname-suffix' | 'ip-range' | null
  detail: string
  region?: string
  error?: string
}

/**
 * Classifies one host from its already-resolved CNAME chain + addresses (both provided by the
 * caller — this function does no I/O). CNAME suffix evidence is checked first (scanning the chain
 * in order, first match wins) since it's the more specific signal; IP-range membership is the
 * fallback when there's no CNAME or none of it matched a known suffix.
 */
export function classifyHost(host: string, cnameChain: string[], addresses: string[], ranges: RangeEntry[]): HostObservation {
  for (const name of cnameChain) {
    const match = classifyByCnameSuffix(name)
    if (match) {
      return {
        host,
        cnameChain,
        addresses,
        observedProvider: match.provider,
        layer: match.layer,
        source: 'cname-suffix',
        detail: `CNAME chain includes "${match.matchedName}" (matches *.${match.suffix})`,
      }
    }
  }

  for (const ip of addresses) {
    const match = matchIpAgainstRanges(ip, ranges)
    if (match) {
      return {
        host,
        cnameChain,
        addresses,
        observedProvider: match.provider,
        layer: match.layer,
        source: 'ip-range',
        detail: `${ip} is in ${match.provider}'s published range ${match.cidr}${match.region ? ` (region: ${match.region}, observed, may be anycast)` : ''}`,
        region: match.region,
      }
    }
  }

  if (addresses.length === 0 && cnameChain.length === 0) {
    return { host, cnameChain, addresses, observedProvider: null, layer: null, source: null, detail: 'DNS resolution failed', error: 'unresolved' }
  }
  return {
    host,
    cnameChain,
    addresses,
    observedProvider: null,
    layer: null,
    source: null,
    detail: 'No CNAME suffix or IP-range match against any known provider',
  }
}

/**
 * The verdict matrix. Priority when a vendor has multiple hosts: conflict beats agrees beats
 * agrees-edge beats inconclusive — a single direct contradiction is worth surfacing even if
 * another host agrees, and direct ("hosting") evidence beats edge-only evidence.
 *
 * The honesty rule this encodes: an edge observation (Cloudflare/Fastly/CloudFront/etc. in front)
 * can CORROBORATE a curated tag (agrees-edge) but can never CONTRADICT one (conflict) — we didn't
 * see the origin, so we can't claim it's wrong. Only a "hosting"-layer (direct) observation that
 * disagrees with every curated substrate tag counts as a conflict.
 */
export function computeVendorVerdict(curatedSubstrate: string[], hosts: HostObservation[]): SubstrateVerdict {
  const curated = new Set(curatedSubstrate.map((s) => s.toLowerCase()))
  let sawAgrees = false
  let sawAgreesEdge = false
  let sawConflict = false

  for (const h of hosts) {
    if (!h.observedProvider || !h.layer) continue
    const matches = curated.has(h.observedProvider.toLowerCase())
    if (h.layer === 'hosting') {
      if (matches) sawAgrees = true
      else sawConflict = true
    } else {
      if (matches) sawAgreesEdge = true
      // edge + no match: inconclusive, never a conflict — see doc comment above.
    }
  }

  if (sawConflict) return 'conflict'
  if (sawAgrees) return 'agrees'
  if (sawAgreesEdge) return 'agrees-edge'
  return 'inconclusive'
}
