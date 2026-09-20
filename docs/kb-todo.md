# Vendor knowledge-base TODO

Generated during the data-driven KB migration (2026-09-19). Every substrate claim below has
confidence `reported` or `unknown` — either no official source was found, or (for the two entries
under **Conflicts**) a live DNS/IP-range check produced evidence that disagrees with the curated
value. The curated `substrate` value was left unchanged in both conflict cases (this migration's
constraint was "behavior must not change"), but a human should look at these before the next
release.

None of this was invented — see each `vendors/<id>.json`'s `substrate[].evidence` for exactly what
was (or wasn't) found, and `scripts/verify-substrates.ts` / `docs/substrate-verification.md` for the
underlying DNS/IP-range check this was built from.

## Conflicts (look at these first)

- **SendGrid** (`vendors/sendgrid.json`) — curated substrate is `azure`, but a live check found
  `api.sendgrid.com` resolving inside AWS's published IP ranges (region ap-southeast-1). Either the
  curated value is stale (SendGrid/Twilio infra has moved before) or the specific endpoint checked
  isn't representative. Needs a human decision: confirm `azure` with a real source, or update to
  `aws`.
- **Mixpanel** (`vendors/mixpanel.json`) — curated substrate is `aws`, but a live check found
  `api.mixpanel.com` resolving inside Google Cloud's published ranges (region global). Same
  decision needed.

## No official source found (confidence: unknown)

Grouped by vendor; the DNS check ran for most of these (see the note in each JSON's evidence, when
present) and did not confirm or deny the curated value — an inconclusive/edge-only result is
honestly `unknown`, not a confirmation.

- **Stripe** — `aws` (DNS check found no CNAME/IP-range match; ASN belongs to Amazon, but that alone
  isn't a confirmed hosting claim per this project's evidence bar)
- **Braintree** — `aws` (DNS check inconclusive; ASN belongs to Cloudflare, likely a CDN in front)
- **Clerk** — `aws`, `cloudflare` (never checked — no single global host to check; per-tenant
  subdomains)
- **Auth0** — `aws` (never checked — per-tenant subdomains)
- **Firebase** — `gcp` (DNS check inconclusive)
- **Supabase** — `aws` (never checked — per-tenant subdomains)
- **PlanetScale** — `aws` (never checked — per-tenant subdomains)
- **MongoDB Atlas** — `aws` (never checked — per-tenant subdomains)
- **Resend** — `aws` (DNS check found a Cloudflare-edge match, not a confirmation of `aws`)
- **New Relic** — `aws` (DNS check inconclusive)
- **OpenAI** — `azure` (DNS check found a Cloudflare-edge match, not a confirmation of `azure` —
  worth a second look given the edge finding doesn't corroborate the curated cloud at all)
- **Anthropic** — `aws`, `gcp` (DNS check inconclusive for both)
- **Google AI** — `gcp` (DNS check inconclusive, despite being a first-party Google product — the
  live finding didn't confirm it, so left honestly unknown rather than assumed)
- **Cloudinary** — `gcp` (the `aws` entry for this vendor IS verified; `gcp` specifically was never
  independently confirmed)
- **Datadog** — `gcp` (the `aws` entry for this vendor IS verified; `gcp` specifically was never
  independently confirmed)
- **Slack** — `gcp` (the `aws` entry for this vendor IS verified; `gcp` specifically was never
  independently confirmed)
- **Algolia** — `gcp`, `aws` (never checked — per-tenant subdomains)
- **Google Maps** — `gcp` (DNS check inconclusive)
- **Twilio** — `gcp` (the `aws` entry is `reported`, edge-only evidence; `gcp` was never checked at
  all)
- **NextAuth.js** — `self` (self-hosted by definition; nothing to verify against a third party)

## What would resolve one of these

Either an official source (the vendor's own architecture/trust/security page naming their cloud
provider) to set confidence to `verified`, or a repeat DNS/IP-range check
(`npm run verify:substrates`) landing on a direct (non-edge) match. Add the evidence URL to the
vendor's `substrate[].evidence` array, set `confidence` accordingly, run `npm run kb:generate`, and
remove that vendor from this file.

## Why the footer says 30 vendors, not 33 (investigated, not a bug)

The pre-migration hardcoded `VENDOR_MAP` (see `git show 49d37a1^:server/src/vendorMap.ts`) had 33
*keys*, but three vendors were each registered under two separate npm package names, counted twice:

- **Clerk** — `@clerk/nextjs` and `@clerk/clerk-react`
- **Firebase** — `firebase` and `firebase-admin`
- **Sentry** — `@sentry/react` and `@sentry/node`

That's 33 keys for 30 *distinct* vendors. `vendors/*.json` (30 files) now has exactly one file per
distinct vendor — the correct, deduplicated model — and each of the three above lists its second
package name in its own `aliases` array (`vendors/clerk.json`, `vendors/firebase.json`,
`vendors/sentry.json`). `scripts/generate-vendor-map.ts` compiles `aliases` into additional
`VENDOR_MAP` entries, so **all 33 original detection keys still resolve** — confirmed by diffing the
pre-migration `VENDOR_MAP` keys against the generated one (all present) and by cross-checking every
one of the 30 vendor names against the pre-migration vendor list (exact match, nothing missing,
nothing extra). Regression coverage: `server/test/vendorResolver.test.ts` / `vendorMap` generation
tests already exercise both package names for these three vendors.

Nothing to restore here — the count difference is intentional deduplication, not data loss.
