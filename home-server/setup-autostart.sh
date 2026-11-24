#!/usr/bin/env bash
# ==============================================================================
# GOODLIFE Radio 254 & Web: Reboot-Proof Autostart & Persistence Setup
# Run on the Home Server to guarantee services start automatically on boot.
# ==============================================================================
set -e

USER_NAME="khesh"
USER_HOME="/home/${USER_NAME}"
APP_DIR="${USER_HOME}/apps/goodlife-event-tickets"

echo "==> [1/4] Ensuring PM2 process is running and bound to port 3000..."
cd "${APP_DIR}"
pm2 describe goodlife-web > /dev/null 2>&1 || {
  echo "Starting goodlife-web under PM2..."
  pm2 start npm --name "goodlife-web" -- run start -- -p 3000
}

echo "==> [2/4] Saving PM2 state (~/.pm2/dump.pm2)..."
pm2 save --force

echo "==> [3/4] Registering PM2 systemd service for boot recovery..."
# Generate systemd startup command
pm2 startup systemd -u "${USER_NAME}" --hp "${USER_HOME}" || true

# If running as root or with sudo available, ensure systemd unit is enabled
if [ "$(id -u)" -eq 0 ]; then
  systemctl enable "pm2-${USER_NAME}" || true
  systemctl start "pm2-${USER_NAME}" || true
  # Ensure cloudflared service is enabled if installed
  if command -v cloudflared > /dev/null 2>&1; then
    systemctl enable cloudflared 2>/dev/null || true
  fi
else
  echo "Note: If not already done, run the sudo command output by 'pm2 startup' above to enable systemd boot start."
fi

echo "==> [4/4] Verifying PM2 resurrect list:"
pm2 status

echo "✅ Autostart setup complete! 'goodlife-web' will now resurrect automatically whenever the server boots."
