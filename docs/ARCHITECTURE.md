# Architecture

Two things live in this repo: the app itself (request flow below), and the PR Resilience Gate, a
separate GitHub Action that calls the same backend's `/gate` route. Both share the same failure
philosophy — see the fallback table at the bottom.

## Request flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant R as apiRouter.ts
    participant GH as GitHub REST API
    participant C as cache.ts (DynamoDB or in-memory)
    participant V as vendorResolver.ts

    U->>R: POST /analyze-repo {repoUrl}
    R->>C: getCachedGraph(owner/repo)
    alt cache hit, fresh
        C-->>R: cached AnalyzeRepoResult
    else cache miss or stale
        R->>GH: list repo tree + fetch file contents (capped, budgeted)
        GH-->>R: file contents
        R->>V: resolve vendors (imports, env vars, manifests, IaC)
        V-->>R: Vendor[]
        R->>R: build file graph, criticality, concentration (src/lib/*)
        R->>C: setCachedGraph(owner/repo, result)
    end
    R-->>U: {nodes, edges, vendors, vendorGraph, concentration, criticality, meta}
    U->>R: POST /simulate {repoUrl, scenarioId}
    R->>C: requireCachedAnalysis (400 if /analyze-repo hasn't run)
    R->>R: availability.ts — naive vs. correlated Monte Carlo
    R-->>U: {simulation, whatIf, recommendedMoves}
```

`/analyze-pr`, `/status`, `/runbook`, `/ask`, and `/gate` follow the same shape — one `apiRouter.ts`
function per route, all sharing `requireCachedAnalysis` where they operate on an already-scanned
repo. `/gate` is the one exception that does its own independent before/after scan (see
[docs/proof/PROOF.md](proof/PROOF.md) for what it actually returns on real PRs) rather than reusing
a single cached analysis, since it needs both the base and head SHA's vendor sets.

## Scheduler flow (vendor status polling)

```mermaid
sequenceDiagram
    participant EB as EventBridge Scheduler (rate: 5min)
    participant S as schedulerHandler.ts
    participant C as cache.ts
    participant SF as statusPoll.ts
    participant SNS as sns.ts

    EB->>S: invoke
    S->>C: scan graph-cache for watched vendors
    S->>SF: fetchAllVendorStatuses(vendors)
    loop each vendor with a statusUrl
        SF->>SF: fetch Statuspage JSON (timeout, catch -> "unknown")
    end
    SF-->>S: VendorStatus[]
    S->>SNS: publish alert (only on newly-degraded vendors)
```

Locally, `server/src/scheduler.ts` is the in-process stand-in for this — same
`fetchAllVendorStatuses`/`sns.ts` logic, driven by a `setInterval` instead of EventBridge.

## Request flow: PR Resilience Gate

```mermaid
sequenceDiagram
    participant Action as action/action.yml
    participant R as apiRouter.ts (/gate)
    participant GH as GitHub REST API
    participant P as policy.ts

    Action->>R: POST /gate {prUrl, policy?}
    R->>GH: fetch PR's changed files at base SHA and head SHA
    R->>R: run vendorResolver on both, diff -> newVendors
    R->>R: reuse blast-radius + availability.ts for impact
    R->>P: evaluatePolicy(summary, policy)
    P-->>R: {status, violations}
    R-->>Action: {newVendors, concentration, exposure, policy, markdown}
    alt policy.status == "fail"
        Action->>Action: exit 1
    else API unreachable/timeout/5xx
        Action->>Action: ::warning:: + exit 0 (fail-open, unless fail-on-error)
    end
    Action->>GH: upsert sticky comment by hidden marker (skipped on fork PRs — read-only token)
```

## Failure modes and fallbacks

| Component | Failure | Behavior | Where in code |
|---|---|---|---|
| GitHub API | Rate-limited, private repo, deleted repo, network error | Human-readable error surfaced to the UI; RepoInput offers "use sample data" or a bundled example as a working alternative | `server/src/github.ts` (`GithubApiError`), `src/components/RepoInput.tsx` |
| DynamoDB graph cache | `DYNAMODB_GRAPH_CACHE_TABLE` unset, or a call fails/times out | Falls back to an in-memory `Map` (same process only — lost on cold start) | `server/src/cache.ts` |
| Bedrock (risk summaries, runbooks) | `BEDROCK_MODEL_ID` unset, or the call fails | Deterministic generator produces the same output shape; response is labeled `generatedBy: "deterministic"` | `server/src/bedrock.ts`, `runbook.ts`, `riskSummary.ts` |
| AWS Health | `AWS_HEALTH_ENABLED` unset (default), or `SubscriptionRequiredException` (no Business/Enterprise support plan) | Falls back to AWS's public status RSS feed; if that also fails, reports `"unknown"` — never `"healthy"` | `server/src/awsHealth.ts` |
| Vendor status (Statuspage) | No `statusUrl`, network error, timeout, bad JSON | Reports `indicator: "unknown", stale: true` — the UI never shows a fabricated "operational" | `server/src/statusPoll.ts` |
| SNS alerts | `SNS_ALERT_TOPIC_ARN` unset | No-op — nothing errors, nothing is sent | `server/src/sns.ts` |
| PR Resilience Gate API call | Down, times out (28s), non-2xx | `::warning::` + exit 0 (never blocks the PR on a backend outage), unless `fail-on-error: true` | `action/action.yml` |
| PR Resilience Gate comment post | PR is from a fork (read-only `GITHUB_TOKEN`) | Comment is skipped; the same markdown still goes to `$GITHUB_STEP_SUMMARY`; the check itself still evaluates and can still fail | `action/action.yml` |
| Whole backend unreachable from the browser | Any `fetch` failure to the API base URL | A dismissible "API unreachable: example snapshots still work" banner appears (polls `GET /health` every 30s); every bundled example repo and the JSON-paste tab work fully offline from the backend | `src/lib/useApiHealth.ts`, `src/components/ApiHealthBanner.tsx` |
| Malformed/oversized request body | Body over `MAX_BODY_BYTES`, or unparseable JSON | `413`/`400` with a specific message — never a crash | `server/src/limits.ts`, `requestHandler.ts`, `lambdaHandler.ts` |

`GET /health` (added for this submission — see `server/src/apiRouter.ts`'s `healthCheck()`) reports
which of the above integrations are configured in the running process, so "backend is up" and
"backend is up but running every fallback" are distinguishable without guessing from behavior.
