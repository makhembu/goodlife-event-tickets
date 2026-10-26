#!/usr/bin/env bash
# ==============================================================================
# GOODLIFE Radio 254 - Home Server Setup & Initialization Script
# Target: Ubuntu 24.04 LTS (192.168.100.29)
# Usage: sudo ./setup-station.sh
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " GOODLIFE Radio 254 - Phase 1 Environment Initialization  "
echo "=========================================================="

if [[ $EUID -ne 0 ]]; then
   echo "Error: This script must be run as root (use sudo)." 
   exit 1
fi

echo "[1/5] Checking Docker and Docker Compose..."
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker CE..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
else
    echo "Docker is installed: $(docker --version)"
fi

if ! docker compose version &> /dev/null; then
    echo "Error: docker compose plugin is required."
    exit 1
else
    echo "Docker Compose is installed: $(docker compose version)"
fi

echo "[2/5] Creating system storage directories..."
mkdir -p /var/goodlife/recordings/pending
mkdir -p /var/goodlife/recordings/mastered
mkdir -p /var/goodlife/drops/stock
mkdir -p /var/log/goodlife
mkdir -p /etc/cloudflared

# Give azuracast container user (UID 1000) write permissions
chown -R 1000:1000 /var/goodlife
chmod -R 775 /var/goodlife
chmod +x ./liquidsoap/on-disconnect.sh

echo "[3/5] Setting up Emergency Fallback Audio Loop..."
EMERGENCY_FILE="/var/goodlife/drops/emergency-fallback.mp3"
if [[ ! -f "$EMERGENCY_FILE" ]]; then
    echo "Generating silence/intro fallback audio asset at $EMERGENCY_FILE..."
    if command -v ffmpeg &> /dev/null; then
        ffmpeg -f lavfi -i "sine=frequency=440:duration=5" -ar 44100 -b:a 192k "$EMERGENCY_FILE" -y 2>/dev/null || true
    fi
    chown 1000:1000 "$EMERGENCY_FILE" 2>/dev/null || true
fi

echo "[4/5] Verifying .env configuration..."
if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
        echo "Creating .env from .env.example..."
        cp .env.example .env
        echo "IMPORTANT: Review and edit home-server/.env with production credentials before starting."
    fi
else
    echo ".env file already exists."
fi

echo "[5/5] Checking Port Availability..."
for port in 8055 8005 8000; do
    if ss -tuln | grep -q ":$port "; then
        echo "WARNING: Port $port appears to be in use. Check 'ss -tuln' or existing services."
    else
        echo "Port $port is free."
    fi
done

echo "=========================================================="
echo " Initialization Complete!"
echo " Next steps:"
echo " 1. Configure .env with strong secrets."
echo " 2. Run: docker compose up -d"
echo " 3. Verify Web UI: http://192.168.100.29:8055"
echo " 4. Forward TCP port 8005 on your router to 192.168.100.29"
echo "=========================================================="
