# Availability model — exact correlated-failure engine

This replaces the Monte Carlo model described in the previous version of this document. The
structure of the problem (a handful of substrates, each either up or down; vendors down if their
own incident happens or their substrate does) is small and simple enough to compute **exactly** —
so we do, instead of sampling it. Demos are now deterministic: run it twice, get the same number.

Code: [`src/engine/correlated.ts`](../src/engine/correlated.ts) (pure math, no I/O, no randomness).
Orchestration: [`src/lib/availability.ts`](../src/lib/availability.ts). Monte Carlo
(`runMonteCarloAvailability`) still exists, but only as a seeded test oracle that cross-validates
this engine — see [`src/engine/correlated.test.ts`](../src/engine/correlated.test.ts).

## The model

- Each substrate `s` has an independent outage probability `q_s` — editable, illustrative
  (default 0.10%/yr; there's no independently measured per-substrate rate to draw from). This is a
  **real, separate risk source from a vendor's own SLA**, not derived from it.
- Each vendor `v` has its own outage probability `u_v = 1 - sla_v`, editable.
- Vendor `v` is down if its own outage happens **or** its substrate is down. Vendors on the same
  substrate share that one event — that's the correlation.
- A vendor whose only hosting tags are `self` / `other` / `unknown` gets **no** shared substrate —
  only its own outage. The UI reports "N vendors with unknown hosting, not counted as correlated."
  Nothing is fabricated for a vendor we have no real substrate signal for.
- "System up" is a series/AND system: every vendor must be up. There is no redundancy modeling
  beyond the curated fallback pairs below — a vendor's real failover architecture isn't derivable
  from a static repo scan.

## Three comparators

1. **NAIVE** — fully independent, `p_v = u_v`. What SLA-product math sees. Always the most
   optimistic: it doesn't know substrates exist.
2. **INDEPENDENT-SAME-MARGINALS (b)** — fully independent, `p_v = 1 - (1-u_v)(1-q_s(v))`. Same
   per-vendor marginal probability as the correlated model, but each vendor's substrate outage is
   sampled *separately* instead of shared. This isolates "substrate risk exists" from "substrates
   are shared" — the two effects `hiddenUpstream` and `concentrationEffect` decompose below.
3. **CORRELATED** — the real model: a substrate's outage is one event, shared by every vendor on
   it.

## Exact computation

- **`pmfNumberDown(model)`** — the distribution of `N`, the number of vendors down at once.
  Enumerates all `2^|S|` substrate up/down states (`|S| ≤ 12`, enforced). In each state, vendors
  touching a down substrate are down for certain; the rest are independent `Bernoulli(u_v)`,
  combined via a Poisson-binomial DP (`O(V²)`) and shifted by the certain count, weighted by the
  state's probability and Kahan-summed for precision.
- Tails (`P(N ≥ k)`) are summed **directly from the upper end** of the PMF, never `1 - CDF` — that
  subtraction loses precision to cancellation exactly when the tail is the interesting (small)
  number.
- **Series availability**, closed form: `∏_s(1-q_s) · ∏_v(1-u_v)` for correlated (only substrates
  with ≥1 vendor enter the product — an unattached substrate can't affect anything); `∏_v(1-p_v)`
  for the comparators. This equals `pmfNumberDown(model)[0]` exactly — tested as an invariant.
- **Redundancy groups** — a vendor's curated `fallbacks` (`server/src/vendorMap.ts`) naming
  another vendor that's *also* detected in this repo (e.g. Stripe ↔ Razorpay). This is real
  curated data, not an inferred guess from matching tiers. `P(group down)` = every member down at
  once, computed exactly over the same substrate-state enumeration. No such pair in a repo →
  reported as zero groups, not hidden.
- **Simulate a forced substrate outage** — the same `pmfNumberDown` function, with that substrate
  excluded from the enumeration and its vendors marked certainly-down instead. One function serves
  both the unconditional model and "what if X goes down."

## Metrics

- **`tailRisk`**: `P(N≥k)` for `k = 2, 3, ceil(25% of vendors)` (floored at 2), under all three
  models, plus `multiplier = correlated / same-marginals` (capped at `1,000x` for display, never
  `Infinity`).
- **`hiddenUpstreamHoursPerYear`** = downtime(same-marginals) − downtime(naive). Always ≥ 0: it's
  the substrate risk a vendor's own SLA doesn't capture, before sharing even enters the picture.
- **`concentrationEffectHoursPerYear`** = downtime(correlated) − downtime(same-marginals). For a
  series system this is **typically ≤ 0** — expanding the same-marginals product counts a shared
  substrate's up-probability once *per vendor* on it, while the correlated closed form counts the
  shared event once, total. **Sharing a substrate doesn't add expected downtime here — it turns
  many small, independent outages into fewer, bigger, simultaneous ones.** That's what `tailRisk`
  is for; a reader who only looks at expected downtime would conclude sharing is safe, which is the
  wrong conclusion for anyone planning failover capacity or an incident response process.
- **`worstSingleEvent`**: the single substrate whose outage takes down the most vendors, with the
  affected vendors, entrypoints downstream of them in the file graph (when available — `[]` for a
  manual/PR-mode graph, never fabricated), and its modeled `q_s`.

## Why exact, not sampled

At the probabilities involved (`~0.1%`), 20,000 Monte Carlo trials give a standard error around
`1e-4` in absolute availability — fine for the headline number, but a `P(N≥3)` tail event with true
probability `~1e-6` would need millions of trials to resolve at all, and a demo re-run would show a
different number each time. The state space here (`2^|S|` substrate combinations times a
Poisson-binomial DP) is small enough to enumerate exactly, so there's no reason to accept sampling
noise at all.

## Validation

- **Cross-validated against a seeded Monte Carlo oracle** (400,000 trials) on 20 random models
  (2–6 substrates, 3–25 vendors): `P(N≥k)` matches within 4 standard errors wherever the true
  probability is `≥ 1e-3`.
- **Cross-validated against full brute-force enumeration** (independent of the DP under test) on
  small models (`V ≤ 10`) for the tails too small for Monte Carlo to resolve.
- **Properties**, checked over seeded random loops: the PMF sums to 1 (within `1e-9`); `P(N=0)`
  equals the closed-form series availability; adding a vendor never increases `P(N=0)`; vendor
  order doesn't affect the PMF; vendors on all-distinct substrates make correlated exactly equal
  the same-marginals comparator; `q_s = 0` for every substrate makes correlated exactly equal
  naive.
- **A real bug was found by these property tests while building this**: the closed-form
  `correlatedSeriesAvailability` multiplied in `(1-q_s)` for *every* substrate in the assumptions
  map, including one with zero vendors actually on it. `pmfNumberDown` correctly marginalizes an
  unattached substrate away (it can't affect any vendor); the closed form didn't, and would have
  silently understated availability whenever a stale or unused substrate override was present. Now
  fixed and covered by a regression test.
- **Performance**: `|S|=10, V=60` measured at ~5ms locally (target: under 20ms).

## What is NOT modeled (explicit scope)

- Redundancy beyond curated fallback pairs — no general failover topology.
- Time-varying rates, seasonality, or dependence *between* different substrates (each substrate's
  coin flip is independent of every other substrate's).
- A live currency exchange rate (`src/lib/currency.ts`, ~83 INR/USD) — illustrative only, never
  presented as current.

## Before / after

**SkillSprint** (1 vendor, substrate = gcp, `sla = 0.999`) — the case that motivated this rewrite:

| | Before (Monte Carlo, buggy) | After (exact) |
|---|---|---|
| Naive | 99.90% (8.76 h/yr) | 99.90% (8.76 h/yr) |
| Correlated | 99.77% (~20.6 h/yr) | 99.80% (17.51 h/yr) |
| "Correlated share of downtime" | ~57.45% (**fabricated** — see the old doc's proof: a single vendor's own SLA was sampled twice) | *(metric removed — see below)* |
| Concentration effect | n/a | 0.00 h/yr (nothing to share with 1 vendor) |
| Hidden upstream | n/a | 8.75 h/yr (a real, separate, illustrative substrate risk — not a duplicate of the vendor's SLA) |

The "correlated share of downtime" card is gone because it conflated two different things: hidden
substrate risk that exists (`hiddenUpstream`) and the effect of *sharing* that risk
(`concentrationEffect`). With one vendor there's still real substrate risk (illustrative, honest,
separate) but genuinely nothing to share, which the old single number couldn't distinguish and the
new decomposition can.

**Illustrative 5-vendor showcase** (constructed, not a live repo scan — Stripe/Razorpay/Clerk/Sentry/Vercel
Blob, with Stripe+Razorpay sharing a curated fallback and 4 of the 5 vendors on AWS):

| | Naive | Same-marginals (b) | Correlated |
|---|---|---|---|
| Availability | 99.591% | 98.995% | 99.292% |
| Downtime h/yr | 35.9 | 88.1 | 62.0 |

- `hiddenUpstreamHoursPerYear` ≈ **52.2** — substrate risk the vendors' own SLAs don't capture.
- `concentrationEffectHoursPerYear` ≈ **−26.1** — sharing AWS *reduces* expected downtime for this
  need-everyone-up system, exactly as the model predicts.
- `tailRisk` at `k=3` (3+ vendors down at once): naive `4.6e-9`, same-marginals `7.7e-8`,
  **correlated `1.0e-3`** — a **>1,000x** multiplier, displayed capped. This is the number that
  matters for incident planning, and it's invisible in the expected-downtime figures above.
- `worstSingleEvent`: an AWS outage takes down 4 of 5 vendors at once, modeled at 0.10%/yr.
- `redundancyGroups`: Stripe + Razorpay, `P(both down)` ≈ `1.0e-3`/yr — dominated by their shared
  AWS substrate, not their individual SLAs.
