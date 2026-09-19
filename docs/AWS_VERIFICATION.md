# AWS integration verification status

This is a factual log of what has and hasn't actually been exercised against a real AWS/GitHub
account, kept separate from [VERIFICATION.md](VERIFICATION.md)'s algorithmic/security evidence
because "does the code have a fallback for X" and "has X actually been tested live" are different
claims — see the README's own integration table for what each fallback is.

| Integration | Status | Evidence |
|---|---|---|
| **GitHub API (`GITHUB_TOKEN`)** | ✅ Verified live | A PAT was configured in `server/.env` (git-ignored — confirmed absent from git history via `git log --all -G`) and used for real `/analyze-repo` calls against `documenso/documenso`, `formbricks/formbricks`, and `stripe-samples/checkout-one-time-payments` during this session. Confirmed the token raised the anonymous 60 req/hour quota and that live analysis returns real vendor/file-graph data end-to-end through the actual UI. Correction: this token is a classic PAT (`ghp_` prefix), not fine-grained as an earlier version of this doc claimed — `.env.example` still recommends fine-grained ("Public repositories (read-only)") going forward; rotate and reissue as fine-grained next. |
| **Amazon Bedrock (`BEDROCK_MODEL_ID`)** | ❌ Not configured, not tested live | No Bedrock model access was available this session (`BEDROCK_MODEL_ID` is unset in `server/.env`). The Converse tool-use path (`server/src/ask.ts`, `server/src/bedrock.ts`) is verified only via mocked-SDK unit tests (18 tests, see VERIFICATION.md) — never against a real Bedrock endpoint. The deterministic fallback path (runbooks, risk summaries, the 3 suggested Ask-Blast-Radius questions) **is** verified live, since it's what actually runs without Bedrock configured. |
| **DynamoDB (`DYNAMODB_GRAPH_CACHE_TABLE`)** | ❌ Not configured, not tested | Unset. The app runs on the in-memory cache fallback (`server/src/cache.ts`) for the whole of this session — verified working, but that's the fallback, not the DynamoDB path. |
| **AWS Health (`AWS_HEALTH_ENABLED`)** | ❌ Not configured, not tested | Unset. `server/src/awsHealth.ts`'s public-status-feed fallback was exercised (via `/status`); the real `describeEvents` API (which needs a Business/Enterprise support plan) was never reached. |
| **SNS (`SNS_ALERT_TOPIC_ARN`)** | ❌ Not configured, not tested | Unset. The no-op fallback path is what ran. |
| **AWS deployment (Lambda/API Gateway via `template.yaml`)** | ❌ Not deployed | No `samconfig.toml` exists in this repo; every verification this session ran against `npm run server:dev` (local Node http server, `server/src/localServer.ts` + `requestHandler.ts`), never `lambdaHandler.ts` behind real API Gateway. `lambdaHandler.ts`'s routing logic is covered by `server/test/lambdaHandler.test.ts` (mocked event shapes), not a live invocation. |

## What this means for the claims in VERIFICATION.md

Every algorithmic/security claim in VERIFICATION.md (differential tests, fuzzing, robustness,
resolver coverage) was run against the **real engine code**, locally, via `npm test` — that
evidence doesn't depend on AWS at all. The only AWS-shaped claim this file can make is: **GitHub
integration is real and verified; every other AWS service in the README's table is running its
documented fallback, not the real integration**, because no AWS account was available to configure
them. This is not a gap in testing rigor — every fallback path itself is exercised and correct —
it's an honest boundary on what "verified" can mean without AWS credentials.

If BEDROCK_MODEL_ID/AWS credentials become available, the one high-value follow-up is a real
`/ask` call against a live Bedrock model to confirm the Converse tool-use loop's *actual* wire
format matches what the mocked tests assume (`server/test/ask.test.ts` mocks
`@aws-sdk/client-bedrock-runtime`'s response shape rather than a real API response).
