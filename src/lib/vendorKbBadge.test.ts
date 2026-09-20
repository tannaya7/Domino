import { describe, expect, it } from 'vitest'
import type { VendorKbEntry } from './types'
import { formatSubstrateBadges } from './vendorKbBadge'

function kb(substrate: VendorKbEntry['substrate']): VendorKbEntry {
  return {
    id: 'x',
    name: 'X',
    category: 'payments',
    aliases: [],
    packages: { npm: 'x', pypi: null, go: null, gem: null, maven: null },
    envPrefixes: [],
    hosts: [],
    statusFeed: null,
    substrate,
    sla: null,
    alternatives: [],
  }
}

describe('formatSubstrateBadges', () => {
  it('shows "unverified" for no KB record at all', () => {
    expect(formatSubstrateBadges(undefined)).toEqual([{ label: 'unverified', style: expect.any(String) }])
  })

  it('shows "value (verified)" with a link when confidence is verified', () => {
    const badges = formatSubstrateBadges(kb([{ value: 'aws', confidence: 'verified', evidence: [{ url: 'https://x.example.com', note: 'n', retrievedAt: '2026-01-01' }] }]))
    expect(badges).toEqual([{ label: 'aws (verified)', style: expect.any(String), href: 'https://x.example.com' }])
  })

  it('shows "value (reported)" with a link when confidence is reported', () => {
    const badges = formatSubstrateBadges(kb([{ value: 'azure', confidence: 'reported', evidence: [{ url: 'https://x.example.com', note: 'n', retrievedAt: '2026-01-01' }] }]))
    expect(badges[0]).toMatchObject({ label: 'azure (reported)', href: 'https://x.example.com' })
  })

  it('shows plain "unverified" (not the value) when confidence is unknown', () => {
    const badges = formatSubstrateBadges(kb([{ value: 'gcp', confidence: 'unknown', evidence: [] }]))
    expect(badges).toEqual([{ label: 'unverified', style: expect.any(String) }])
  })

  it('keeps verified/reported entries and appends one unverified badge for unknown entries', () => {
    const badges = formatSubstrateBadges(
      kb([
        { value: 'aws', confidence: 'verified', evidence: [{ url: 'https://x.example.com', note: 'n', retrievedAt: '2026-01-01' }] },
        { value: 'azure', confidence: 'reported', evidence: [{ url: 'https://y.example.com', note: 'n', retrievedAt: '2026-01-01' }] },
        { value: 'gcp', confidence: 'unknown', evidence: [] },
        { value: 'do', confidence: 'unknown', evidence: [] },
      ]),
    )
    expect(badges.map((b) => b.label)).toEqual(['aws (verified)', 'azure (reported)', 'unverified'])
  })
})
