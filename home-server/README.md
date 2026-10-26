# GOODLIFE Radio 254: Home Server Playout Engine (Phase 1)

This directory contains the production infrastructure setup for the **GOODLIFE Radio 254** playout core running on the Ubuntu Home Server (`192.168.100.29`).

---

## 1. Directory Structure

```text
home-server/
├── docker-compose.yml           # AzuraCast & Liquidsoap stack
├── .env.example                 # Environment variables and harbor secrets
├── setup-station.sh             # Server directory initialization & permissions script
├── cloudflared/
│   └── config.yml               # Cloudflare Tunnel ingress configuration
├── liquidsoap/
│   ├── goodlife-station.liq     # Liquidsoap script (harbor failover, raw tap, dual stream)
│   └── on-disconnect.sh         # Disconnect webhook hook triggering archive daemon
└── README.md                    # Setup, configuration & verification guide
```

---

## 2. Server Installation Steps (On `192.168.100.29`)

### Step 1: Clone / Copy Files to Server
On your Ubuntu server, copy or pull this `home-server` folder into your working directory (e.g. `/opt/goodlife-radio`):
```bash
sudo mkdir -p /opt/goodlife-radio
cd /opt/goodlife-radio
# Copy files from repository
sudo chmod +x setup-station.sh
sudo ./setup-station.sh
```

### Step 2: Configure Environment Variables
Edit `/opt/goodlife-radio/.env`:
```bash
nano .env
```
Key parameters to set:
* `AZURACAST_ADMIN_PASSWORD`: Strong password for the AzuraCast administration dashboard.
* `HARBOR_PASSWORD`: Secret password provided to live DJs connecting via BUTT or club hardware.
* `GOODLIFE_RADIO_SECRET_KEY`: 32-byte hex key shared with Next.js BFF and the daemon.
* `CLOUDFLARE_TUNNEL_ID`: The ID of your existing Cloudflare Tunnel (`cloudflared tunnel list`).

### Step 3: Launch Docker Stack
```bash
docker compose up -d
```
Verify containers are running:
```bash
docker compose ps
docker compose logs -f azuracast_web
```

---

## 3. Station Playout & Clock Wheel Setup in AzuraCast

Access AzuraCast at `http://192.168.100.29:8055`:
1. Log in with `admin@goodlife.co.ke` and the password set in `.env`.
2. Navigate to **Stations** $\rightarrow$ **Add Station**:
   * **Name:** `GOODLIFE Radio 254`
   * **Shortcode:** `goodlife_radio_254`
   * **Timezone:** `Africa/Nairobi` (UTC+3)
   * **Broadcasting Software:** `Liquidsoap`
3. Configure the **5 Clock Wheel Daypart Playlists**:
   * **Nairobi Sunrise** (`06:00 – 10:00` EAT) $\rightarrow$ Scheduled playlist, weight 3.
   * **The Goodlife Daily** (`10:00 – 15:00` EAT) $\rightarrow$ Scheduled playlist, weight 3.
   * **Sunset Sessions** (`15:00 – 19:00` EAT) $\rightarrow$ Scheduled playlist, weight 3.
   * **Quiver Madness** (`19:00 – 02:00` EAT) $\rightarrow$ Scheduled playlist, weight 4.
   * **The Afterhours** (`02:00 – 06:00` EAT) $\rightarrow$ Scheduled playlist, weight 2.
4. AutoDJ Separation Rules (under **Station Profile** $\rightarrow$ **AutoDJ**):
   * Duplicate Artist Prevention: `90 minutes`.
   * Duplicate Track Prevention: `360 minutes`.

---

## 4. Ingress Configuration

### A. Cloudflare Tunnel (For Web & Public Streaming)
Copy `home-server/cloudflared/config.yml` to `/etc/cloudflared/config.yml` on the server and restart the tunnel:
```bash
sudo systemctl restart cloudflared
```
* Traffic to `https://radio.darajadigital.com` routes cleanly through Cloudflare edge to `http://127.0.0.1:8055`.

### B. Live DJ Harbor Ingress (TCP Port 8005)
Because BUTT / Rekordbox use raw Icecast `SOURCE` handshakes over TCP (which Cloudflare HTTP reverse proxies reject):
1. Log into your home fiber router gateway (e.g. `192.168.100.1`).
2. Add a **Port Forwarding Rule**:
   * External Port: `8005` (TCP)
   * Internal IP: `192.168.100.29`
   * Internal Port: `8005` (TCP)
3. Set your Dynamic DNS or A-record for `live-dj.darajadigital.com` to point to your router's public WAN IP.
*(Alternatively, remote DJs on mobile/laptops can join your private Tailscale mesh network).*

---

## 5. Verification & Testing

### Verification 1: Public Stream Check
Test that both output streams are emitting audio:
```bash
# Test Stream A: Low-Latency 192k MP3 Stream
curl -I http://192.168.100.29:8000/listen/goodlife/live.mp3

# Test Stream B: HLS Playlist
curl -I http://192.168.100.29:8055/hls/goodlife/live.m3u8
```
Both endpoints should return `HTTP/1.1 200 OK` with `Content-Type: audio/mpeg` and `application/x-mpegURL` respectively.

### Verification 2: Live DJ Harbor Ingest Test (using BUTT)
1. Download **BUTT (Broadcast Using This Tool)** on your laptop.
2. In BUTT Settings $\rightarrow$ Main:
   * **Type:** `Icecast`
   * **Server:** `192.168.100.29` (or `live-dj.darajadigital.com`)
   * **Port:** `8005`
   * **Password:** `<HARBOR_PASSWORD from .env>`
   * **Mountpoint:** `/live`
   * **User:** `source`
   * **Audio Codec:** `MP3 320kbps` (or `256kbps`)
3. Click **Play / Connect** in BUTT.
4. Observe the Liquidsoap log:
   ```bash
   docker logs -f azuracast_web | grep harbor
   ```
   You will see:
   * `"DJ authenticated successfully: source"`
   * `"Live DJ connected. Starting pristine 320kbps capture to: /var/goodlife/recordings/pending/..."`
   * Smooth 3-second crossfade from AutoDJ to your live microphone/audio.

### Verification 3: Harbor Disconnect & 320k Recording Tap
1. Click **Stop / Disconnect** in BUTT.
2. Check `/var/goodlife/recordings/pending/`:
   ```bash
   ls -lh /var/goodlife/recordings/pending/
   ```
   Verify that a timestamped `.mp3` file exists and has a bitrate of 320kbps.
3. Check the disconnect log:
   ```bash
   cat /var/log/goodlife/session-disconnect.log
   ```
   You will see the disconnect event successfully dispatched with the file path.
