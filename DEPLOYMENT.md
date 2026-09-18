# Deployment architecture

This documents the target AWS architecture and exactly what each piece needs. **None of this has
been deployed or run against a real AWS account yet** — no AWS credentials were available while
building it. The code is written to the real, documented service contracts (not stubbed), and is
covered by unit/integration tests that mock the AWS SDK — that is not the same as a verified live
deployment. Treat every step below as a checklist to run through once credentials exist, not as a
claim that it already works in production.

## Target architecture

```
S3 + CloudFront (static frontend, dist/)
        │ HTTPS
        ▼
API Gateway (HTTP API) ──▶ Lambda (server/src/lambdaHandler.ts)
                                │
                ┌───────────────┼───────────────┬──────────────┐
                ▼               ▼               ▼              ▼
          DynamoDB         Bedrock          AWS Health       SNS
        (graph-cache)   (risk narratives,   (or public      (vendor
                          runbooks)        status feed)    degradation)

EventBridge Scheduler (rate: 5 min) ──▶ Lambda ──▶ same statusPoll.ts + sns.ts logic
                                                     (server/src/scheduler.ts is the
                                                      local-process stand-in for this)
```

## Backend: Lambda + API Gateway

- Handler: `server/src/lambdaHandler.ts`, export `handler`. Written for API Gateway **HTTP API**
  (payload format 2.0) — `requestContext.http.method` + `rawPath` + `body`/`isBase64Encoded`.
- Runtime: Node.js 20.x. Build with your usual bundler (esbuild/tsc) targeting the `server/`
  TypeScript project; `server/tsconfig.json` already targets ES2023/ESM.
- All routing/business logic lives in `server/src/apiRouter.ts`, shared verbatim with the local
  Node server (`requestHandler.ts`) — there is no logic fork between local dev and Lambda.
- IAM role needs (only for the integrations you actually enable via env vars):
  - DynamoDB: `dynamodb:GetItem`, `dynamodb:PutItem` on the `graph-cache` table's ARN.
  - Bedrock: `bedrock:InvokeModel` on the specific model ARN you set as `BEDROCK_MODEL_ID`.
  - AWS Health (only if `AWS_HEALTH_ENABLED=true`): `health:DescribeEvents` — requires a Business
    or Enterprise Support plan on the account, or every call fails over to the public feed.
  - SNS: `sns:Publish` on the `SNS_ALERT_TOPIC_ARN` topic.
- Env vars: see the table in `README.md`.

## DynamoDB

Table `graph-cache` (name configurable via `DYNAMODB_GRAPH_CACHE_TABLE`):

- Partition key: `repo_url` (String)
- Attributes written: `graph_data` (String, JSON), `created_at` (Number, ms), `ttl_ms` (Number),
  `ttl` (Number, epoch seconds)
- **Enable native TTL on the `ttl` attribute** in the table settings/console — the app also does
  its own freshness check on `created_at`/`ttl_ms` on every read (DynamoDB's TTL sweep can lag by
  hours, so the app never relies on it alone for correctness).
- Billing mode: on-demand is simplest for unpredictable hackathon-demo traffic.

## Bedrock

- Request model access for your chosen Claude model in the Bedrock console for your account/region
  **before** setting `BEDROCK_MODEL_ID` — access is a manual, per-account grant, not something the
  SDK or this app can request programmatically.
- Set `BEDROCK_MODEL_ID` to the exact model id you were granted (e.g. a Claude model available in
  your region). Until you do, `/risk-summary` and `/runbook` silently use the deterministic
  fallback — verify Bedrock is actually working by checking `generatedBy` in a `/runbook` response.

## EventBridge Scheduler + SNS

- Create an EventBridge Scheduler rule at `rate(5 minutes)` (or your preferred cadence) targeting
  the same Lambda, with a distinct trigger path/event that calls
  `pollVendorStatusOnce()`/`startStatusPolling()`'s logic (`server/src/scheduler.ts`) instead of
  `apiRouter.ts`'s HTTP routes — package a second small handler that calls
  `pollVendorStatusOnce()` directly if you want it decoupled from API traffic.
- Create an SNS topic, subscribe your alert destination (email/Slack webhook/etc.), and set
  `SNS_ALERT_TOPIC_ARN` to its ARN.

## AWS Health

- Only attempted when `AWS_HEALTH_ENABLED=true`. On most accounts (no Business/Enterprise support
  plan) this will fail with `SubscriptionRequiredException` and fall back automatically to AWS's
  public status feed — this is expected, not a bug. Leave the env var unset unless you've confirmed
  your account's support plan actually includes Health API access.

## Frontend: S3 + CloudFront

- `npm run build` produces `dist/` — a static site, no server-side rendering.
- Upload `dist/` to an S3 bucket (private, accessed only via CloudFront Origin Access Control).
- Put a CloudFront distribution in front of it; set the default root object to `index.html` and add
  a custom error response (403/404 → `/index.html`, 200) so client-side routing (if any is added
  later) doesn't 404 on refresh.
- Set `VITE_API_BASE_URL` (see `src/lib/api.ts`) at build time to the deployed API Gateway URL —
  it defaults to `http://localhost:8787` for local dev.

## What's intentionally not here

- No CI/CD pipeline or IaC templates (Terraform/SAM/CDK) — writing untested infrastructure-as-code
  that has never been applied would be no more "verified" than the checklist above, and risks
  encoding mistakes with more authority than they deserve. Once credentials are available, the
  first real deployment should generate this from what actually works.
- No custom domain / TLS setup — use CloudFront's default domain and API Gateway's default endpoint
  to start; add these once the base deployment is confirmed working.
