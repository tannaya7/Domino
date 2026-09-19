# Blast Radius — Third-Party Dependency Risk Mapper

See what breaks before it breaks — map your system's file-level dependencies *and* its third-party vendor exposure, and understand the blast radius, concentration risk, and financial exposure of any failure.

**This project is AI-assisted — see [docs/VERIFICATION.md](docs/VERIFICATION.md) for what's actually verified** (differential tests against brute-force reference implementations, iterative-traversal robustness at 100,000+ nodes, scanner fuzzing, a short security review, and real numbers from the last CI run — not hand-typed claims). AWS/Bedrock-specific integration status is in [docs/AWS_VERIFICATION.md](docs/AWS_VERIFICATION.md).

## What it does

- Paste a GitHub repo URL (or upload/paste a dependency JSON file, or a GitHub PR URL).
- **File graph** (the original layer, still fully intact): an interactive dependency graph. Click any node to see everything upstream/downstream highlighted, with a risk level and a plain-English risk summary.
- **Vendor discovery**: detects third-party vendors from bare imports, environment variable references, package manifests (`package.json`, `requirements.txt`, `go.mod`, `Gemfile`, `pom.xml`), and IaC files (Terraform, `serverless.yml`, `vercel.json`) — see `server/src/vendorMap.ts` for the curated vendor knowledge base.
- **Concentration analysis**: groups vendors by shared hosting substrate to surface "N vendors, but really just M independent substrates."
- **Criticality analysis**: graph-theory articulation points plus semantic reachability loss — two independent, sometimes-disagreeing signals, shown side by side rather than collapsed into one score.
- **Failure simulation**: naive (independent) vs. correlated (shared-substrate) availability via Monte Carlo, plus expected downtime and financial exposure under explicit, editable assumptions.
- **Live status**: per-vendor Statuspage polling and an AWS Health check (falls back to AWS's public status feed when the account has no Business/Enterprise support plan) — a status source that can't be reached reports "unknown," never a fabricated "healthy."
- **Remediation runbooks**: Bedrock-generated when configured, with a deterministic generator as the always-available fallback.
- A system overview page ranks every component by blast radius. PR analysis highlights every file a PR changes at once and shows the combined blast radius before you merge.

## Project layout

- `src/lib/` — shared, pure-logic core (also used by the backend): the file-graph engine (`graph.ts`), plus `concentration.ts`, `criticality.ts`, `availability.ts`, and the shared type contracts in `types.ts`.
- `server/` — local Node/TypeScript backend (also deployable to Lambda, see below): `repoParser.ts` walks a repo's import graph and runs vendor discovery; `vendorMap.ts`/`vendorResolver.ts`/`envScanner.ts`/`manifestParser.ts`/`iacParser.ts` are the detection pipeline; `cache.ts`, `bedrock.ts`, `awsHealth.ts`, `sns.ts` are the real AWS integrations (see below); `apiRouter.ts` is the transport-agnostic route logic shared by `requestHandler.ts` (local Node http server) and `lambdaHandler.ts` (API Gateway).

## AWS integration

Every AWS integration is real when configured, and degrades to a deterministic/local fallback when it isn't — the app is fully usable with zero AWS credentials. Nothing here has been verified against a live AWS account yet (no credentials were available while building it); see `DEPLOYMENT.md`.

| Env var | Enables | Fallback when unset/failing |
|---|---|---|
| `DYNAMODB_GRAPH_CACHE_TABLE` | Real graph cache in DynamoDB | In-memory cache (same process only) |
| `BEDROCK_MODEL_ID` | Real risk narratives + runbooks via Bedrock | Deterministic generator (same output shape) |
| `AWS_HEALTH_ENABLED=true` | Real AWS Health `describeEvents` (needs a Business/Enterprise support plan) | Public AWS status feed, then "unknown" |
| `SNS_ALERT_TOPIC_ARN` | Vendor-degradation alerts published to SNS | No-op (alerts aren't sent, nothing errors) |
| `AWS_REGION` | Region for all of the above | `us-east-1` |
| `GITHUB_TOKEN` | Higher GitHub API rate limits | Falls back to `gh auth token`, then unauthenticated |

Credentials always resolve via the standard AWS SDK credential chain (env vars, shared config, IMDS, ...) — never hardcoded.

## PR Resilience Gate (GitHub Action)

A composite GitHub Action (bash + curl + jq + gh only — no Node runtime, no build step) that comments on every PR with the new shared-fate vendor risk it introduces, and can fail the check against a policy file you own.

### Add it in 30 seconds

1. Copy [`examples/workflow.yml`](examples/workflow.yml) to `.github/workflows/blast-radius.yml` and set `api-url` to a running Blast Radius Mapper API.
2. (Optional) Copy [`examples/.blast-radius.json`](examples/.blast-radius.json) to `.blast-radius.json` at your repo root to turn on policy enforcement — without it, the gate is report-only and never fails the check.
3. Push. Every PR gets a sticky comment (updated in place on new pushes, not reposted) with new vendors, before/after concentration, modeled exposure delta, and a "why it matters" note.

If you forked the showcase repo to try this yourself: **Actions are disabled by default on forks** — go to the Actions tab of your fork and enable them, or the workflow will silently never trigger.

### Policy schema (`.blast-radius.json`)

| Key | Type | Meaning |
|---|---|---|
| `maxSubstrateShare` | 0-1 | Fail if more than this share of vendors would share one substrate after the PR. |
| `minSubstrates` | integer | Fail if fewer than this many distinct substrates remain after the PR. |
| `maxNewVendorsPerPr` | integer | Fail if the PR introduces more new vendors than this. |
| `maxEntrypointsAffectedPct` | 0-100 | Fail if more than this percent of the repo's entrypoints are affected. |
| `maxExposureIncreasePerYear` | number | Fail if modeled annual exposure increases by more than this (a decrease never fails). |
| `failOn` | `"fail"` \| `"warn"` | Whether a violation blocks the check (`fail`, exit 1) or just comments (`warn`, default). |

No policy file → every PR is report-only (`status: "info"`), and the check never fails — you get the visibility first, and can turn on enforcement whenever you're ready. An unknown key in the policy file is rejected with a clear error rather than silently doing nothing.

### Real-world behavior

- **Fails open.** If the API is down, times out (28s), or errors, the check warns and passes — a backend outage never blocks every PR in the repo (`fail-on-error: true` overrides this if you want the opposite).
- **Fork PRs get a read-only token** by GitHub's own design — the gate detects this, skips the comment, and still writes the same report to the job's step summary, without failing.
- **Never re-posts.** The comment carries a hidden marker and is updated in place on every push to the PR, not duplicated.

## Running locally

```bash
npm install
npm run dev          # frontend — http://localhost:5173
npm run server:dev   # backend  — http://localhost:8787 (separate terminal)
```

Other scripts: `npm run test` (vitest, frontend + backend), `npm run build` (production build), `npm run lint`.
