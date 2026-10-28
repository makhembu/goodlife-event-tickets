"""
GOODLIFE Radio 254 - Home Playout & AI Drop Daemon
FastAPI application running on Home Server (192.168.100.29:8060).
Bridges Next.js 15 BFF, AzuraCast, NVIDIA NIM, and Fish Audio.
"""

import hmac
import hashlib
import logging
import os
import re
import shutil
import time
import uuid
from typing import Optional

from fastapi import (
    FastAPI,
    HTTPException,
    Header,
    Request,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
    Depends,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.ai_copywriter import AICopywriter
from services.archiver import SessionArchiver
from services.audio_fetcher import AudioFetcher
from services.audio_mixer import AudioMixer
from services.azuracast_client import AzuraCastClient
from services.voice_synthesizer import VoiceSynthesizer

# Setup structured logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("goodlife.daemon")

app = FastAPI(
    title="GOODLIFE Radio 254 Daemon",
    version="7.1.0",
    description="Playout automation, AI voice drops, and live set archiving engine",
)

# Read allowed origins from env so production/dev differ without code changes
_CORS_ORIGINS_RAW = os.getenv(
    "DAEMON_CORS_ORIGINS",
    "https://goodlife.co.ke,https://invidious-bridge.darajadigital.com,https://goodlife.smwhr.space,http://localhost:3000,http://127.0.0.1:3000"
)
_CORS_ORIGINS = [o.strip() for o in _CORS_ORIGINS_RAW.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Goodlife-Radio-Key", "X-Goodlife-Timestamp", "X-Bridge-Signature", "X-Bridge-Timestamp"],
)

# Services
audio_fetcher = AudioFetcher()
ai_copywriter = AICopywriter()
voice_synthesizer = VoiceSynthesizer()
audio_mixer = AudioMixer()
azuracast_client = AzuraCastClient()
session_archiver = SessionArchiver()

SECRET_KEY = os.getenv("GOODLIFE_RADIO_SECRET_KEY", "goodlife_radio_default_secret")


# ------------------------------------------------------------------------------
# Authentication Dependency (HMAC Anti-Replay Guard)
# ------------------------------------------------------------------------------
async def verify_hmac_auth(
    request: Request,
    x_goodlife_radio_key: Optional[str] = Header(None, alias="X-Goodlife-Radio-Key"),
    x_goodlife_timestamp: Optional[int] = Header(None, alias="X-Goodlife-Timestamp"),
    x_bridge_signature: Optional[str] = Header(None, alias="X-Bridge-Signature"),
    x_bridge_timestamp: Optional[int] = Header(None, alias="X-Bridge-Timestamp"),
):
    """
    Enforces HMAC-SHA256 authentication for all management and playout endpoints.
    Accepts both X-Goodlife-* and X-Bridge-* header pairs and verifies either
    HMAC(secret, "{ts}:{body_hash}") or HMAC(secret, "{ts}:{raw_body}").
    """
    signature = x_goodlife_radio_key or x_bridge_signature
    timestamp = x_goodlife_timestamp or x_bridge_timestamp

    if not signature or not timestamp:
        logger.warning("Rejected unauthenticated request: Missing security headers.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing required authentication headers (X-Goodlife-Radio-Key or X-Bridge-Signature)",
        )

    # 60-second anti-replay window
    now = int(time.time())
    if abs(now - timestamp) > 60:
        logger.warning(f"Rejected request: Timestamp expired or skewed ({abs(now - timestamp)}s drift)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Request timestamp expired or clock out of sync",
        )

    body = await request.body()
    body_hash = hashlib.sha256(body).hexdigest()
    msg_hash = f"{timestamp}:{body_hash}".encode("utf-8")
    expected_sig_hash = hmac.new(
        SECRET_KEY.encode("utf-8"),
        msg_hash,
        hashlib.sha256,
    ).hexdigest()

    msg_raw = f"{timestamp}:{body.decode('utf-8', errors='replace')}".encode("utf-8")
    expected_sig_raw = hmac.new(
        SECRET_KEY.encode("utf-8"),
        msg_raw,
        hashlib.sha256,
    ).hexdigest()

    # Compare constant time to prevent timing attacks
    if not (hmac.compare_digest(expected_sig_hash, signature) or hmac.compare_digest(expected_sig_raw, signature)):
        logger.warning("Rejected request: Invalid HMAC signature")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid HMAC signature",
        )


# ------------------------------------------------------------------------------
# Models
# ------------------------------------------------------------------------------
class QueueNextUrlRequest(BaseModel):
    url: str
    custom_drop_text: Optional[str] = None
    voice_preference: Optional[str] = "male"


class DisconnectPayload(BaseModel):
    file_path: str
    timestamp: int
    file_size: int


# ------------------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    """Health check reporting system and playout connectivity."""
    now_playing = await azuracast_client.get_now_playing()
    live_data = now_playing.get("live", {}) if isinstance(now_playing, dict) else {}
    return {
        "status": "online",
        "station": "GOODLIFE Radio 254",
        "server_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "azuracast_online": bool(now_playing),
        "now_playing": now_playing.get("now_playing", {}).get("song", {}).get("text", "Unknown") if isinstance(now_playing, dict) else "Unknown",
        "live_dj_connected": bool(live_data.get("is_live", False)),
        "live_dj_name": live_data.get("streamer_name") or None,
    }


@app.post("/api/radio/queue-next", dependencies=[Depends(verify_hmac_auth)])
async def queue_next_url(payload: QueueNextUrlRequest):
    """
    Ingests track from remote URL (YouTube, SoundCloud, direct MP3),
    generates time-aware Kenyan drop, ducks opening beat by -12dB,
    and inserts as 'Up Next' into the AzuraCast AutoDJ queue.
    """
    logger.info(f"Received 'Queue Next' request for URL: {payload.url}")

    try:
        # 1. Fetch audio and sanitize metadata
        ingest_data = await audio_fetcher.fetch_audio(payload.url)
        artist = ingest_data["artist"]
        title = ingest_data["title"]
        song_path = ingest_data["file_path"]

        # 2. Generate or use custom drop script
        if payload.custom_drop_text:
            drop_script = payload.custom_drop_text
        else:
            drop_script = await ai_copywriter.generate_drop_script(artist, title)

        # 3. Synthesize voice drop (Fish Audio -> Edge-TTS -> Stock fallback)
        drop_audio_path = await voice_synthesizer.synthesize(
            drop_script, voice_preference=payload.voice_preference or "male"
        )

        # 4. ffmpeg sidechain ducking (-12dB intro) and loudness normalization
        mastered_track_path = await audio_mixer.duck_song_intro(
            song_path=song_path,
            drop_path=drop_audio_path,
            artist=artist,
            title=title,
        )

        # 5. Upload to AzuraCast and inject as immediate request
        media_id = await azuracast_client.upload_media_file(mastered_track_path)
        queued = False
        if media_id:
            queued = await azuracast_client.queue_song_request(media_id)

        return {
            "status": "queued" if queued else "uploaded",
            "artist": artist,
            "title": title,
            "drop_script": drop_script,
            "media_id": media_id,
            "queued_as_up_next": queued,
        }

    except Exception as e:
        logger.error(f"Error in queue_next_url: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/radio/drops/diy", dependencies=[Depends(verify_hmac_auth)])
async def master_diy_drop_endpoint(
    audio: UploadFile = File(...),
    name: str = Form("mic_drop"),
):
    """
    Receives raw voice recording from mobile/tablet browser, applies high-pass 120Hz,
    compression, and EBU R128 loudness normalization (-14 LUFS).
    Returns path to mastered drop.
    """
    temp_dir = "/tmp/goodlife-processing"
    os.makedirs(temp_dir, exist_ok=True)
    # Sanitize: strip directory components, allow only safe filename characters
    safe_filename = re.sub(r"[^a-zA-Z0-9._-]", "_", os.path.basename(audio.filename or "upload"))[:64]
    raw_path = os.path.join(temp_dir, f"raw_{uuid.uuid4().hex[:8]}_{safe_filename}")

    with open(raw_path, "wb") as f:
        shutil.copyfileobj(audio.file, f)

    try:
        mastered_path = await audio_mixer.master_diy_drop(raw_path, name=name)
        return {
            "status": "success",
            "mastered_file": mastered_path,
            "size_bytes": os.path.getsize(mastered_path),
        }
    except Exception as e:
        logger.error(f"DIY drop mastering failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/internal/archive-session", dependencies=[Depends(verify_hmac_auth)])
async def archive_session_webhook(
    payload: DisconnectPayload,
    background_tasks: BackgroundTasks,
):
    """
    Internal webhook triggered by on-disconnect.sh when a live DJ set concludes.
    Schedules background archival to Cloudflare R2 and Neon DB.
    """
    logger.info(f"Received session archive notification: {payload.file_path} ({payload.file_size} bytes)")
    
    # Schedule background worker to master, upload to R2, and sync with Neon DB
    background_tasks.add_task(
        session_archiver.process_live_session,
        payload.file_path,
        "Resident DJ",
    )

    return {
        "status": "accepted",
        "file_path": payload.file_path,
        "job_id": str(payload.timestamp),
    }


@app.post("/api/internal/retry-pending-archives", dependencies=[Depends(verify_hmac_auth)])
async def retry_pending_archives_endpoint(background_tasks: BackgroundTasks):
    """
    Re-processes any pending_archives rows with status='failed' and retry_count < 10.
    """
    background_tasks.add_task(session_archiver.retry_failed_archives)
    return {"status": "retry_scheduled"}


# ------------------------------------------------------------------------------
# Direct AzuraCast Station Control Endpoints
# ------------------------------------------------------------------------------
@app.get("/api/azuracast/nowplaying", dependencies=[Depends(verify_hmac_auth)])
async def get_azuracast_nowplaying():
    """Returns real-time playing metadata, listener count, and queue preview from AzuraCast."""
    data = await azuracast_client.get_now_playing()
    return data or {"status": "offline", "listeners": {"total": 0}, "now_playing": {}}


@app.post("/api/azuracast/skip", dependencies=[Depends(verify_hmac_auth)])
async def skip_azuracast_track():
    """Skips currently playing track immediately."""
    success = await azuracast_client.skip_track()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to skip track on AzuraCast")
    return {"status": "success", "action": "skipped"}


@app.get("/api/azuracast/queue", dependencies=[Depends(verify_hmac_auth)])
async def get_azuracast_queue():
    """Returns upcoming queued tracks from AzuraCast."""
    queue = await azuracast_client.get_queue()
    return {"queue": queue}


@app.delete("/api/azuracast/queue/{queue_id}", dependencies=[Depends(verify_hmac_auth)])
async def delete_azuracast_queue_item(queue_id: int):
    """Removes a track from the upcoming queue."""
    success = await azuracast_client.delete_queue_item(queue_id)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to remove queue item {queue_id}")
    return {"status": "success", "removed_id": queue_id}

