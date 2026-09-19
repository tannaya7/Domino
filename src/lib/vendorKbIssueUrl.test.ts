import { describe, expect, it } from 'vitest'
import { buildReportWrongSubstrateIssueUrl, buildSuggestVendorIssueUrl } from './vendorKbIssueUrl'

describe('buildReportWrongSubstrateIssueUrl', () => {
  it('builds a well-formed GitHub new-issue URL pointing at the vendor issue template', () => {
    const url = buildReportWrongSubstrateIssueUrl({ name: 'Stripe', substrate: ['aws'], tier: 'payments' })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://github.com/tannaya7/Domino/issues/new')
    expect(parsed.searchParams.get('template')).toBe('vendor.yml')
    expect(parsed.searchParams.get('title')).toBe('Wrong substrate: Stripe')
    expect(parsed.searchParams.get('vendor-name')).toBe('Stripe')
    expect(parsed.searchParams.get('current-substrate')).toBe('aws')
    expect(parsed.searchParams.get('category')).toBe('payments')
  })

  it('escapes special characters (ampersands, quotes, newlines) instead of breaking the URL', () => {
    const name = 'Weird & "Vendor"\nName'
    const url = buildReportWrongSubstrateIssueUrl({ name, substrate: ['aws'], tier: 'payments' })
    expect(() => new URL(url)).not.toThrow()
    const parsed = new URL(url)
    // Round-trips back to the exact original string — proves the & is a real escaped character in
    // the vendor-name value, not a literal query-string separator that injected an extra param.
    expect(parsed.searchParams.get('vendor-name')).toBe(name)
    expect([...parsed.searchParams.keys()]).toEqual(['template', 'title', 'vendor-name', 'current-substrate', 'category'])
  })

  it('caps an absurdly long vendor name rather than producing an unbounded URL', () => {
    const longName = 'A'.repeat(5000)
    const url = buildReportWrongSubstrateIssueUrl({ name: longName, substrate: ['aws'], tier: 'payments' })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('vendor-name')!.length).toBeLessThan(300)
    expect(url.length).toBeLessThan(2000)
  })

  it('joins multiple substrates and honestly reports "unknown" when there are none', () => {
    const url = buildReportWrongSubstrateIssueUrl({ name: 'Datadog', substrate: ['aws', 'gcp'], tier: 'observability' })
    expect(new URL(url).searchParams.get('current-substrate')).toBe('aws, gcp')

    const urlNone = buildReportWrongSubstrateIssueUrl({ name: 'NextAuth', substrate: [], tier: 'auth' })
    expect(new URL(urlNone).searchParams.get('current-substrate')).toBe('unknown')
  })

  it('never includes anything beyond name/substrate/category — no evidence, hosts, or other fields leak in', () => {
    const url = buildReportWrongSubstrateIssueUrl({ name: 'Stripe', substrate: ['aws'], tier: 'payments' })
    expect(url).not.toContain('evidence')
    expect(url).not.toContain('host')
  })
})

describe('buildSuggestVendorIssueUrl', () => {
  it('builds a well-formed URL with only the item name and occurrence count', () => {
    const url = buildSuggestVendorIssueUrl({ name: 'some-unknown-package', occurrenceCount: 3 })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('template')).toBe('vendor.yml')
    expect(parsed.searchParams.get('vendor-name')).toBe('some-unknown-package')
    expect(parsed.searchParams.get('occurrence-count')).toBe('3')
    expect(parsed.searchParams.get('title')).toContain('some-unknown-package')
  })

  it('never leaks file paths — only name and count are accepted by the function signature at all', () => {
    const url = buildSuggestVendorIssueUrl({ name: 'pkg', occurrenceCount: 1 })
    expect(url).not.toContain('src/')
    expect(url).not.toContain('.ts')
  })

  it('coerces a negative or fractional count to a safe non-negative integer', () => {
    const url = buildSuggestVendorIssueUrl({ name: 'pkg', occurrenceCount: -5.7 })
    expect(new URL(url).searchParams.get('occurrence-count')).toBe('0')
  })

  it('escapes an item name with URL-breaking characters', () => {
    const url = buildSuggestVendorIssueUrl({ name: '../../etc/passwd?x=1&y=2', occurrenceCount: 1 })
    expect(() => new URL(url)).not.toThrow()
    expect(new URL(url).searchParams.get('vendor-name')).toBe('../../etc/passwd?x=1&y=2')
  })

  it('caps an absurdly long item name', () => {
    const url = buildSuggestVendorIssueUrl({ name: 'x'.repeat(5000), occurrenceCount: 1 })
    expect(url.length).toBeLessThan(2000)
  })
})
