#!/usr/bin/env bash
# ==============================================================================
# GOODLIFE Radio 254 - Harbor Connect Hook Script
# Invoked by Liquidsoap when a live DJ stream successfully connects.
# Location: /usr/local/bin/on-connect.sh
# ==============================================================================

set -euo pipefail

LOG_FILE="/var/log/goodlife/session-connect.log"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [CONNECT-HOOK] $*" | tee -a "$LOG_FILE" || true
}

log "Harbor source connected. Notifying daemon..."

DAEMON_URL="http://127.0.0.1:8060/radio/source-connect"
if ! curl -s --connect-timeout 1 "http://127.0.0.1:8060/health" >/dev/null 2>&1; then
  if curl -s --connect-timeout 1 "http://goodlife_daemon:8060/health" >/dev/null 2>&1; then
    DAEMON_URL="http://goodlife_daemon:8060/radio/source-connect"
  fi
fi

curl -s -X POST "$DAEMON_URL" \
  -H "Content-Type: application/json" \
  -d '{"connected": true}' >/dev/null 2>&1 || true

log "Connect notification delivered."
exit 0
