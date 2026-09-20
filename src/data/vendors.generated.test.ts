import { describe, expect, it } from 'vitest'
import { VENDOR_KB, VENDOR_MAP } from './vendors.generated'

// Locks in the finding in docs/kb-todo.md ("Why the footer says 30 vendors, not 33"): the
// pre-migration hardcoded VENDOR_MAP (see `git show 49d37a1^:server/src/vendorMap.ts`) had 33
// package-name keys, but Clerk, Firebase, and Sentry were each registered under two different npm
// packages — 33 keys for 30 DISTINCT vendors. vendors/*.json correctly has one file per distinct
// vendor; this test guards that every one of the 33 original detection keys still resolves (via
// each vendor's `aliases[]`), so a future KB edit can't silently drop a real detection signal while
// looking like a harmless vendor-count change.
const ORIGINAL_33_DETECTION_KEYS = [
  'stripe', 'razorpay', 'braintree',
  '@clerk/nextjs', '@clerk/clerk-react',
  '@auth0/auth0-react', 'next-auth',
  'firebase', 'firebase-admin',
  '@supabase/supabase-js', '@planetscale/database', 'mongodb',
  'resend', '@sendgrid/mail', 'postmark',
  '@sentry/react', '@sentry/node', 'dd-trace', 'newrelic',
  'posthog-js',
  'openai', '@anthropic-ai/sdk', '@google/generative-ai',
  '@aws-sdk/client-s3', '@aws-sdk/client-dynamodb', '@aws-sdk/client-bedrock-runtime',
  'cloudinary',
  'twilio', '@slack/web-api',
  'mixpanel', '@amplitude/analytics-browser',
  'algoliasearch',
  '@googlemaps/js-api-loader',
]

describe('vendors.generated.ts — no vendor lost in the JSON-per-vendor migration', () => {
  it('has exactly 33 original detection keys to check (a guard on the fixture itself)', () => {
    expect(ORIGINAL_33_DETECTION_KEYS).toHaveLength(33)
  })

  it('resolves every one of the 33 pre-migration VENDOR_MAP keys', () => {
    const missing = ORIGINAL_33_DETECTION_KEYS.filter((key) => !VENDOR_MAP[key])
    expect(missing).toEqual([])
  })

  it('has 30 distinct vendors — Clerk/Firebase/Sentry consolidated from 2 keys each, not lost', () => {
    expect(Object.keys(VENDOR_KB).length).toBe(30)
  })

  it('Clerk, Firebase, and Sentry each still resolve under both of their original package names to the SAME vendor', () => {
    expect(VENDOR_MAP['@clerk/nextjs'].vendor).toBe(VENDOR_MAP['@clerk/clerk-react'].vendor)
    expect(VENDOR_MAP['firebase'].vendor).toBe(VENDOR_MAP['firebase-admin'].vendor)
    expect(VENDOR_MAP['@sentry/react'].vendor).toBe(VENDOR_MAP['@sentry/node'].vendor)
  })
})
