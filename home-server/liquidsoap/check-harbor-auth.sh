#!/usr/bin/env bash
# ==============================================================================
# GOODLIFE Radio 254 - Liquidsoap Harbor Auth Helper
# Invoked by Liquidsoap input.harbor auth function with (username, stream_key).
# Forward auth query to the local daemon, which signs with HMAC and validates
# with the Next.js radio-auth endpoint against DB presenter schedule & slots.
# ==============================================================================

set -euo pipefail

USERNAME="${1:-}"
STREAM_KEY="${2:-}"

if [[ -z "$USERNAME" || -z "$STREAM_KEY" ]]; then
  echo "DENY: missing username or stream key"
  exit 1
fi

DAEMON_URL="${DAEMON_HARBOR_AUTH_URL:-http://127.0.0.1:8060/radio/harbor-auth}"
# Also try container host goodlife_daemon if 127.0.0.1 fails
if ! curl -s --connect-timeout 1 "$DAEMON_URL/health" >/dev/null 2>&1; then
  if curl -s --connect-timeout 1 "http://goodlife_daemon:8060/health" >/dev/null 2>&1; then
    DAEMON_URL="http://goodlife_daemon:8060/radio/harbor-auth"
  fi
fi

# Build JSON payload
PAYLOAD=$(cat <<EOF
{"username": "$USERNAME", "stream_key": "$STREAM_KEY"}
EOF
)

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$DAEMON_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" || echo -e "\n000")

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [[ "$HTTP_STATUS" == "200" ]]; then
  # Check if response contains "allowed": true or "allowed":true
  if echo "$BODY" | grep -q '"allowed"[[:space:]]*:[[:space:]]*true'; then
    echo "ALLOW"
    exit 0
  else
    REASON=$(echo "$BODY" | grep -o '"reason"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4 || echo "denied")
    echo "DENY: $REASON"
    exit 1
  fi
else
  echo "DENY: daemon auth check error ($HTTP_STATUS)"
  exit 1
fi
