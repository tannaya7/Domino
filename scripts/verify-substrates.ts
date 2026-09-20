/**
 * Independent evidence for curated vendor substrate tags, via DNS + published cloud IP ranges.
 * Offline script, NOT a runtime dependency — the app never resolves DNS itself; it only reads the
 * static JSON this script writes.
 *
 * For each vendor in VENDOR_MAP that has a known global host (scripts/vendorHosts.ts — tenant-
 * specific vendors like Clerk/Auth0/Supabase are skipped, not guessed), this: resolves its CNAME
 * chain + A/AAAA records, classifies the result against CNAME-suffix rules and downloaded IP
 * ranges (AWS, GCP, Cloudflare, Fastly), and computes a verdict — agrees | agrees-edge | conflict |
 * inconclusive — via src/engine/substrateEvidence.ts's pure classification logic. NEVER writes back
 * to VENDOR_MAP; curated tags are only ever edited by a human.
 *
 * Usage: tsx scripts/verify-substrates.ts   (also: npm run verify:substrates)
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve4, resolve6, resolveCname, resolveTxt } from 'node:dns/promises'
import path from 'node:path'
import { classifyHost, computeVendorVerdict, type HostObservation, type RangeEntry } from '../src/engine/substrateEvidence'
import type { SubstrateVerificationData, VendorVerificationResult } from '../src/lib/substrateVerification'
import { VENDOR_MAP } from '../server/src/vendorMap'
import { VENDOR_HOSTS } from './vendorHosts'

const TIMEOUT_MS = 3000
const DNS_CONCURRENCY = 6
const HOST_CONCURRENCY = 3
const MAX_CNAME_DEPTH = 8

const ROOT = path.join(import.meta.dirname, '..')
const RANGES_DIR = path.join(ROOT, 'data', 'ranges')
const OUT_JSON = path.join(ROOT, 'public', 'substrate-verification.json')
const OUT_DOC = path.join(ROOT, 'docs', 'substrate-verification.md')

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
  ])
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index++
      results[current] = await fn(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker))
  return results
}

// --- DNS ---

async function resolveCnameChain(host: string): Promise<string[]> {
  const chain: string[] = []
  let current = host
  for (let i = 0; i < MAX_CNAME_DEPTH; i++) {
    let targets: string[]
    try {
      targets = await withTimeout(resolveCname(current), `CNAME ${current}`)
    } catch {
      break // ENODATA/ENOTFOUND/timeout — no (more) CNAME, chain ends here
    }
    if (targets.length === 0) break
    chain.push(targets[0])
    current = targets[0]
  }
  return chain
}

async function resolveAddresses(host: string): Promise<string[]> {
  const [v4, v6] = await Promise.allSettled([withTimeout(resolve4(host), `A ${host}`), withTimeout(resolve6(host), `AAAA ${host}`)])
  const addrs: string[] = []
  if (v4.status === 'fulfilled') addrs.push(...v4.value)
  if (v6.status === 'fulfilled') addrs.push(...v6.value)
  return addrs
}

/** Team Cymru's DNS-based IP-to-ASN lookup — only used if it actually works when tested (see
 * `testCymruAvailability`); IPv4 only (the reversed-nibble IPv6 query form wasn't exercised in the
 * time available, so it's out of scope rather than shipped untested). Purely supplementary
 * evidence appended to a host's `detail` string — never fed into the verdict computation, since
 * there is no maintained ASN-number-to-substrate-tag table here. */
async function resolveAsnViaCymru(ip: string): Promise<{ asn: string; org: string } | null> {
  if (ip.includes(':')) return null
  try {
    const query = `${ip.split('.').reverse().join('.')}.origin.asn.cymru.com`
    const [record] = await withTimeout(resolveTxt(query), `Cymru ASN ${ip}`)
    const asn = record?.join('').split('|')[0]?.trim()
    if (!asn) return null
    const [orgRecord] = await withTimeout(resolveTxt(`AS${asn}.asn.cymru.com`), `Cymru org AS${asn}`)
    const org = orgRecord?.join('').split('|')[4]?.trim() ?? ''
    return { asn: `AS${asn}`, org }
  } catch {
    return null
  }
}

async function testCymruAvailability(): Promise<boolean> {
  const result = await resolveAsnViaCymru('8.8.8.8').catch(() => null)
  return result !== null && result.asn === 'AS15169' // Google's real ASN — confirms the lookup mechanism actually works here
}

// --- Published IP ranges ---

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.json()
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.text()
}

async function saveRangeFile(provider: string, sourceUrl: string, raw: unknown): Promise<void> {
  await mkdir(RANGES_DIR, { recursive: true })
  await writeFile(
    path.join(RANGES_DIR, `${provider}.json`),
    JSON.stringify({ fetchedAt: new Date().toISOString(), sourceUrl, raw }, null, 2),
  )
}

const AWS_EDGE_SERVICES = new Set(['CLOUDFRONT', 'GLOBALACCELERATOR'])

async function downloadAwsRanges(): Promise<RangeEntry[]> {
  const url = 'https://ip-ranges.amazonaws.com/ip-ranges.json'
  const data = (await fetchJson(url)) as {
    prefixes: Array<{ ip_prefix: string; region: string; service: string }>
    ipv6_prefixes: Array<{ ipv6_prefix: string; region: string; service: string }>
  }
  await saveRangeFile('aws', url, data)
  return [
    ...data.prefixes.map((p) => ({
      cidr: p.ip_prefix,
      provider: 'aws',
      layer: (AWS_EDGE_SERVICES.has(p.service) ? 'edge' : 'hosting') as RangeEntry['layer'],
      region: p.region,
    })),
    ...data.ipv6_prefixes.map((p) => ({
      cidr: p.ipv6_prefix,
      provider: 'aws',
      layer: (AWS_EDGE_SERVICES.has(p.service) ? 'edge' : 'hosting') as RangeEntry['layer'],
      region: p.region,
    })),
  ]
}

async function downloadGcpRanges(): Promise<RangeEntry[]> {
  const url = 'https://www.gstatic.com/ipranges/cloud.json'
  const data = (await fetchJson(url)) as { prefixes: Array<{ ipv4Prefix?: string; ipv6Prefix?: string; scope?: string }> }
  await saveRangeFile('gcp', url, data)
  // cloud.json carries no CDN/edge signal (that's a separate Google file this task didn't ask
  // for) — every match here is 'hosting'.
  const entries: RangeEntry[] = []
  for (const p of data.prefixes) {
    const cidr = p.ipv4Prefix ?? p.ipv6Prefix
    if (cidr) entries.push({ cidr, provider: 'gcp', layer: 'hosting', region: p.scope })
  }
  return entries
}

async function downloadCloudflareRanges(): Promise<RangeEntry[]> {
  const v4Url = 'https://www.cloudflare.com/ips-v4'
  const v6Url = 'https://www.cloudflare.com/ips-v6'
  const [v4Text, v6Text] = await Promise.all([fetchText(v4Url), fetchText(v6Url)])
  await saveRangeFile('cloudflare', `${v4Url} , ${v6Url}`, { v4: v4Text, v6: v6Text })
  const cidrs = [...v4Text.split('\n'), ...v6Text.split('\n')].map((l) => l.trim()).filter(Boolean)
  // Cloudflare's entire published range IS its edge network — there is no "hosting" case for it.
  return cidrs.map((cidr) => ({ cidr, provider: 'cloudflare', layer: 'edge' as const }))
}

async function downloadFastlyRanges(): Promise<RangeEntry[]> {
  const url = 'https://api.fastly.com/public-ip-list'
  const data = (await fetchJson(url)) as { addresses: string[]; ipv6_addresses: string[] }
  await saveRangeFile('fastly', url, data)
  return [...data.addresses, ...data.ipv6_addresses].map((cidr) => ({ cidr, provider: 'fastly', layer: 'edge' as const }))
}

// --- docs/substrate-verification.md ---

function renderMarkdown(data: SubstrateVerificationData, totalCuratedVendors: number): string {
  const byVerdict = (v: VendorVerificationResult['verdict']) => data.results.filter((r) => r.verdict === v)
  const conflicts = byVerdict('conflict')
  const agrees = byVerdict('agrees')
  const agreesEdge = byVerdict('agrees-edge')
  const inconclusive = byVerdict('inconclusive')

  function renderVendor(r: VendorVerificationResult): string {
    const lines = [`### ${r.vendor} (\`${r.vendorKey}\`) — ${r.verdict}`, '', `Curated substrate: \`${r.curatedSubstrate.join(', ') || '(none)'}\` · Checked: ${r.checkedAt}`, '']
    for (const h of r.hosts) {
      lines.push(`- **${h.host}**${h.cnameChain.length > 0 ? ` → CNAME → ${h.cnameChain.join(' → ')}` : ''}`)
      lines.push(`  - Addresses: ${h.addresses.join(', ') || '(none)'}`)
      lines.push(`  - ${h.detail}${h.layer ? ` — layer: ${h.layer}` : ''}`)
    }
    return lines.join('\n')
  }

  return [
    '# Substrate verification',
    '',
    `Generated ${data.generatedAt} by \`scripts/verify-substrates.ts\`. Independent DNS + published-IP-range evidence for curated \`substrate\` tags in \`server/src/vendorMap.ts\` — informational only, **never automatically applied** to the curated map.`,
    '',
    `Team Cymru ASN lookup: ${data.asnLookupAvailable ? 'available, included as supplementary evidence where present' : 'unavailable in the environment this was generated in — skipped entirely'}.`,
    '',
    `${data.results.length} of ${totalCuratedVendors} curated vendors were checked (the rest have no single global host to check — see \`scripts/vendorHosts.ts\`).`,
    '',
    `**${agrees.length} agree, ${agreesEdge.length} agree (edge only), ${conflicts.length} conflict, ${inconclusive.length} inconclusive.**`,
    '',
    '## Conflicts',
    '',
    conflicts.length > 0 ? conflicts.map(renderVendor).join('\n\n') : '_None._',
    '',
    '## Agrees',
    '',
    agrees.length > 0 ? agrees.map(renderVendor).join('\n\n') : '_None._',
    '',
    '## Agrees (edge only — origin not observable, corroborates but does not confirm)',
    '',
    agreesEdge.length > 0 ? agreesEdge.map(renderVendor).join('\n\n') : '_None._',
    '',
    '## Inconclusive',
    '',
    inconclusive.length > 0 ? inconclusive.map(renderVendor).join('\n\n') : '_None._',
    '',
  ].join('\n')
}

// --- Main ---

async function checkVendorHost(host: string, ranges: RangeEntry[], asnLookupAvailable: boolean): Promise<HostObservation> {
  const cnameChain = await resolveCnameChain(host)
  const finalName = cnameChain.length > 0 ? cnameChain[cnameChain.length - 1] : host
  const addresses = await resolveAddresses(finalName)
  const observation = classifyHost(host, cnameChain, addresses, ranges)

  if (asnLookupAvailable && addresses.length > 0) {
    const asn = await resolveAsnViaCymru(addresses[0])
    if (asn) observation.detail += ` | ASN ${asn.asn} (${asn.org})`
  }
  return observation
}

async function main() {
  console.log('Downloading published IP ranges...')
  const [aws, gcp, cloudflare, fastly] = await Promise.all([
    downloadAwsRanges(),
    downloadGcpRanges(),
    downloadCloudflareRanges(),
    downloadFastlyRanges(),
  ])
  const ranges = [...aws, ...gcp, ...cloudflare, ...fastly]
  console.log(`  ${ranges.length} ranges loaded (aws ${aws.length}, gcp ${gcp.length}, cloudflare ${cloudflare.length}, fastly ${fastly.length})`)

  console.log('Testing Team Cymru ASN lookup availability...')
  const asnLookupAvailable = await testCymruAvailability()
  console.log(`  ${asnLookupAvailable ? 'available' : 'unavailable in this environment — skipping ASN evidence'}`)

  const vendorEntries = Object.entries(VENDOR_MAP).filter(([key]) => (VENDOR_HOSTS[key] ?? []).length > 0)
  console.log(`Checking ${vendorEntries.length} of ${Object.keys(VENDOR_MAP).length} curated vendors with a known global host...`)

  const checkedAt = new Date().toISOString()
  const results = await mapWithConcurrency(vendorEntries, DNS_CONCURRENCY, async ([key, entry]): Promise<VendorVerificationResult> => {
    const hosts = VENDOR_HOSTS[key]
    const hostObservations = await mapWithConcurrency(hosts, HOST_CONCURRENCY, (host) => checkVendorHost(host, ranges, asnLookupAvailable))
    const verdict = computeVendorVerdict(entry.substrate, hostObservations)
    console.log(`  ${entry.vendor}: ${verdict}`)
    return { vendorKey: key, vendor: entry.vendor, curatedSubstrate: entry.substrate, verdict, checkedAt, hosts: hostObservations }
  })

  const output: SubstrateVerificationData = { generatedAt: checkedAt, asnLookupAvailable, results }

  await mkdir(path.dirname(OUT_JSON), { recursive: true })
  await writeFile(OUT_JSON, JSON.stringify(output, null, 2))
  console.log(`Wrote ${OUT_JSON}`)

  await mkdir(path.dirname(OUT_DOC), { recursive: true })
  await writeFile(OUT_DOC, renderMarkdown(output, Object.keys(VENDOR_MAP).length))
  console.log(`Wrote ${OUT_DOC}`)

  const conflicts = results.filter((r) => r.verdict === 'conflict').length
  const verified = results.filter((r) => r.verdict === 'agrees' || r.verdict === 'agrees-edge').length
  console.log(`\n${verified}/${results.length} checked vendors verified; ${conflicts} conflict(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
