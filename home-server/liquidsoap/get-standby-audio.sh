#!/usr/bin/env bash
# ==============================================================================
# GOODLIFE Radio 254 - Standby Audio URL Fetcher
# Fetches active presenter or station default standby audio from Next.js BFF.
# Outputs URL on success, or empty string on failure.
# ==============================================================================

set -euo pipefail

NEXTJS_URL="${RADIO_STANDBY_API_URL:-http://127.0.0.1:3000/api/radio/standby-audio}"
TIMEOUT_SEC="${RADIO_STANDBY_TIMEOUT:-2}"

RES=$(curl -s --max-time "$TIMEOUT_SEC" -H "Accept: application/json" "$NEXTJS_URL" 2>/dev/null || echo "")

if [[ -n "$RES" ]]; then
  # Parse standby_audio_url from JSON
  URL=$(echo "$RES" | grep -o '"standby_audio_url"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | cut -d'"' -f4 || echo "")
  if [[ -n "$URL" && "$URL" != "null" ]]; then
    echo "$URL"
    exit 0
  fi
fi

echo ""
exit 0
