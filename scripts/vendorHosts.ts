/**
 * Curated hostnames per vendor, for the offline DNS/IP-range substrate verifier
 * (scripts/verify-substrates.ts) ONLY — never imported at runtime by the app, and never merged
 * into VENDOR_MAP. Best-effort, from each vendor's own API docs, covering ~24 of the 33
 * VENDOR_MAP entries.
 *
 * Left out on purpose (not guessed): vendors whose real endpoint is a per-customer/per-tenant
 * subdomain with no single global host to check — Clerk (clerk.<tenant>.com), Auth0
 * (<tenant>.auth0.com), Supabase (<project>.supabase.co), PlanetScale (<db>.psdb.cloud), MongoDB
 * Atlas (<cluster>.mongodb.net), Algolia (<app-id>.algolia.net) — and next-auth, whose curated
 * substrate is 'self' (nothing external to check). Guessing a placeholder host for any of these
 * would produce a meaningless or actively misleading DNS answer, which is worse than leaving it
 * unverified.
 */
export const VENDOR_HOSTS: Record<string, string[]> = {
  stripe: ['api.stripe.com'],
  razorpay: ['api.razorpay.com'],
  braintree: ['api.braintreegateway.com'],
  firebase: ['firestore.googleapis.com'],
  'firebase-admin': ['firestore.googleapis.com'],
  resend: ['api.resend.com'],
  '@sendgrid/mail': ['api.sendgrid.com'],
  postmark: ['api.postmarkapp.com'],
  '@sentry/react': ['sentry.io'],
  '@sentry/node': ['sentry.io'],
  'dd-trace': ['api.datadoghq.com'],
  newrelic: ['api.newrelic.com'],
  'posthog-js': ['app.posthog.com'],
  openai: ['api.openai.com'],
  '@anthropic-ai/sdk': ['api.anthropic.com'],
  '@google/generative-ai': ['generativelanguage.googleapis.com'],
  '@aws-sdk/client-s3': ['s3.amazonaws.com'],
  '@aws-sdk/client-dynamodb': ['dynamodb.us-east-1.amazonaws.com'],
  '@aws-sdk/client-bedrock-runtime': ['bedrock-runtime.us-east-1.amazonaws.com'],
  cloudinary: ['api.cloudinary.com'],
  twilio: ['api.twilio.com'],
  '@slack/web-api': ['slack.com'],
  mixpanel: ['api.mixpanel.com'],
  '@amplitude/analytics-browser': ['api2.amplitude.com'],
  '@googlemaps/js-api-loader': ['maps.googleapis.com'],
}
