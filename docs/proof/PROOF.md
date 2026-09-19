# PR Resilience Gate — proof

Live demo of the gate running against real PRs, in a fork of the bundled showcase
repo (`documenso/documenso`, the same repo used throughout `docs/VERIFICATION.md`).

Fork: https://github.com/tannaya7/documenso
Workflow: `.github/workflows/blast-radius.yml` (uses `tannaya7/Domino/action@pr-resilience-gate`)
Policy: `.blast-radius.json` → `{"maxNewVendorsPerPr": 0, "failOn": "fail"}`

## PR 1 — should fail: adds a new vendor on an already-concentrated substrate

https://github.com/tannaya7/documenso/pull/1 ("Add mixpanel for product analytics")

Adds `mixpanel` to `package.json`. The repo's vendor graph is already 80%
concentrated on `aws` before this PR; Mixpanel resolves to the same substrate,
pushing concentration to 83%. `maxNewVendorsPerPr: 0` means any new vendor
violates policy.

Result: `gate` check **fails**. Sticky comment posted:
> :x: **Fail** — policy violation(s) found.
> `maxNewVendorsPerPr` — This PR introduces 1 new vendor(s), above the limit of 0 per PR.
> New vendors (1): **Mixpanel** (analytics) on `aws` — via `manifest:npm:mixpanel` in `package.json`

Run: https://github.com/tannaya7/documenso/actions/runs/35467124423
(earlier run against a since-replaced tunnel URL, same result: https://github.com/tannaya7/documenso/actions/runs/35466726759)

## PR 2 — should pass: harmless change, no new vendors

https://github.com/tannaya7/documenso/pull/2 ("docs: tighten wording in README intro")

A wording-only README edit. No manifest or import changes, so no new vendors
are detected.

Result: `gate` check **passes**. Sticky comment posted:
> :white_check_mark: **Pass** — within policy.
> New vendors (0): None detected.

Run: https://github.com/tannaya7/documenso/actions/runs/35467127491
(earlier run against a since-replaced tunnel URL, same result: https://github.com/tannaya7/documenso/actions/runs/35466781644)

## How this was verified

Both PRs were re-triggered (a synchronize push) twice across this proof's
lifetime — once after the demo API server was restarted from a cold start,
and again after its first public tunnel URL degraded mid-session (started
timing out, then returned 502s). Each time, the raw Action logs were pulled
with `gh run view --log` to confirm the request actually reached the API and
the job reached its real completion line (`##[error]Policy violated` for the
fail case, `Gate status: pass` for the pass case) rather than the `fail_open`
branch's `"Could not reach the API"` warning. The `gate` job's own log line
and the posted comment body are shown above as they came back from the
latest live run.

## A note on the API URL

`api-url` in `.github/workflows/blast-radius.yml` currently points at
`https://solid-deer-draw.loca.lt`, a temporary public tunnel (`loca.lt`) in
front of the local dev server used to build this feature. That tunnel is only
alive while the dev session runs it, and free `loca.lt` tunnels are known to
degrade mid-session (this proof's first tunnel, `every-hats-raise.loca.lt`,
went from working to timing out to returning 502s within about 15 minutes,
even though the local server behind it stayed healthy the whole time) — it is
**not a permanent public endpoint**. If you open the Action tab on either PR
and the `gate` job shows a fail-open ("Could not reach the API" warning,
status `pass`/`info` with no real verdict), the tunnel has gone down since
this proof was captured; the code path itself (steps 1-9 of the spec) is
exercised and tested independently in `server/test/prGate.test.ts`,
`server/test/policy.test.ts`, and `server/test/gateMarkdown.test.ts`, which
don't depend on the tunnel.

## Screenshots to capture (for a judge who wants a static artifact too)

1. PR #1's "Checks" tab showing `gate` — Failing, plus the sticky comment body.
2. PR #2's "Checks" tab showing `gate` — Passing, plus its sticky comment.
3. The `$GITHUB_STEP_SUMMARY` view for either run (Actions → the run → the
   job → the summary at the top of the page), showing the same markdown
   rendered outside the PR comment.
4. `.github/workflows/blast-radius.yml` and `.blast-radius.json` in the fork,
   to show the 30-second install surface described in the README.

## Note: Actions on forks

Actions are disabled by default on a forked repo. If cloning this proof setup
onto a different fork, go to that fork's **Actions** tab and click "I
understand my workflows, go ahead and enable them" first, or `pull_request`
events will never trigger the workflow.
