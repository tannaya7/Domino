#!/usr/bin/env bash
set -euo pipefail

# One-command deploy: sam build -> sam deploy -> read stack outputs -> build the frontend against
# the real API URL -> sync to S3 -> invalidate CloudFront -> print live URLs.
#
# ORDERING NOTE: the frontend is built AFTER `sam deploy`, not before. It needs the deployed API
# Gateway URL baked in at build time (VITE_API_BASE_URL, see src/lib/api.ts), which doesn't exist
# until the backend stack exists. Building frontend-first would either bake in a stale/guessed URL
# or require a second full deploy — this way there is exactly one `sam deploy`.

STACK_NAME="${STACK_NAME:-blast-radius-mapper}"
REGION="${AWS_REGION:-$(aws configure get region || true)}"

if [ -z "$REGION" ]; then
  echo "No AWS region resolved. Pass AWS_REGION=<region> or run 'aws configure set region <region>'." >&2
  exit 1
fi

PARAM_OVERRIDES=(
  "GithubTokenSsmParam=${GITHUB_TOKEN_SSM_PARAM:-/blast-radius-mapper/github-token}"
  "StatusPollRateMinutes=${STATUS_POLL_RATE_MINUTES:-5}"
  "EnableHealthApi=${ENABLE_HEALTH_API:-false}"
  "EnableReservedConcurrency=${ENABLE_RESERVED_CONCURRENCY:-false}"
)
[ -n "${BEDROCK_MODEL_ID:-}" ] && PARAM_OVERRIDES+=("BedrockModelId=${BEDROCK_MODEL_ID}")
[ -n "${BEDROCK_MODEL_ARN:-}" ] && PARAM_OVERRIDES+=("BedrockModelArn=${BEDROCK_MODEL_ARN}")
[ -n "${BEDROCK_REGION:-}" ] && PARAM_OVERRIDES+=("BedrockRegion=${BEDROCK_REGION}")
[ -n "${ALERT_EMAIL:-}" ] && PARAM_OVERRIDES+=("AlertEmail=${ALERT_EMAIL}")

echo "==> sam build"
sam build

echo "==> sam deploy (stack: $STACK_NAME, region: $REGION)"
sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAM_OVERRIDES[@]}"

echo "==> reading stack outputs"
stack_output() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

API_URL=$(stack_output ApiUrl)
FRONTEND_URL=$(stack_output FrontendUrl)
BUCKET_NAME=$(stack_output FrontendBucketName)
DISTRIBUTION_ID=$(stack_output CloudFrontDistributionId)

if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
  echo "Could not read ApiUrl from stack outputs — deploy may have failed." >&2
  exit 1
fi

echo "==> building frontend against $API_URL"
VITE_API_BASE_URL="$API_URL" npm run build

echo "==> syncing dist/ to s3://$BUCKET_NAME"
aws s3 sync dist/ "s3://$BUCKET_NAME" --delete --region "$REGION"

echo "==> invalidating CloudFront ($DISTRIBUTION_ID)"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" >/dev/null

echo ""
echo "Deployed."
echo "  API:      $API_URL"
echo "  Frontend: $FRONTEND_URL"
echo ""
echo "Next: scripts/verify-aws.ts exercises every integration on this deployed stack."
