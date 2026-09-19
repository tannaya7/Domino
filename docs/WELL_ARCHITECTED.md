# Well-Architected notes

Every claim below points at a specific resource/property in [`template.yaml`](../template.yaml) —
nothing here is a general "AWS is well-architected" statement. This is the target architecture
(see [docs/AWS_VERIFICATION.md](AWS_VERIFICATION.md): not yet deployed), so these are properties of
the template, not properties of a running system under real traffic. Anything not listed here
(e.g. multi-region, WAF, a real load test) was deliberately left out of scope rather than claimed
and left unverified — see [DEPLOYMENT.md](../DEPLOYMENT.md)'s "What's intentionally not here".

## Security

- **Least-privilege IAM, scoped per resource, not per service.** `ApiFunction`'s policy grants
  `dynamodb:*` only on `GraphCacheTable`'s own ARN (`DynamoDBCrudPolicy`), `ssm:GetParameter` only
  on the exact `GithubTokenSsmParam` ARN, and `bedrock:InvokeModel` only on the specific
  `BedrockModelArn` parameter — never `Resource: '*'` for any of these. The one exception is AWS
  Health's `health:Describe*`, which is `Resource: '*'` because AWS Health's API does not support
  resource-level scoping at all (documented inline in `template.yaml`) — not an oversight.
  `SchedulerFunction`'s policy is separately scoped: read-only on the cache table
  (`DynamoDBReadPolicy`), publish-only on `VendorAlertsTopic`'s own ARN.
- **A GitHub PAT is never a plaintext Lambda env var.** It's read from an SSM `SecureString`
  parameter (`GithubTokenSsmParam`, default `/blast-radius-mapper/github-token`) at invocation
  time, created out-of-band before deploy (`DEPLOYMENT.md`) — the template only grants
  `ssm:GetParameter` on that one parameter name.
- **S3 is fully private.** `FrontendBucket` blocks all public ACLs/policies
  (`PublicAccessBlockConfiguration`); the only reader is CloudFront via Origin Access Control
  (`FrontendOAC` + a bucket policy scoped to `AWS:SourceArn` = this specific distribution).
- **CORS is locked to the real origin, not `*`, once deployed.** `HttpApi`'s
  `CorsConfiguration.AllowOrigins` is `https://${CloudFrontDistribution.DomainName}` — the `'*'`
  default in `requestHandler.ts`/`lambdaHandler.ts` is explicitly a **local-dev-only** fallback
  (`ALLOWED_ORIGIN` env var), read live per-request rather than cached at module load.

## Reliability

- **API throttling is set, not left at account defaults.** `HttpApi.DefaultRouteSettings`:
  `ThrottlingRateLimit: 5`, `ThrottlingBurstLimit: 10` — deliberately conservative for a
  low-traffic demo deployment, not a production capacity plan.
- **DynamoDB TTL is enabled at the table level**, not just handled in application code.
  `GraphCacheTable.TimeToLiveSpecification` (`AttributeName: ttl, Enabled: true`) — the app also
  independently checks `created_at`/`ttl_ms` on every read (`server/src/cache.ts`) because DynamoDB's
  TTL sweep can lag by hours and the app never relies on it alone for correctness; the table-level
  setting exists for storage cost, not correctness.
- **CloudWatch alarms on both failure surfaces, wired to the same alert path.**
  `ApiFunctionErrorsAlarm` (Lambda `Errors` ≥ 1 in 5 minutes) and `HttpApi5xxAlarm` (API Gateway
  `5xxError` ≥ 1 in 5 minutes) both publish to `VendorAlertsTopic` — the same SNS topic vendor-
  degradation alerts use, so "the app is broken" and "a vendor is broken" land in one inbox rather
  than needing separate alerting setup. `TreatMissingData: notBreaching` so a quiet period (no
  traffic) never itself pages anyone.
- **Log retention is bounded, not indefinite.** Both `ApiFunctionLogGroup` and
  `SchedulerFunctionLogGroup` set `RetentionInDays: 14` explicitly — CloudWatch Logs default to
  never-expire otherwise.

## Cost optimization

- **On-demand DynamoDB billing.** `GraphCacheTable.BillingMode: PAY_PER_REQUEST` — no provisioned
  capacity to pay for during idle periods, appropriate for unpredictable demo/hackathon traffic
  (documented tradeoff, not a universal recommendation — a sustained high-traffic workload would
  likely be cheaper provisioned).
- **arm64 (Graviton) for every Lambda.** `Globals.Function.Architectures: [arm64]` applies to both
  `ApiFunction` and `SchedulerFunction` — typically both cheaper and faster than x86_64 for
  Node.js workloads, with no code change required.
- **Reserved concurrency is opt-in, not default-on**, specifically because new AWS accounts often
  have only a 10-concurrency total account quota — `EnableReservedConcurrency=false` by default so
  a first deploy doesn't fail on that quota; set `true` once you've confirmed headroom.

## Operational excellence

- **One route table, not one Lambda per endpoint.** `HttpApi`'s only route is `$default` → a single
  `ApiFunction` running `apiRouter.ts` — adding a new API endpoint is a code change, never a
  template change, which also means IAM/throttling/logging policy is defined once, not duplicated
  per route.
- **The scheduler is a genuinely separate Lambda with no shared memory**, not an in-process timer
  masquerading as "serverless" — `SchedulerFunction` is deployed, scheduled (`StatusPollSchedule`,
  `EventBridge::Scheduler`), and IAM-scoped independently of `ApiFunction`, so its failure mode
  and blast radius are isolated from API traffic. `server/src/scheduler.ts` (the local-dev
  `setInterval` stand-in) is explicitly documented as a stand-in, not presented as the same thing.

## What's honestly missing

- No multi-AZ/multi-region failover — Lambda/API Gateway/DynamoDB are all regional services here,
  single-region by default with no explicit DR story.
- No WAF, no custom domain/TLS beyond CloudFront's default certificate.
- No load testing — the throttling limits above are conservative defaults, not numbers derived
  from measuring this app's actual capacity.
- Nothing on this page has been evaluated against real traffic — see
  [docs/AWS_VERIFICATION.md](AWS_VERIFICATION.md) for the one live-verified integration (GitHub)
  versus everything still running its local fallback.
