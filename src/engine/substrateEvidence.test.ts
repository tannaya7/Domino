import { describe, expect, it } from 'vitest'
import {
  classifyByCnameSuffix,
  classifyHost,
  computeVendorVerdict,
  ipv4ToBigInt,
  ipv6ToBigInt,
  isIpInCidr,
  matchIpAgainstRanges,
  type RangeEntry,
} from './substrateEvidence'

// --- Recorded fixtures (no network) — real entries pulled from a live run against each
// provider's published range file / a real vendor's DNS answer, frozen here for deterministic tests. ---

const AWS_RANGES: RangeEntry[] = [
  // Real entry from ip-ranges.amazonaws.com/ip-ranges.json, service=CLOUDFRONT.
  { cidr: '23.228.249.0/24', provider: 'aws', layer: 'edge', region: 'GLOBAL' },
  // Real entry, service=AMAZON (plain compute/hosting, eu-west-1).
  { cidr: '3.4.12.4/32', provider: 'aws', layer: 'hosting', region: 'eu-west-1' },
  // Real entry, service=GLOBALACCELERATOR.
  { cidr: '99.83.109.0/24', provider: 'aws', layer: 'edge', region: 'eu-south-1' },
  // Real IPv6 entry, service=AMAZON.
  { cidr: '2406:daba:f000::/40', provider: 'aws', layer: 'hosting', region: 'ap-southeast-4' },
]

const CLOUDFLARE_RANGES: RangeEntry[] = [
  // Real entries from cloudflare.com/ips-v4 and /ips-v6.
  { cidr: '104.16.0.0/13', provider: 'cloudflare', layer: 'edge' },
  { cidr: '162.158.0.0/15', provider: 'cloudflare', layer: 'edge' },
  { cidr: '2606:4700::/32', provider: 'cloudflare', layer: 'edge' },
]

const GCP_RANGES: RangeEntry[] = [
  // Real entry from gstatic.com/ipranges/cloud.json.
  { cidr: '34.1.208.0/20', provider: 'gcp', layer: 'hosting', region: 'africa-south1' },
]

describe('classifyByCnameSuffix — suffix rules, each checked against a real example', () => {
  it.each([
    ['d111abc.cloudfront.net', 'aws', 'edge'],
    ['posthog-ingress-prod-us-256455477.us-east-1.elb.amazonaws.com', 'aws', 'hosting'], // real, recorded live
    ['a1b2c3.awsglobalaccelerator.com', 'aws', 'edge'],
    ['myservice-abc123-uc.a.run.app', 'gcp', 'hosting'],
    ['myproject.appspot.com', 'gcp', 'hosting'],
    ['myapp.azurewebsites.net', 'azure', 'hosting'],
    ['myprofile.azurefd.net', 'azure', 'edge'],
    ['myprofile.trafficmanager.net', 'azure', 'edge'],
    ['cname.vercel-dns.com', 'vercel', 'edge'],
    ['prod.global.fastly.net', 'fastly', 'edge'],
  ])('%s -> provider %s, layer %s', (name, provider, layer) => {
    const result = classifyByCnameSuffix(name)
    expect(result).toMatchObject({ provider, layer })
  })

  it('matches the bare suffix itself (no subdomain)', () => {
    expect(classifyByCnameSuffix('amazonaws.com')).toMatchObject({ provider: 'aws' })
  })

  it('is case-insensitive and tolerates a trailing dot (FQDN form)', () => {
    expect(classifyByCnameSuffix('D111ABC.CLOUDFRONT.NET.')).toMatchObject({ provider: 'aws', layer: 'edge' })
  })

  it('does not match an unrelated hostname, or a suffix that only appears mid-string', () => {
    expect(classifyByCnameSuffix('api.stripe.com')).toBeNull()
    expect(classifyByCnameSuffix('notcloudfront.net.evil.example.com')).toBeNull()
    expect(classifyByCnameSuffix('cloudfront.net.attacker.com')).toBeNull() // suffix must be at the END
  })
})

describe('CIDR matcher — IPv4', () => {
  it('matches an address inside a /24 and rejects one outside it', () => {
    expect(isIpInCidr('23.228.249.100', '23.228.249.0/24')).toBe(true)
    expect(isIpInCidr('23.228.250.1', '23.228.249.0/24')).toBe(false)
  })

  it('/32 matches only the exact address', () => {
    expect(isIpInCidr('3.4.12.4', '3.4.12.4/32')).toBe(true)
    expect(isIpInCidr('3.4.12.5', '3.4.12.4/32')).toBe(false)
  })

  it('/0 matches every IPv4 address', () => {
    expect(isIpInCidr('1.2.3.4', '0.0.0.0/0')).toBe(true)
    expect(isIpInCidr('255.255.255.255', '0.0.0.0/0')).toBe(true)
  })

  it('matches at the exact boundary of a /13 (first and last address)', () => {
    expect(isIpInCidr('104.16.0.0', '104.16.0.0/13')).toBe(true) // first address
    expect(isIpInCidr('104.23.255.255', '104.16.0.0/13')).toBe(true) // last address
    expect(isIpInCidr('104.24.0.0', '104.16.0.0/13')).toBe(false) // just past the range
  })

  it('rejects malformed IPv4 addresses instead of matching by accident', () => {
    expect(() => ipv4ToBigInt('999.1.1.1')).toThrow()
    expect(() => ipv4ToBigInt('1.2.3')).toThrow()
  })
})

describe('CIDR matcher — IPv6', () => {
  it('matches a compressed (::) address against a real Cloudflare /32', () => {
    expect(isIpInCidr('2606:4700:1234::abcd', '2606:4700::/32')).toBe(true)
    expect(isIpInCidr('2607:4700::1', '2606:4700::/32')).toBe(false)
  })

  it('/128 matches only the exact address', () => {
    expect(isIpInCidr('2406:daba:f000::1', '2406:daba:f000::1/128')).toBe(true)
    expect(isIpInCidr('2406:daba:f000::2', '2406:daba:f000::1/128')).toBe(false)
  })

  it('/0 matches every IPv6 address', () => {
    expect(isIpInCidr('::1', '::/0')).toBe(true)
    expect(isIpInCidr('ffff::1', '::/0')).toBe(true)
  })

  it('expands "::" correctly whether it is in the middle, at the start, or at the end', () => {
    expect(ipv6ToBigInt('2606:4700::')).toBe(ipv6ToBigInt('2606:4700:0:0:0:0:0:0'))
    expect(ipv6ToBigInt('::1')).toBe(ipv6ToBigInt('0:0:0:0:0:0:0:1'))
    expect(ipv6ToBigInt('::')).toBe(0n)
  })

  it('rejects more than one "::" and malformed groups', () => {
    expect(() => ipv6ToBigInt('2606::4700::1')).toThrow()
    expect(() => ipv6ToBigInt('zzzz::1')).toThrow()
  })
})

describe('CIDR matcher — family mismatch and malformed entries never crash the whole match', () => {
  it('an IPv4 address never matches an IPv6 CIDR, regardless of prefix length, and vice versa', () => {
    expect(isIpInCidr('1.2.3.4', '::/0')).toBe(false)
    expect(isIpInCidr('::1', '0.0.0.0/0')).toBe(false)
  })

  it('matchIpAgainstRanges skips a malformed entry instead of throwing', () => {
    const ranges: RangeEntry[] = [
      { cidr: 'not-a-cidr', provider: 'broken', layer: 'hosting' },
      { cidr: '3.4.12.4/32', provider: 'aws', layer: 'hosting', region: 'eu-west-1' },
    ]
    expect(matchIpAgainstRanges('3.4.12.4', ranges)).toMatchObject({ provider: 'aws' })
  })

  it('returns null when nothing matches', () => {
    expect(matchIpAgainstRanges('8.8.8.8', AWS_RANGES)).toBeNull()
  })
})

describe('classifyHost — edge vs. hosting labeling', () => {
  it('CNAME landing on cloudfront.net is classified as AWS, layer edge', () => {
    const obs = classifyHost('example.com', ['d111abc.cloudfront.net'], ['23.228.249.5'], AWS_RANGES)
    expect(obs).toMatchObject({ observedProvider: 'aws', layer: 'edge', source: 'cname-suffix' })
  })

  it('CNAME landing on amazonaws.com (ELB) is classified as AWS, layer hosting', () => {
    const obs = classifyHost('app.posthog.com', ['posthog-ingress-prod-us-256455477.us-east-1.elb.amazonaws.com'], ['3.41.202.147'], AWS_RANGES)
    expect(obs).toMatchObject({ observedProvider: 'aws', layer: 'hosting', source: 'cname-suffix' })
  })

  it('no CNAME, but the IP falls in a published CLOUDFRONT range -> edge, via ip-range', () => {
    const obs = classifyHost('cdn.example.com', [], ['23.228.249.200'], AWS_RANGES)
    expect(obs).toMatchObject({ observedProvider: 'aws', layer: 'edge', source: 'ip-range' })
  })

  it('no CNAME, IP falls in a plain AMAZON range -> hosting, via ip-range, with a region caveat noted in detail', () => {
    const obs = classifyHost('api.example.com', [], ['3.4.12.4'], AWS_RANGES)
    expect(obs).toMatchObject({ observedProvider: 'aws', layer: 'hosting', source: 'ip-range', region: 'eu-west-1' })
    expect(obs.detail).toContain('observed, may be anycast')
  })

  it('IPv6 address matching a real Cloudflare range is classified as edge', () => {
    const obs = classifyHost('example.com', [], ['2606:4700:1234::1'], CLOUDFLARE_RANGES)
    expect(obs).toMatchObject({ observedProvider: 'cloudflare', layer: 'edge', source: 'ip-range' })
  })

  it('GCP range match is hosting (cloud.json carries no edge/CDN signal)', () => {
    const obs = classifyHost('example.com', [], ['34.1.208.5'], GCP_RANGES)
    expect(obs).toMatchObject({ observedProvider: 'gcp', layer: 'hosting' })
  })

  it('CNAME suffix takes priority over an IP-range match when both are present', () => {
    // The IP would match a GCP range, but the CNAME suffix (checked first) says AWS/edge.
    const obs = classifyHost('example.com', ['d111abc.cloudfront.net'], ['34.1.208.5'], GCP_RANGES)
    expect(obs).toMatchObject({ observedProvider: 'aws', source: 'cname-suffix' })
  })

  it('returns an unresolved observation, not a throw, when DNS produced nothing at all', () => {
    const obs = classifyHost('nonexistent.example', [], [], AWS_RANGES)
    expect(obs).toMatchObject({ observedProvider: null, layer: null, error: 'unresolved' })
  })

  it('returns a "no match" observation (distinct from unresolved) when addresses exist but match nothing known', () => {
    const obs = classifyHost('example.com', [], ['8.8.8.8'], AWS_RANGES)
    expect(obs).toMatchObject({ observedProvider: null, layer: null, source: null })
    expect(obs.error).toBeUndefined()
  })
})

describe('computeVendorVerdict — the verdict matrix', () => {
  function hostingObs(provider: string): ReturnType<typeof classifyHost> {
    return { host: 'h', cnameChain: [], addresses: [], observedProvider: provider, layer: 'hosting', source: 'ip-range', detail: '' }
  }
  function edgeObs(provider: string): ReturnType<typeof classifyHost> {
    return { host: 'h', cnameChain: [], addresses: [], observedProvider: provider, layer: 'edge', source: 'cname-suffix', detail: '' }
  }
  function unresolvedObs(): ReturnType<typeof classifyHost> {
    return { host: 'h', cnameChain: [], addresses: [], observedProvider: null, layer: null, source: null, detail: '', error: 'unresolved' }
  }

  it('hosting-layer match -> agrees', () => {
    expect(computeVendorVerdict(['aws'], [hostingObs('aws')])).toBe('agrees')
  })

  it('hosting-layer mismatch -> conflict (direct evidence, safe to contradict)', () => {
    expect(computeVendorVerdict(['azure'], [hostingObs('aws')])).toBe('conflict')
  })

  it('edge-layer match (edge provider is in the curated list) -> agrees-edge', () => {
    expect(computeVendorVerdict(['aws'], [edgeObs('aws')])).toBe('agrees-edge')
  })

  it('edge-layer mismatch -> inconclusive, NEVER conflict (never claim an origin from an edge observation)', () => {
    expect(computeVendorVerdict(['azure'], [edgeObs('cloudflare')])).toBe('inconclusive')
  })

  it('no usable observations -> inconclusive', () => {
    expect(computeVendorVerdict(['aws'], [unresolvedObs()])).toBe('inconclusive')
    expect(computeVendorVerdict(['aws'], [])).toBe('inconclusive')
  })

  it('multiple hosts: a conflict on any host wins over an agreement on another', () => {
    expect(computeVendorVerdict(['aws'], [hostingObs('aws'), hostingObs('gcp')])).toBe('conflict')
  })

  it('multiple hosts: agrees (hosting) wins over agrees-edge', () => {
    expect(computeVendorVerdict(['aws'], [edgeObs('aws'), hostingObs('aws')])).toBe('agrees')
  })

  it('multiple hosts: agrees-edge wins over inconclusive', () => {
    expect(computeVendorVerdict(['aws'], [unresolvedObs(), edgeObs('aws')])).toBe('agrees-edge')
  })

  it('curated substrate match is case-insensitive', () => {
    expect(computeVendorVerdict(['AWS'], [hostingObs('aws')])).toBe('agrees')
  })
})
