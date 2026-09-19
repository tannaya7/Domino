#!/usr/bin/env bash
# Keeps the whole app's live demo URL (not just the PR gate's backend) reachable: serves the
# production build (npm run build) through a Cloudflare quick tunnel, and rebuilds it whenever
# the backend tunnel URL changes (VITE_API_BASE_URL is baked in at build time, so the frontend
# can't just "notice" a new backend URL at runtime the way a runtime config would).
#
# Depends on scripts/tunnel-watchdog.sh already running and keeping the BACKEND tunnel URL fresh
# in $BACKEND_URL_FILE — this script only manages the FRONTEND half (static server + its own
# tunnel) and reads that file rather than duplicating backend-tunnel logic.
#
# Same caveat as tunnel-watchdog.sh: trycloudflare.com quick tunnels have no uptime guarantee.
# This makes single failures self-heal; it does not make the URL permanent.
set -uo pipefail

CLOUDFLARED="C:/Users/DELL/tools/cloudflared.exe"
FRONTEND_PORT=4173
LOG_DIR="/tmp"
BACKEND_URL_FILE="$LOG_DIR/current-tunnel-url.txt"
FRONTEND_TUNNEL_LOG="$LOG_DIR/cloudflared-frontend.log"
FRONTEND_URL_FILE="$LOG_DIR/current-frontend-url.txt"
LAST_BUILT_BACKEND_URL_FILE="$LOG_DIR/last-built-backend-url.txt"
SERVE_LOG="$LOG_DIR/serve.log"
CHECK_INTERVAL_SECONDS="${CHECK_INTERVAL_SECONDS:-120}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

rebuild_frontend_if_backend_changed() {
  local backend_url
  backend_url=$(cat "$BACKEND_URL_FILE" 2>/dev/null) || return 1
  [ -z "$backend_url" ] && return 1

  local last_built
  last_built=$(cat "$LAST_BUILT_BACKEND_URL_FILE" 2>/dev/null || true)
  if [ "$backend_url" = "$last_built" ]; then
    return 0
  fi

  log "Backend URL changed ($last_built -> $backend_url) — rebuilding frontend..."
  (cd "$REPO_ROOT" && VITE_API_BASE_URL="$backend_url" npm run build) || {
    log "ERROR: frontend build failed, keeping the previously served dist/."
    return 1
  }
  echo "$backend_url" > "$LAST_BUILT_BACKEND_URL_FILE"
  log "Rebuilt dist/ against $backend_url"
}

ensure_static_server() {
  if curl -sS -m 5 -o /dev/null http://localhost:$FRONTEND_PORT 2>/dev/null; then
    return 0
  fi
  log "Starting static file server on :$FRONTEND_PORT..."
  (cd "$REPO_ROOT" && nohup npx --yes serve -s dist -l "$FRONTEND_PORT" >> "$SERVE_LOG" 2>&1 &)
  sleep 3
}

start_frontend_tunnel() {
  log "Starting a new cloudflared quick tunnel for the frontend..."
  : > "$FRONTEND_TUNNEL_LOG"
  nohup "$CLOUDFLARED" tunnel --url "http://localhost:$FRONTEND_PORT" >> "$FRONTEND_TUNNEL_LOG" 2>&1 &

  local url=""
  for _ in $(seq 1 15); do
    sleep 2
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$FRONTEND_TUNNEL_LOG" | head -1 || true)
    [ -n "$url" ] && break
  done

  if [ -z "$url" ]; then
    log "ERROR: cloudflared did not print a frontend tunnel URL within 30s. See $FRONTEND_TUNNEL_LOG."
    return 1
  fi

  log "New frontend URL: $url"
  echo "$url" > "$FRONTEND_URL_FILE"
}

is_frontend_tunnel_healthy() {
  local url
  url=$(cat "$FRONTEND_URL_FILE" 2>/dev/null) || return 1
  [ -z "$url" ] && return 1
  local code
  code=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$url/" 2>/dev/null)
  [ "$code" = "200" ]
}

log "Live-demo watchdog starting. Checking every ${CHECK_INTERVAL_SECONDS}s."

rebuild_frontend_if_backend_changed
ensure_static_server
if ! is_frontend_tunnel_healthy; then
  start_frontend_tunnel || log "Initial frontend tunnel start failed — will retry on next check."
fi

while true; do
  sleep "$CHECK_INTERVAL_SECONDS"
  rebuild_frontend_if_backend_changed
  ensure_static_server
  if is_frontend_tunnel_healthy; then
    log "OK: $(cat "$FRONTEND_URL_FILE" 2>/dev/null) -> backend $(cat "$BACKEND_URL_FILE" 2>/dev/null)"
  else
    log "Frontend tunnel unhealthy — restarting."
    pkill -f "cloudflared.exe tunnel --url http://localhost:$FRONTEND_PORT" 2>/dev/null || true
    sleep 2
    start_frontend_tunnel || log "Restart failed — will retry on next check."
  fi
done
