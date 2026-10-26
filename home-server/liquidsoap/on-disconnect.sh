#!/usr/bin/env bash
# ==============================================================================
# GOODLIFE Radio 254 - Harbor Disconnect Hook Script
# Invoked by Liquidsoap when a live DJ stream terminates.
# Location: /usr/local/bin/on-disconnect.sh
# ==============================================================================

set -euo pipefail

RECORDING_PATH="${1:-}"
LOG_FILE="/var/log/goodlife/session-disconnect.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [DISCONNECT-HOOK] $*" | tee -a "$LOG_FILE"
}

if [[ -z "$RECORDING_PATH" ]]; then
  log "ERROR: No recording file path passed. Exiting."
  exit 1
fi

log "Received disconnect event for recording: $RECORDING_PATH"

# Wait 2 seconds for Liquidsoap to flush final audio buffers to disk
sleep 2

if [[ ! -f "$RECORDING_PATH" ]]; then
  log "WARNING: Recording file does not exist: $RECORDING_PATH. Skipping."
  exit 0
fi

FILE_SIZE=$(stat -c%s "$RECORDING_PATH" 2>/dev/null || stat -f%z "$RECORDING_PATH" 2>/dev/null || echo "0")
log "Recording file size: $FILE_SIZE bytes"

# Filter out test connects / blips smaller than 1MB (~45 seconds of 320k audio)
MIN_BYTES=1048576
if (( FILE_SIZE < MIN_BYTES )); then
  log "Recording is smaller than 1MB (test connection or blip). Retaining locally without full archive."
  exit 0
fi

# Secret key shared with the Goodlife Radio Daemon
SECRET_KEY="${GOODLIFE_RADIO_SECRET_KEY:-goodlife_radio_default_secret}"
DAEMON_URL="http://127.0.0.1:8060/api/internal/archive-session"
TIMESTAMP=$(date +%s)

# Compute HMAC-SHA256 signature using unified scheme: HMAC(secret, "${TIMESTAMP}:${BODY_HASH}")
PAYLOAD="{\"file_path\":\"$RECORDING_PATH\",\"timestamp\":$TIMESTAMP,\"file_size\":$FILE_SIZE}"
BODY_HASH=$(echo -n "$PAYLOAD" | openssl dgst -sha256 | awk '{print $NF}')
SIGN_MESSAGE="${TIMESTAMP}:${BODY_HASH}"
SIGNATURE=$(echo -n "$SIGN_MESSAGE" | openssl dgst -sha256 -hmac "$SECRET_KEY" | awk '{print $NF}')

log "Dispatching archive notification to local daemon at $DAEMON_URL..."

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$DAEMON_URL" \
  -H "Content-Type: application/json" \
  -H "X-Goodlife-Radio-Key: $SIGNATURE" \
  -H "X-Goodlife-Timestamp: $TIMESTAMP" \
  -d "$PAYLOAD" || echo "FAIL 000")

HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n1)
BODY=$(echo "$HTTP_RESPONSE" | head -n -1)

if [[ "$HTTP_STATUS" =~ ^2 ]]; then
  log "SUCCESS: Daemon accepted archive job. Response: $BODY"
else
  log "WARNING: Daemon returned HTTP $HTTP_STATUS ($BODY). Recording will remain in /var/goodlife/recordings/pending for next daemon sync retry."
fi

exit 0
