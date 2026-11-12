#!/usr/bin/env python3
"""
GOODLIFE Radio - Autonomous Playout Follower & DJ Fusion Voice Daemon v3.1 (.29)
Supervised companion daemon running alongside radio-bridge-server.py on Home Server.
"""

import asyncio
import os
import sys
import re
import socket
import time
from datetime import datetime, timezone
from pathlib import Path
import httpx
import msgpack
import psycopg2
from psycopg2.extras import RealDictCursor

# Path & Environment Setup
CURRENT_DIR = Path(__file__).parent
ENV_PATH = CURRENT_DIR / ".env"
if ENV_PATH.exists():
    with open(ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip().strip("'\"")

# Configuration
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("[FATAL] DATABASE_URL is required.", file=sys.stderr)
    sys.exit(1)

APP_URL = os.environ.get("APP_URL", "https://goodlife.smwhr.space").rstrip("/")
FISH_AUDIO_KEY = os.environ.get("FISH_AUDIO_KEY", "")
FISH_VOICE_ID = os.environ.get("FISH_VOICE_ID", "6801890ec345469d8818129e5bdd50dd")
R2_BUCKET = os.environ.get("R2_BUCKET_NAME", "goodlife")
R2_PUBLIC_DOMAIN = os.environ.get("R2_PUBLIC_DOMAIN", "https://goodlife.smwhr.space").rstrip("/")

WORKER_ID = f"follower_{socket.gethostname()}_{os.getpid()}"
HOSTNAME = socket.gethostname()
TEMP_DIR = CURRENT_DIR / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

REF_MP3 = CURRENT_DIR / "voice-samples/dj_fusion_reference.mp3"
REF_TXT = CURRENT_DIR / "voice-samples/dj_fusion_reference.txt"

# In-memory execution state
LAST_PROCESSED_TRANSITION_ID = None
TRACKS_SINCE_LAST_DROP = 0
CURRENT_JOB_ID = None
LAST_ERROR = None
LAST_ERROR_TIME = None

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def run_db_query(query: str, params=None, fetch=True):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params or ())
            res = cur.fetchall() if fetch else None
            conn.commit()
            return res
    finally:
        conn.close()

async def async_db(query: str, params=None, fetch=True):
    return await asyncio.to_thread(run_db_query, query, params, fetch)

def clean_script_for_tts(text: str) -> str:
    """Strips non-broadcast characters, emojis and normalizes broadcast phonetics."""
    no_emoji = re.sub(r'[\U00010000-\U0010ffff]', '', text)
    clean = re.sub(r'[*"\'_#]', '', no_emoji)
    clean = clean.replace("254", "two five four").replace("200 bob", "two hundred bob")
    clean = clean.replace("goodlife.smwhr.space", "goodlife dot smwhr dot space")
    clean = re.sub(r'\s+', ' ', clean)
    return clean.strip()

def get_daypart_name() -> str:
    # EAT time (UTC + 3)
    hour = (datetime.now(timezone.utc).hour + 3) % 24
    if 5 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 22:
        return "peak_evening"
    return "deep_overnight"

def generate_dj_script(next_track: dict, daypart: str, county_shoutout: str = None) -> str:
    title = next_track.get("title", "Fresh Vibes")
    dj_name = next_track.get("artist") or "GOODLIFE Selector"
    
    if county_shoutout:
        return f"Yo, locked into GOODLIFE Radio 254! Big energy out in {county_shoutout}. Taking it higher right now with {title} by {dj_name}. Turn it up!"
    
    templates = {
        "morning": f"Rise and shine Nairobi! You locked into GOODLIFE Radio 254. Setting the morning groove with {title} by {dj_name}. Let's go!",
        "afternoon": f"Midday soundtrack strictly on point. You locked into GOODLIFE Radio 254! Rolling straight into {title} by {dj_name}!",
        "peak_evening": f"Turn up the volume! GOODLIFE Radio 254 taking over the airwaves. Up next, pure heat: {title} by {dj_name}!",
        "deep_overnight": f"Late night sessions on GOODLIFE Radio 254. Keeping the frequency alive with {title} by {dj_name}."
    }
    return templates.get(daypart, f"Yo! You locked into GOODLIFE Radio 254. Taking it higher with {title} by {dj_name}!")

async def update_worker_heartbeat(status: str = "IDLE"):
    global CURRENT_JOB_ID, LAST_ERROR, LAST_ERROR_TIME
    try:
        sql = """
            INSERT INTO radio_automation_workers (
              worker_id, hostname, service_name, status, last_heartbeat, 
              current_job_id, last_error, last_error_at, updated_at
            )
            VALUES (%s, %s, 'playout_follower', %s, NOW(), %s, %s, %s, NOW())
            ON CONFLICT (worker_id) DO UPDATE SET
              status = EXCLUDED.status,
              last_heartbeat = NOW(),
              current_job_id = EXCLUDED.current_job_id,
              last_error = EXCLUDED.last_error,
              last_error_at = EXCLUDED.last_error_at,
              updated_at = NOW();
        """
        await async_db(sql, (WORKER_ID, HOSTNAME, status, CURRENT_JOB_ID, LAST_ERROR, LAST_ERROR_TIME), fetch=False)
    except Exception as e:
        print(f"[PlayoutFollower] Heartbeat update error: {e}", file=sys.stderr)

async def check_active_listeners() -> int:
    try:
        res = await async_db(
            "SELECT COUNT(DISTINCT session_id)::int as count FROM radio_listener_pings WHERE last_seen >= NOW() - INTERVAL '45 seconds'"
        )
        return res[0]["count"] if res else 0
    except Exception:
        return 0

async def check_last_drop_cadence_allowed() -> bool:
    """Checks Postgres ground truth: Has at least 600s (10 min) passed since last drop?"""
    try:
        res = await async_db(
            "SELECT EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::int as age_sec FROM radio_drops WHERE status = 'READY'"
        )
        if not res or res[0]["age_sec"] is None:
            return True
        return res[0]["age_sec"] >= 600
    except Exception:
        return False

async def synthesize_voice(script_text: str, client: httpx.AsyncClient) -> bytes:
    clean_text = clean_script_for_tts(script_text)
    headers = {
        "Authorization": f"Bearer {FISH_AUDIO_KEY}",
        "Content-Type": "application/msgpack"
    }
    payload = {
        "text": clean_text,
        "format": "mp3",
        "temperature": 0.6,
        "prosody": {"speed": 0.95, "volume": 0},
        "latency": "balanced"
    }

    if REF_MP3.exists() and REF_TXT.exists():
        with open(REF_MP3, "rb") as f:
            ref_audio = f.read()
        with open(REF_TXT, "r", encoding="utf-8") as f:
            ref_txt = f.read().strip()
        payload["references"] = [{"audio": ref_audio, "text": ref_txt}]
    else:
        payload["reference_id"] = FISH_VOICE_ID

    resp = await client.post("https://api.fish.audio/v1/tts", headers=headers, content=msgpack.packb(payload), timeout=30.0)
    resp.raise_for_status()
    return resp.content

async def master_audio_loudnorm(raw_bytes: bytes, drop_id: int) -> Path:
    raw_path = TEMP_DIR / f"raw_drop_{drop_id}.mp3"
    out_path = TEMP_DIR / f"mastered_drop_{drop_id}.mp3"
    
    with open(raw_path, "wb") as f:
        f.write(raw_bytes)

    cmd = [
        "ffmpeg", "-y", "-i", str(raw_path),
        "-af", "loudnorm=I=-14:TP=-1.0:LRA=7",
        "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k",
        str(out_path)
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await proc.communicate()

    if raw_path.exists():
        raw_path.unlink()

    if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size == 0:
        err_msg = stderr.decode("utf-8", errors="ignore")[:200]
        raise RuntimeError(f"FFmpeg loudnorm failed: {err_msg}")

    return out_path

async def upload_mastered_to_r2(local_file: Path, drop_id: int) -> str:
    # Dynamic import of S3 client from companion bridge server
    try:
        from radio_bridge_server import get_s3_client
        s3 = get_s3_client()
    except Exception:
        import boto3
        from botocore.config import Config
        account_id = os.environ.get("R2_ACCOUNT_ID")
        access_key = os.environ.get("R2_ACCESS_KEY_ID")
        secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
        s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4"),
            region_name="auto"
        )

    r2_key = f"radio/drops/ai_drop_{drop_id}.mp3"
    await asyncio.to_thread(
        s3.upload_file,
        str(local_file),
        R2_BUCKET,
        r2_key,
        ExtraArgs={"ContentType": "audio/mpeg"}
    )
    
    if local_file.exists():
        local_file.unlink()

    return f"{R2_PUBLIC_DOMAIN}/{r2_key}"

async def claim_drop_job(next_track_id: int, next_title: str, idempotency_key: str):
    """
    Atomic Claiming with 120s lease:
    Reclaims crashed jobs whose lease expired, and ignores already completed (READY) jobs.
    """
    sql = """
        INSERT INTO radio_drops (
          title, audio_url, timing_type, target_track_id, status, idempotency_key, 
          worker_id, attempt_count, max_attempts, claimed_at, lease_expires_at
        )
        VALUES (%s, '', 'intro', %s, 'CLAIMED', %s, %s, 1, 3, NOW(), NOW() + INTERVAL '120 seconds')
        ON CONFLICT (idempotency_key) DO UPDATE SET
          status = 'CLAIMED',
          worker_id = EXCLUDED.worker_id,
          attempt_count = radio_drops.attempt_count + 1,
          claimed_at = NOW(),
          lease_expires_at = NOW() + INTERVAL '120 seconds'
        WHERE radio_drops.status IN ('PENDING', 'FAILED')
           OR (radio_drops.status IN ('CLAIMED', 'SYNTHESIZING', 'MASTERING', 'UPLOADING') 
               AND radio_drops.lease_expires_at < NOW() 
               AND radio_drops.attempt_count < radio_drops.max_attempts)
        RETURNING id;
    """
    res = await async_db(sql, (f"DJ Fusion Intro - {next_title}", next_track_id, idempotency_key, WORKER_ID))
    return res[0]["id"] if res else None

async def follower_main_loop():
    global LAST_PROCESSED_TRANSITION_ID, TRACKS_SINCE_LAST_DROP, CURRENT_JOB_ID, LAST_ERROR, LAST_ERROR_TIME
    print(f"[PlayoutFollower] Playout Follower daemon started. Worker ID: {WORKER_ID}")

    async with httpx.AsyncClient(timeout=15.0) as client:
        last_heartbeat_time = 0

        while True:
            now = time.time()
            if now - last_heartbeat_time >= 15:
                status_str = "PROCESSING" if CURRENT_JOB_ID else "IDLE"
                if LAST_ERROR and LAST_ERROR_TIME and (now - LAST_ERROR_TIME.timestamp()) < 120:
                    status_str = "DEGRADED"
                await update_worker_heartbeat(status_str)
                last_heartbeat_time = now

            try:
                # 1. Minimal-Poller Sleep Gate: Sleep 30s if 0 listeners
                listeners = await check_active_listeners()
                if listeners == 0:
                    await asyncio.sleep(25)
                    continue

                # 2. Fetch Authoritative Broadcast State
                resp = await client.get(f"{APP_URL}/api/radio/playout-state")
                if resp.status_code != 200:
                    await asyncio.sleep(6)
                    continue

                playout = resp.json()
                if not playout or playout.get("offline"):
                    await asyncio.sleep(10)
                    continue

                current_track = playout.get("current_track")
                next_track = playout.get("next_track")
                transition_id = playout.get("transition_id")
                time_remaining = current_track.get("time_remaining_sec", 0)

                # 3. Deterministic Transition Identification
                if 8 <= time_remaining <= 45:
                    if transition_id != LAST_PROCESSED_TRANSITION_ID:
                        LAST_PROCESSED_TRANSITION_ID = transition_id
                        TRACKS_SINCE_LAST_DROP += 1
                        print(f"[PlayoutFollower] Transition approaching: {transition_id}. Tracks since drop: {TRACKS_SINCE_LAST_DROP}")

                        # 4. Cadence Checks: >= 3 tracks AND >= 600s (10 min) cooldown
                        is_clock_ok = await check_last_drop_cadence_allowed()
                        if TRACKS_SINCE_LAST_DROP >= 3 and is_clock_ok:
                            next_track_id = int(next_track["id"])
                            loop_cycle = playout.get("loop_cycle", 0)
                            playlist_id = playout.get("playlist_id") or "cat"
                            idempotency_key = f"intro_{playlist_id}_{next_track_id}_{loop_cycle}"

                            # 5. Atomic Claim Job
                            drop_id = await claim_drop_job(next_track_id, next_track.get("title", ""), idempotency_key)
                            if drop_id:
                                CURRENT_JOB_ID = drop_id
                                await update_worker_heartbeat("PROCESSING")
                                print(f"[PlayoutFollower] Claimed Drop #{drop_id} for Track #{next_track_id} ('{next_track.get('title')}')")

                                try:
                                    # Generate Script
                                    daypart = get_daypart_name()
                                    script = generate_dj_script(next_track, daypart)
                                    
                                    # Synthesize TTS
                                    await async_db("UPDATE radio_drops SET status = 'SYNTHESIZING', script = %s WHERE id = %s", (script, drop_id), fetch=False)
                                    raw_audio = await synthesize_voice(script, client)

                                    # Master Audio (-14 LUFS)
                                    await async_db("UPDATE radio_drops SET status = 'MASTERING' WHERE id = %s", (drop_id,), fetch=False)
                                    mastered_path = await master_audio_loudnorm(raw_audio, drop_id)

                                    # Upload to R2
                                    await async_db("UPDATE radio_drops SET status = 'UPLOADING' WHERE id = %s", (drop_id,), fetch=False)
                                    audio_url = await upload_mastered_to_r2(mastered_path, drop_id)

                                    # Mark READY
                                    await async_db("""
                                        UPDATE radio_drops 
                                        SET audio_url = %s, status = 'READY', completed_at = NOW() 
                                        WHERE id = %s
                                    """, (audio_url, drop_id), fetch=False)

                                    # Update Worker & Metrics
                                    await async_db("""
                                        UPDATE radio_automation_workers 
                                        SET last_successful_drop = NOW(), last_successful_upload = NOW() 
                                        WHERE worker_id = %s
                                    """, (WORKER_ID,), fetch=False)

                                    TRACKS_SINCE_LAST_DROP = 0
                                    print(f"[PlayoutFollower] Drop #{drop_id} READY: {audio_url}")
                                except Exception as err:
                                    LAST_ERROR = str(err)[:250]
                                    LAST_ERROR_TIME = datetime.now(timezone.utc)
                                    print(f"[PlayoutFollower] Generation error on Drop #{drop_id}: {err}", file=sys.stderr)
                                    await async_db("UPDATE radio_drops SET status = 'FAILED', last_error = %s WHERE id = %s", (LAST_ERROR, drop_id), fetch=False)
                                finally:
                                    CURRENT_JOB_ID = None
                                    await update_worker_heartbeat("IDLE")

                await asyncio.sleep(5)
            except Exception as loop_err:
                LAST_ERROR = str(loop_err)[:250]
                LAST_ERROR_TIME = datetime.now(timezone.utc)
                print(f"[PlayoutFollower] Outer loop exception: {loop_err}", file=sys.stderr)
                await asyncio.sleep(8)

if __name__ == "__main__":
    asyncio.run(follower_main_loop())
