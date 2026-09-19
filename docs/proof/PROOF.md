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

Run: https://github.com/tannaya7/documenso/actions/runs/35476457501
(earlier runs against since-replaced tunnels/tokens, same result:
https://github.com/tannaya7/documenso/actions/runs/35467422897,
https://github.com/tannaya7/documenso/actions/runs/35467124423,
https://github.com/tannaya7/documenso/actions/runs/35466726759)

## PR 2 — should pass: harmless change, no new vendors

https://github.com/tannaya7/documenso/pull/2 ("docs: tighten wording in README intro")

A wording-only README edit. No manifest or import changes, so no new vendors
are detected.

Result: `gate` check **passes**. Sticky comment posted:
> :white_check_mark: **Pass** — within policy.
> New vendors (0): None detected.

Run: https://github.com/tannaya7/documenso/actions/runs/35476459247
(earlier runs against since-replaced tunnels/tokens, same result:
https://github.com/tannaya7/documenso/actions/runs/35467424727,
https://github.com/tannaya7/documenso/actions/runs/35467127491,
https://github.com/tannaya7/documenso/actions/runs/35466781644)

## How this was verified

Both PRs were re-triggered (a synchronize push) multiple times across this
proof's lifetime: after the demo API server was restarted from a cold start,
after its first tunnel (`loca.lt`, free tier) degraded mid-session (went from
working to timing out to returning 502s within about 15 minutes, even though
the local server behind it stayed healthy throughout), again after switching
to a Cloudflare quick tunnel, and once more after the backend's `GITHUB_TOKEN`
was rotated (a routine security rotation, unrelated to the gate itself — the
backend process was restarted to pick up the new token, which briefly took
its old tunnel down and triggered the watchdog's normal auto-heal onto a
fresh one). Each time, the raw Action logs were pulled with `gh run view
--log` to confirm the request actually reached the API and the job reached
its real completion line (`##[error]Policy violated` for the fail case,
`Gate status: pass` for the pass case) rather than the `fail_open` branch's
`"Could not reach the API"` warning. The `gate` job's own log line and the
posted comment body are shown above as they came back from the latest live
run.

## A note on the API URL

`api-url` in `.github/workflows/blast-radius.yml` currently points at a
Cloudflare quick tunnel (`*.trycloudflare.com`) in front of the local dev
server used to build this feature, kept alive and self-healing by
`scripts/tunnel-watchdog.sh` (polls the tunnel every 2 minutes; on a failed
health check it starts a fresh `cloudflared` tunnel and repoints this fork's
workflow file at the new URL via the GitHub API automatically). This
replaced an earlier `loca.lt` tunnel that degraded to 502s within about 15
minutes of a clean start.

None of this makes the endpoint **permanent** — it is still a local dev
server behind an account-less quick tunnel, with no uptime guarantee, and it
goes away the moment the host machine or watchdog process stops running.
A genuinely permanent endpoint means deploying the real backend via
`scripts/deploy.sh` (AWS SAM: API Gateway + Lambda + CloudFront, see
`docs/AWS_VERIFICATION.md`), which needs AWS credentials configured and
incurs ongoing AWS cost — deliberately not done as part of this proof.

If you open the Action tab on either PR and the `gate` job shows a fail-open
("Could not reach the API" warning, status `pass`/`info` with no real
verdict), the tunnel and/or watchdog have stopped running since this proof
was captured. The code path itself (steps 1-9 of the spec) is exercised and
tested independently of any tunnel in `server/test/prGate.test.ts`,
`server/test/policy.test.ts`, and `server/test/gateMarkdown.test.ts`.

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
