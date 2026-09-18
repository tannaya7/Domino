# Availability model — audit

This document describes exactly what the availability numbers in the UI mean, where every input
comes from, and a bug that was found and fixed while auditing it: a single-vendor deployment could
show a large, entirely artifactual "correlated share of downtime" with nothing behind it.

Code: [`src/lib/availability.ts`](../src/lib/availability.ts). Tests:
[`src/lib/availability.test.ts`](../src/lib/availability.test.ts).

## What "system is up" means

The model is a **series system with no redundancy**: the system is considered up in a trial only
if *every* detected vendor is up simultaneously (`anyVendorDown` in `runMonteCarloAvailability` —
if any vendor is down, the trial counts as down). There is no "redundancy by category" — a vendor's
`fallbacks` field (e.g. Stripe → Razorpay/Adyen) is used elsewhere in the app for remediation
suggestions, but it is **not** modeled here. This means the model treats every vendor as strictly
required and will *overstate* fragility for any vendor that has a real, working fallback in your
architecture. That's a known, deliberate limitation — modeling actual failover topology per vendor
isn't something we can infer from a static repo scan, so we don't fake it.

## Where the numbers come from

- **Vendor SLA** — a hand-curated value in [`server/src/vendorMap.ts`](../server/src/vendorMap.ts),
  one entry per known vendor (e.g. Stripe: 0.9999). These are best-effort published/typical SLA
  figures, not independently verified per-customer contracts, and the file says so at its top:
  "SLA and substrate are both editable per-node once surfaced in the UI, not treated as ground
  truth." The Assumptions panel is that surface — every vendor's SLA is directly editable there,
  and an edit never mutates the underlying knowledge base, only the simulation's inputs.
- **Substrate** — a coarse hosting-provider tag per vendor (`aws`, `gcp`, `azure`, `cloudflare`,
  ...), also hand-curated in the same file. It's coarse by design: exact regions aren't reliably
  publishable for most vendors.
- **Substrate failure rate** — there is no independently measured source for this. By default it's
  *derived* from vendor SLA (see below), and it's directly editable in the Assumptions panel for
  anyone who has real substrate-outage data.

## Naive vs. correlated — what each one actually computes

**Naive** (`calculateNaiveAvailability`): the product of every vendor's SLA, i.e. `sla1 * sla2 *
... * slaN`. This is the number most people compute in their head and it assumes every vendor fails
completely independently of every other one — no shared cause, ever.

**Correlated** (`runMonteCarloAvailability`): a Monte Carlo simulation. For each of `trials` runs
(default 20,000):

1. For every substrate that has a *derived or overridden* failure probability, flip a coin once —
   shared by every vendor on that substrate in this trial. This is the mechanism that represents
   concentration risk: if two vendors both sit on AWS and AWS has a bad day, they go down together,
   not independently.
2. For every vendor, roll its own incident independently (probability `1 - sla`).
3. A vendor is down in the trial if either (1) or (2) says so. The system is down in the trial if
   *any* vendor is down.

`correlatedAvailability` is the fraction of trials where the system stayed up.
`correlatedShareOfDowntime` (exposed to the UI as `invisibleShare`) is
`(correlatedDowntimeHours - naiveDowntimeHours) / correlatedDowntimeHours`, floored at 0 — the
share of downtime the naive independence assumption misses entirely.

### Why 20,000 trials

At the probabilities involved here (typically `1 - sla` in the 1e-3 to 1e-4 range), the binomial
standard error of the Monte Carlo estimate at 20,000 trials is on the order of 1e-4 in absolute
availability — small compared to the uncertainty already baked into the underlying SLA and
substrate-rate *assumptions* themselves. Going higher buys negligible extra precision for
meaningfully more compute; 20,000 trials runs in low single-digit milliseconds and comfortably fits
inside a Lambda invocation. `trials` is itself an editable, capped (`MAX_TRIALS = 100_000` in
`apiRouter.ts`) input, not a hidden constant.

## The bug: a lone vendor can't correlate with anything

**Reported symptom** (SkillSprint, 1 vendor, 1 substrate = `gcp`): naive 99.90% (~8.76 h/yr),
correlated 99.77% (~20.6 h/yr), "correlated share of downtime" ≈ 57.45%.

**Hypothesis to verify**: with one vendor there's nothing to correlate, so this number was
suspected to be a hidden substrate-level failure rate added *on top of* the vendor's own SLA,
rather than real correlation.

**What the code actually did** (pre-fix): `deriveDefaultSubstrateFailureProbabilities` computed
each substrate's failure probability as the mean of `1 - sla` across every vendor on that
substrate. With exactly one vendor on `gcp`, that mean is *exactly that vendor's own* `1 - sla` —
there's no second data point to average with. The Monte Carlo loop then:

- rolled that number once as "is the substrate down" (step 1 above), **and independently**
- rolled the vendor's own `1 - sla` again as "is the vendor's own incident happening" (step 2),

and OR'd the two together. For a lone vendor, both rolls draw from the *same underlying
probability*, sourced from the *same single number* (`1 - sla`) — so the vendor's true failure
probability `p` was being sampled through two independent random draws instead of one, giving:

```
P(down) = 1 - (1 - p)²   instead of   P(down) = p
```

That's **not correlation** (correlation needs at least two things to correlate) — it's the same
single risk source double-counted as a manufactured "substrate" event, on top of itself. This
exactly explains the reported jump from 99.90% → 99.77% and the fabricated-looking 57% share: it's
a mechanical artifact of the implementation, not a discovered transitive dependency.

Confirmed with the exact numbers: `sla = 0.999`, `p = 0.001`. Pre-fix expected availability =
`(1 - p)² = 0.998001` (99.80%, downtime ≈ 17.5 h/yr) versus the true single-source rate `sla =
0.999` (99.90%, downtime ≈ 8.76 h/yr) — the reported 99.77%/20.6h is consistent with this
mechanism (the small remaining gap is Monte Carlo noise, since the real run used the default 20,000
trials and non-round SLA/substrate inputs, not the clean numbers used here to illustrate the
mechanism).

### The fix

`deriveDefaultSubstrateFailureProbabilities` now **skips any substrate with fewer than 2 vendors on
it**. Correlation requires at least two parties; a substrate with exactly one vendor gets no
auto-derived rate, so that vendor's fate in the correlated model is governed solely by its own SLA
roll — the same distribution as the naive model, modulo Monte Carlo noise. An **explicit,
user-supplied** `substrateFailureProbabilities` override is *not* subject to this restriction and
is still applied regardless of vendor count, because it represents real external data the user is
asserting, not something derived from (and therefore duplicating) the vendor's own number.

Proof, as an automated regression test
(`'REGRESSION: a lone vendor on a substrate does not manufacture correlated risk out of nothing'`
in `availability.test.ts`): with 1 vendor, `sla = 0.999`, 100,000 trials, the fixed model's
`correlatedAvailability` lands close to the true single-source rate (0.999) and nowhere near the
old double-counted rate (0.998001); `correlatedShareOfDowntime` comes out under 5%, down from the
~57% the bug produced.

For substrates with **2 or more** vendors, the derivation and shared-draw mechanism are unchanged —
that's the legitimate case: vendors that really do share infrastructure really can go down
together, and that risk is invisible to the naive independence assumption. The model still does not
attempt to *net out* the overlap between a vendor's own SLA and its substrate's derived rate in the
multi-vendor case either (a vendor still gets two draws) — that decomposition isn't independently
knowable from public data, so, as before the fix, the model stays conservative (likely
understates availability) rather than presenting a falsely precise split. The difference the fix
makes is specifically: **stop inventing a shared-risk channel where there is provably nothing to
share it with.**

## The headline object

`/simulate` also returns a compact `headline` object (`buildAvailabilityHeadline`) for the UI:

```ts
{
  vendors: number          // vendor count in this simulation
  substrates: number       // distinct substrates those vendors run on
  invisibleShare: number   // same value as correlatedShareOfDowntime
  expectedLossPerYear: number // same value as expectedAnnualExposure.correlated
  breakdown: Array<{ substrate, vendorCount, failureProbability, contributesCorrelation }>
}
```

`breakdown` lists every substrate with `contributesCorrelation: false` when it has only one vendor
(matching the fix above) so the UI can show *why* `invisibleShare` is what it is — including why
it's honestly 0% for a single-vendor deployment — rather than just asserting a number.

## What is NOT modeled (explicit scope)

- Redundancy / fallback vendors (see "What system is up means" above).
- Netting out the overlap between a vendor's own SLA and its substrate's derived rate for
  multi-vendor substrates — deliberately left conservative, not fabricated as a precise split.
- Time-varying failure rates, seasonal effects, or dependence between *different* substrates (e.g.
  AWS and Cloudflare failing together) — each substrate's coin flip is independent of every other
  substrate's.
- Currency conversion is illustrative only (`src/lib/currency.ts`, ~83 INR/USD) — never presented
  as a live exchange rate.
