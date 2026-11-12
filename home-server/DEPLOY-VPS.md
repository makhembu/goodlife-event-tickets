# GOODLIFE Radio 254 - VPS Deployment Guide

This guide documents deploying the GOODLIFE Radio playout system (AzuraCast, Liquidsoap custom pipeline, and the GOODLIFE Radio Daemon) onto a cloud VPS (e.g. Hetzner Cloud, DigitalOcean, Linode, AWS EC2, or Vultr).

This setup replaces all local-LAN dependencies (`192.168.x.x`) with a production-hardened cloud architecture that connects seamlessly to **Vercel** (Next.js 15 App Router) and **Neon Postgres**.

---

## 1. System Architecture

```
                                  [ Cloudflare DNS ]
                                          |
                      +-------------------+-------------------+
                      |                                       |
           stream.goodlife.co.ke                    goodlife.co.ke
                      |                                       |
                      v                                       v
          +-----------------------+              +-------------------------+
          |   Ubuntu 24.04 VPS    |              |      Vercel Edge        |
          |  (Hetzner / DO / AWS) |              |  (Next.js 15 App Router)|
          |                       |              +-------------------------+
          | [Port 80/443] Web/TLS |                           |
          | [Port 8000]   Icecast |                           |
          | [Port 8005]   Harbor  |<=== HMAC Machine Auth ===>|
          |                       |       (over HTTPS)        |
          | [Docker Network]      |                           |
          |  * AzuraCast Playout  |                           v
          |  * Liquidsoap 2.1+    |                  +---------------------+
          |  * Goodlife Daemon    |                  |    Neon Postgres    |
          +-----------------------+                  | (Single DB Cluster) |
                      |                              +---------------------+
                      v                                       ^
           Cloudflare R2 Bucket                               |
       (Recordings & Teasers Storage)-------------------------+
```

---

## 2. Server Sizing & Prerequisites

### Recommended VPS Specifications
- **OS:** Ubuntu 22.04 LTS or Ubuntu 24.04 LTS (x86_64 or ARM64)
- **CPU:** 2 vCPU cores minimum (4 vCPU recommended if running live audio transcoding or multiple drops)
- **RAM:** 4 GB RAM minimum (AzuraCast + Docker containers require ~2.5 GB baseline)
- **Disk:** 50 GB+ NVMe SSD (live recordings are captured at 320kbps MP3 before archival)
- **Bandwidth:** 2 TB+ monthly outbound transfer (192 kbps stream = ~86 MB/hour per listener)

### Domain & DNS Records
Point your DNS records (Cloudflare / Route53) to your VPS public IPv4:
- `A stream.goodlife.co.ke -> <VPS_PUBLIC_IPV4>` (Playout & Web UI)
- `A dj.goodlife.co.ke -> <VPS_PUBLIC_IPV4>` (Direct harbor connection for DJ encoders)

> **Important (Cloudflare Proxy):** In Cloudflare DNS, set the `stream` and `dj` subdomains to **DNS Only** (Grey Cloud), NOT Proxied (Orange Cloud). Cloudflare's standard HTTP proxy buffers audio streams and blocks non-HTTP ports like 8005.

---

## 3. Firewall & Security Hardening (UFW)

The playout system strictly separates public ports from internal services:

| Port | Protocol | Scope | Purpose |
|------|----------|-------|---------|
| `22` | TCP | Public (or VPN) | SSH Server access |
| `80` | TCP | Public | Let's Encrypt ACME verification / HTTP redirect |
| `443` | TCP | Public | HTTPS AzuraCast admin & public HLS player |
| `8000` | TCP | Public | Icecast Direct MP3 Stream (`/listen/goodlife/live.mp3`) |
| `8005` | TCP | Public | Liquidsoap Harbor DJ Ingest (Port for BUTT, OBS, Mixxx) |
| `8060` | TCP | **INTERNAL ONLY** | Goodlife Daemon (never expose to public internet) |
| `1234` | TCP | **INTERNAL ONLY** | Liquidsoap Telnet control (127.0.0.1 only) |

Run on the VPS:
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8000/tcp
sudo ufw allow 8005/tcp
sudo ufw enable
```

---

## 4. Install Docker & Dependencies

```bash
# Update packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw ffmpeg openssl jq

# Install official Docker Engine & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Create goodlife operational directories
sudo mkdir -p /var/goodlife/recordings/pending
sudo mkdir -p /var/goodlife/recordings/mastered
sudo mkdir -p /var/goodlife/drops/emergency
sudo mkdir -p /tmp/goodlife-processing
sudo chown -R 1000:1000 /var/goodlife /tmp/goodlife-processing
```

---

## 5. Clone Repository & Configure Environment

Clone the repository to `/opt/goodlife-station`:
```bash
sudo git clone https://github.com/goodlife/goodlife-event-tickets.git /opt/goodlife-station
cd /opt/goodlife-station/home-server
```

### Production Environment (`home-server/.env`)
Create `/opt/goodlife-station/home-server/.env`:
```env
# Playout Domain & Station Identity
APP_URL=https://goodlife.co.ke
GOODLIFE_APP_URL=https://goodlife.co.ke
STATION_DOMAIN=stream.goodlife.co.ke

# Passwords for Playout Services
ICECAST_SOURCE_PASSWORD=generate_a_strong_random_password_here
AZURACAST_API_KEY=generate_in_azuracast_admin_later

# Shared HMAC Machine Secret (Must match RADIO_BRIDGE_SECRET in Vercel)
GOODLIFE_RADIO_SECRET_KEY=generate_a_64_char_hex_secret_here
BRIDGE_SECRET=generate_a_64_char_hex_secret_here
RADIO_BRIDGE_SECRET=generate_a_64_char_hex_secret_here

# Neon Postgres (Direct connection for Archiver)
DATABASE_URL=postgres://neondb_owner:password@ep-xxxx.neon.tech/neondb?sslmode=require

# Cloudflare R2 Bucket (Recording Archives)
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_BUCKET=goodlife-radio-archives
R2_ACCESS_KEY_ID=your_r2_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_PUBLIC_DOMAIN=https://recordings.goodlife.co.ke
```

Copy the same environment file to the daemon:
```bash
cp /opt/goodlife-station/home-server/.env /opt/goodlife-station/home-server/daemon/.env
```

Also add `RADIO_BRIDGE_SECRET` to your **Vercel Project Settings -> Environment Variables**:
- `RADIO_BRIDGE_SECRET=<same_64_char_hex_secret_here>`

---

## 6. Launching Services with Docker Compose

Check permissions on the hook scripts:
```bash
chmod +x /opt/goodlife-station/home-server/liquidsoap/*.sh
```

Launch the stack:
```bash
docker compose up -d --build
```

Verify that all containers are healthy:
```bash
docker compose ps
docker logs -f goodlife_daemon
```

---

## 7. Connecting Liquidsoap to the GOODLIFE Auth Bridge

The custom Liquidsoap script (`goodlife-station.liq`) is mounted into AzuraCast.
When an artist connects to `dj.goodlife.co.ke:8005` (mount `/live`), Liquidsoap executes:
`/usr/local/bin/check-harbor-auth.sh <username> <stream_key>`

The bridge authentication flow:
1. Liquidsoap calls `check-harbor-auth.sh`.
2. The script queries `goodlife_daemon:8060/radio/harbor-auth`.
3. The daemon constructs an HMAC-SHA256 signature (`X-Bridge-Timestamp`, `X-Bridge-Signature`).
4. The daemon forwards the request to Next.js on Vercel: `POST https://goodlife.co.ke/api/internal/radio-auth`.
5. Next.js validates:
   - Presenter active state & SHA-256 stream key match.
   - Live or 15-minute warmup window.
   - Prevents collision if another presenter is actively live on air.
6. Returns `{"allowed": true}` -> DJ is connected to air!

---

## 8. Verifying End-to-End Stream Playout

### 1. Test the Encoder Connection
From any machine, run the test encoder script:
```bash
chmod +x ../scripts/test-stream-encoder.sh
../scripts/test-stream-encoder.sh dj_khesh "gl_live_your_actual_key" dj.goodlife.co.ke 8005
```

### 2. Verify Output Audio
Open the Icecast live stream in your browser or VLC:
`http://stream.goodlife.co.ke:8000/listen/goodlife/live.mp3`

### 3. Verify Live State in Web UI
Navigate to `https://goodlife.co.ke/radio`:
- The `GlobalRadioBar` banner changes to **"ON AIR NOW (LIVE)"**.
- The presenter's name and show title are displayed.
- The player connects immediately to the live stream.

### 4. Verify Disconnect & Archival
When the DJ disconnects:
- Liquidsoap fades out the harbor source and resumes AutoDJ with a 3-second crossfade.
- `on-disconnect.sh` triggers the archiver in `goodlife_daemon`.
- The raw 320kbps MP3 is normalized to -14 LUFS (EBU R128), uploaded to Cloudflare R2, and recorded in Neon Postgres `radio_recordings` with `is_public = false`.
- The presenter can preview and approve it in their Studio dashboard (`/presenter/dashboard`).

---

## 9. Automated Backups & Systemd Supervision

Docker Compose restart policies (`restart: unless-stopped`) ensure automatic startup after VPS reboots.

To install a systemd service to manage the station automatically:
```bash
sudo tee /etc/systemd/system/goodlife-radio.service << 'EOF'
[Unit]
Description=GOODLIFE Radio Playout & Daemon
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/goodlife-station/home-server
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable goodlife-radio
```
