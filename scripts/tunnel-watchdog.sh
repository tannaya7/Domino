#!/usr/bin/env bash
# Keeps the PR Resilience Gate demo reachable: polls the local API through the current
# public tunnel, and if it stops answering with 200, starts a fresh cloudflared quick
# tunnel and repoints the fork's workflow file at the new URL via the GitHub API.
#
# Not meant to run forever unattended — trycloudflare.com quick tunnels are an
# account-less convenience with no uptime guarantee, same as the loca.lt tunnel this
# replaced. This just makes single failures self-heal instead of silently rotting.
set -uo pipefail

CLOUDFLARED="C:/Users/DELL/tools/cloudflared.exe"
LOCAL_URL="http://localhost:8787"
LOG_DIR="/tmp"
TUNNEL_LOG="$LOG_DIR/cloudflared.log"
CURRENT_URL_FILE="$LOG_DIR/current-tunnel-url.txt"
FORK_REPO="tannaya7/documenso"
WORKFLOW_PATH=".github/workflows/blast-radius.yml"
POLICY_FILE_NAME=".blast-radius.json"
CHECK_INTERVAL_SECONDS="${CHECK_INTERVAL_SECONDS:-120}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

start_tunnel() {
  log "Starting a new cloudflared quick tunnel..."
  : > "$TUNNEL_LOG"
  nohup "$CLOUDFLARED" tunnel --url "$LOCAL_URL" >> "$TUNNEL_LOG" 2>&1 &
  local pid=$!
  echo "$pid" > "$LOG_DIR/cloudflared.pid"

  local url=""
  for _ in $(seq 1 15); do
    sleep 2
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)
    [ -n "$url" ] && break
  done

  if [ -z "$url" ]; then
    log "ERROR: cloudflared did not print a tunnel URL within 30s. See $TUNNEL_LOG."
    return 1
  fi

  log "New tunnel URL: $url"
  echo "$url" > "$CURRENT_URL_FILE"
  repoint_workflow "$url"
}

repoint_workflow() {
  local new_url="$1"
  local sha
  sha=$(gh api "repos/$FORK_REPO/contents/$WORKFLOW_PATH" --jq .sha 2>/dev/null) || {
    log "ERROR: could not read current workflow sha from $FORK_REPO"
    return 1
  }

  local tmp_wf
  tmp_wf=$(mktemp)
  cat > "$tmp_wf" << EOF
name: Blast Radius PR Resilience Gate

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write
  contents: read

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Blast Radius PR Resilience Gate
        uses: tannaya7/Domino/action@pr-resilience-gate
        with:
          api-url: $new_url
          policy-file: $POLICY_FILE_NAME
EOF

  local content_b64
  content_b64=$(base64 -w0 "$tmp_wf")
  gh api "repos/$FORK_REPO/contents/$WORKFLOW_PATH" -X PUT \
    -f message="watchdog: repoint gate at fresh tunnel ($new_url)" \
    -f content="$content_b64" \
    -f sha="$sha" \
    --jq '.commit.sha' && log "Repointed $FORK_REPO's workflow at $new_url"
  rm -f "$tmp_wf"
}

is_tunnel_healthy() {
  local url
  url=$(cat "$CURRENT_URL_FILE" 2>/dev/null) || return 1
  [ -z "$url" ] && return 1
  local code
  code=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' -X POST "$url/gate" \
    -H 'Content-Type: application/json' \
    -d '{"prUrl":"https://github.com/tannaya7/documenso/pull/2"}' 2>/dev/null)
  [ "$code" = "200" ]
}

log "Tunnel watchdog starting. Checking every ${CHECK_INTERVAL_SECONDS}s."

if ! is_tunnel_healthy; then
  start_tunnel || log "Initial tunnel start failed — will retry on next check."
fi

while true; do
  sleep "$CHECK_INTERVAL_SECONDS"
  if is_tunnel_healthy; then
    log "OK: $(cat "$CURRENT_URL_FILE" 2>/dev/null)"
  else
    log "Tunnel unhealthy — restarting."
    pkill -f "cloudflared.exe" 2>/dev/null || true
    sleep 2
    start_tunnel || log "Restart failed — will retry on next check."
  fi
done
