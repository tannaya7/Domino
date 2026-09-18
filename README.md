# Blast Radius — Third-Party Dependency Risk Mapper

See what breaks before it breaks — map your system's file-level dependencies *and* its third-party vendor exposure, and understand the blast radius, concentration risk, and financial exposure of any failure.

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

## Running locally

```bash
npm install
npm run dev          # frontend — http://localhost:5173
npm run server:dev   # backend  — http://localhost:8787 (separate terminal)
```

Other scripts: `npm run test` (vitest, frontend + backend), `npm run build` (production build), `npm run lint`.
