#!/usr/bin/env bash
# ==============================================================================
# GOODLIFE Radio 254 - Standby Audio Resolver & Local Cache
# Fetches active presenter or station default standby audio from Next.js BFF,
# caches the MP3 locally so Liquidsoap request.dynamic can loop it seamlessly
# without input.http EOF disconnects falling through to emergency drops.
# ==============================================================================

set -euo pipefail

LOCAL_URL="${RADIO_STANDBY_API_URL:-http://127.0.0.1:3000/api/radio/standby-audio}"
PUBLIC_URL="https://goodlife.smwhr.space/api/radio/standby-audio"
TIMEOUT_SEC="${RADIO_STANDBY_TIMEOUT:-3}"
CACHE_MP3="/tmp/goodlife-standby-current.mp3"
CACHE_URL_FILE="/tmp/goodlife-standby-url.txt"

RES=$(curl -s --max-time "$TIMEOUT_SEC" -H "Accept: application/json" "$LOCAL_URL" 2>/dev/null || echo "")
if [[ -z "$RES" || "$RES" != *"standby_audio_url"* ]]; then
  RES=$(curl -s --max-time "$TIMEOUT_SEC" -H "Accept: application/json" "$PUBLIC_URL" 2>/dev/null || echo "")
fi

URL=""
if [[ -n "$RES" ]]; then
  URL=$(echo "$RES" | grep -o '"standby_audio_url"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | cut -d'"' -f4 || echo "")
fi

if [[ -n "$URL" && "$URL" != "null" ]]; then
  PREV_URL=""
  if [[ -f "$CACHE_URL_FILE" ]]; then
    PREV_URL=$(cat "$CACHE_URL_FILE" 2>/dev/null || echo "")
  fi

  if [[ "$URL" != "$PREV_URL" || ! -s "$CACHE_MP3" ]]; then
    TMP_MP3="${CACHE_MP3}.tmp"
    if curl -sL --max-time 15 -o "$TMP_MP3" "$URL" && [[ -s "$TMP_MP3" ]]; then
      mv "$TMP_MP3" "$CACHE_MP3"
      printf "%s" "$URL" > "$CACHE_URL_FILE"
    else
      rm -f "$TMP_MP3"
    fi
  fi

  if [[ -s "$CACHE_MP3" ]]; then
    echo "$CACHE_MP3"
    exit 0
  fi
fi

echo ""
exit 0
