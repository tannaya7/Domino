import { describe, expect, it } from 'vitest'
import { extractHostnames, IGNORED_HOSTS, isPrivateOrLocalHost, looksLikeOwnDomain } from '../src/hostScanner'

describe('extractHostnames', () => {
  it('extracts distinct hostnames from https:// literals', () => {
    const source = `const a = "https://api.stripe.com/v1"; const b = 'https://api.stripe.com/v2';`
    expect(extractHostnames(source)).toEqual(['api.stripe.com'])
  })

  it('extracts multiple distinct hosts', () => {
    const source = `fetch("https://api.stripe.com"); fetch("https://api.sendgrid.com")`
    expect(extractHostnames(source).sort()).toEqual(['api.sendgrid.com', 'api.stripe.com'])
  })

  it('stops at the path, not swallowing it into the hostname', () => {
    expect(extractHostnames('"https://api.stripe.com/v1/charges?x=1"')).toEqual(['api.stripe.com'])
  })

  it('ignores http:// (non-secure) URLs', () => {
    expect(extractHostnames('"http://api.stripe.com"')).toEqual([])
  })

  it('returns [] for source with no https:// literals', () => {
    expect(extractHostnames('const x = 1')).toEqual([])
  })

  it('REGRESSION: does not catastrophically backtrack on a long run of dots with no valid TLD (found via a real scan regression — see hostScanner.ts)', () => {
    // The original regex used `(?:[a-zA-Z0-9-]+\.)+` — nesting a `+` inside a `+`-repeated group —
    // which is a classic ReDoS shape: a long non-matching run forces exponential backtracking. A
    // single large/minified file hitting this could burn an entire 25s scan budget on one file.
    const adversarial = `https://${'a.'.repeat(50_000)}!` // never resolves to a valid TLD ending
    const start = performance.now()
    extractHostnames(adversarial)
    expect(performance.now() - start).toBeLessThan(200)
  })

  it('handles a large realistic file (long lines, many unrelated dots) quickly', () => {
    const source = `const version = "1.2.3.4.5.6"; ` + 'x'.repeat(500_000) + ' "https://api.stripe.com/v1"'
    const start = performance.now()
    expect(extractHostnames(source)).toEqual(['api.stripe.com'])
    expect(performance.now() - start).toBeLessThan(200)
  })
})

describe('isPrivateOrLocalHost', () => {
  it('flags localhost and loopback addresses', () => {
    expect(isPrivateOrLocalHost('localhost')).toBe(true)
    expect(isPrivateOrLocalHost('127.0.0.1')).toBe(true)
  })

  it('flags private IP ranges', () => {
    expect(isPrivateOrLocalHost('10.0.0.5')).toBe(true)
    expect(isPrivateOrLocalHost('192.168.1.1')).toBe(true)
    expect(isPrivateOrLocalHost('172.16.0.1')).toBe(true)
    expect(isPrivateOrLocalHost('172.31.255.255')).toBe(true)
  })

  it('does not flag a public IP that merely starts similarly to a private range', () => {
    expect(isPrivateOrLocalHost('172.32.0.1')).toBe(false) // just outside 172.16-31
    expect(isPrivateOrLocalHost('8.8.8.8')).toBe(false)
  })

  it('does not flag a real public hostname', () => {
    expect(isPrivateOrLocalHost('api.stripe.com')).toBe(false)
  })
})

describe('IGNORED_HOSTS', () => {
  it('includes known XML-namespace hosts', () => {
    expect(IGNORED_HOSTS.has('w3.org')).toBe(true)
  })

  it('includes known CDN/font hosts', () => {
    expect(IGNORED_HOSTS.has('fonts.googleapis.com')).toBe(true)
    expect(IGNORED_HOSTS.has('cdnjs.cloudflare.com')).toBe(true)
  })
})

describe('looksLikeOwnDomain', () => {
  it('matches a host containing the repo name', () => {
    expect(looksLikeOwnDomain('documenso.com', 'documenso', 'documenso')).toBe(true)
  })

  it('matches a host containing the owner name', () => {
    expect(looksLikeOwnDomain('acme-docs.example.com', 'acme', 'widget-app')).toBe(true)
  })

  it('does not match an unrelated host', () => {
    expect(looksLikeOwnDomain('api.stripe.com', 'documenso', 'documenso')).toBe(false)
  })

  it('does not false-positive on very short owner/repo names', () => {
    expect(looksLikeOwnDomain('api.stripe.com', 'ab', 'ab')).toBe(false)
  })
})
