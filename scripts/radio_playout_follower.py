"""
GOODLIFE Radio - Hardened Playout Follower Daemon v2.1
Host: DJ Smokey (de691fb22a0d47a0a28f7ee9dc736341)
Playout Engine: AutoDJ (pycrossfade) on 192.168.100.29
Unified API: https://goodlife.smwhr.space
"""

import asyncio
import json
import os
import random
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

import httpx
import boto3
from botocore.config import Config
import psycopg2
from psycopg2.extras import RealDictCursor

# Load Local Modules
CURRENT_DIR = Path(__file__).resolve().parent
sys.path.append(str(CURRENT_DIR))

import dj_memory_manager
import lrclib_service
import phrase_validator
from tts_provider import FishAudioProvider, FallbackEdgeTTSProvider, ResilientTTSClient

# Load Environment
env_path = CURRENT_DIR / ".env"
env_vars = {}
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env_vars[k.strip()] = v.strip().strip('"').strip("'")

DATABASE_URL = env_vars.get("DATABASE_URL") or os.environ.get("DATABASE_URL")
APP_URL = env_vars.get("APP_URL", "https://goodlife.smwhr.space").rstrip("/")
NVIDIA_API_KEY = env_vars.get("NVIDIA_API_KEY") or os.environ.get("NVIDIA_API_KEY", "")
GROQ_API_KEY = env_vars.get("GROQ_API_KEY") or os.environ.get("GROQ_API_KEY", "")
FISH_AUDIO_KEY = env_vars.get("FISH_AUDIO_KEY") or os.environ.get("FISH_AUDIO_KEY", "")
FISH_VOICE_ID = env_vars.get("FISH_VOICE_ID", "de691fb22a0d47a0a28f7ee9dc736341") # DJ Smokey

R2_BUCKET = env_vars.get("R2_BUCKET_NAME", "goodlife")
R2_PUBLIC_DOMAIN = env_vars.get("R2_PUBLIC_DOMAIN", "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev").rstrip("/")

WORKER_ID = f"follower_{socket.gethostname()}_{os.getpid()}"
TEMP_DIR = CURRENT_DIR / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Load Broadcast Timing Config
TIMING_CONFIG_PATH = CURRENT_DIR / "broadcast_timing.json"
timing_cfg = {
    "generation_window_start_sec": 38,
    "generation_window_end_sec": 14,
    "max_drop_duration_sec": 28,
    "drop_cadence_min_tracks_between_drops": 3,
    "drop_cooldown_min_sec": 600
}
if TIMING_CONFIG_PATH.exists():
    try:
        with open(TIMING_CONFIG_PATH) as f:
            timing_cfg = json.load(f).get("timing_rules", timing_cfg)
    except Exception as e:
        print(f"[Config] Error reading broadcast_timing.json: {e}")

# State Tracking
LAST_PROCESSED_TRANSITION_ID = None
TRACKS_SINCE_LAST_DROP = 0
CURRENT_JOB_ID = None
LAST_ERROR = None
LAST_ERROR_TIME = None
RECENT_SCRIPTS = []

# Initialize TTS Client
primary_tts = FishAudioProvider(FISH_AUDIO_KEY)
fallback_tts = FallbackEdgeTTSProvider()
tts_client = ResilientTTSClient(primary=primary_tts, secondary=fallback_tts)

def get_s3_client():
    account_id = env_vars.get("R2_ACCOUNT_ID")
    access_key = env_vars.get("R2_ACCESS_KEY_ID")
    secret_key = env_vars.get("R2_SECRET_ACCESS_KEY")
    if not (account_id and access_key and secret_key):
        return None
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
        region_name="auto"
    )

def sync_db(query: str, params: tuple = (), fetch: bool = True):
    if not DATABASE_URL:
        return []
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchall() if fetch else []
    finally:
        conn.close()

async def async_db(query: str, params: tuple = (), fetch: bool = True):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, sync_db, query, params, fetch)

async def check_last_drop_cadence_allowed() -> bool:
    cooldown = timing_cfg.get("drop_cooldown_min_sec", 600)
    # Check local SQLite drop_ledger
    try:
        conn = dj_memory_manager.sqlite3.connect(dj_memory_manager.DB_PATH)
        cur = conn.cursor()
        cur.execute("""
            SELECT (strftime('%s', 'now') - strftime('%s', created_at)) as age_sec
            FROM drop_ledger
            WHERE status IN ('STAGED', 'AIRING', 'AIRED', 'CONFIRMED')
            ORDER BY created_at DESC
            LIMIT 1;
        """)
        row = cur.fetchone()
        conn.close()
        if row and row[0] is not None and row[0] < cooldown:
            return False
    except Exception as e:
        print(f"[Cadence SQLite Notice] {e}")

    # Check Postgres radio_drops table
    try:
        sql = """
            SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) as age_sec
            FROM radio_drops
            ORDER BY created_at DESC
            LIMIT 1;
        """
        res = await async_db(sql)
        if res and res[0]["age_sec"] is not None:
            return res[0]["age_sec"] >= cooldown
    except Exception as e:
        print(f"[Cadence Postgres Notice] {e}")
    return True

def get_approved_trends() -> list:
    trends_file = CURRENT_DIR / "cache/approved_trends.json"
    if trends_file.exists():
        try:
            with open(trends_file) as f:
                data = json.load(f)
                # Ensure freshness (< 2 hours)
                if time.time() - data.get("updated_at", 0) < 7200:
                    return data.get("approved_trends", [])
        except Exception:
            pass
    return []

async def generate_script_with_retries(client: httpx.AsyncClient, title: str, artist: str, tier: int = 2) -> tuple[str, str, int]:
    """Generates structured DJ Smokey script, validating through deterministic NFKC phrase gate."""
    # Check for active Storyline lease
    storyline_lease = dj_memory_manager.acquire_storyline_lease(WORKER_ID, lease_sec=75)
    arc_id = None
    ep_num = 0
    storyline_context = ""

    if storyline_lease:
        arc_id = storyline_lease["arc_id"]
        ep_num = storyline_lease["current_episode"]
        storyline_context = f"Storyline Arc: '{storyline_lease['title']}', Episode {ep_num} of {storyline_lease['total_episodes']}."

    approved_trends = get_approved_trends()
    trend_context = f"Current Kenya pop buzz: {', '.join(approved_trends[:2])}." if approved_trends else ""

    system_prompt = (
        "You are DJ Smokey, the premier on-air radio presenter on GOODLIFE Radio 254.\n"
        "You broadcast authentic Kenyan urban radio vibes with high energy, playful punchlines, and deep charisma.\n\n"
        "CRITICAL BROADCAST CONSTRAINTS:\n"
        "1. CODE-SWITCHING: Blend natural Kenyan English and vibrant Sheng.\n"
        "2. STRICTLY FORBIDDEN WORDS: NEVER use 'wazi', 'waz', or 'wazi wazi'. They are permanently banned.\n"
        "3. FORBIDDEN OPENERS: NEVER start with 'Yo', 'Yoo', or 'Yo what is good'. Never use 'Rise and shine'.\n"
        "4. FORBIDDEN DOMAINS: NEVER say '.co.ke', '.space', or mention a URL domain. Always say 'the Goodlife website'.\n"
        "5. VENUE & FESTIVAL FOCUS: Hype the GOODLIFE Festival at Marara Camp, Thika. Nyama choma grills, heavy sound, open skies.\n"
        "6. LENGTH: 2 punchy sentences maximum (18 to 32 words).\n"
        "7. Return ONLY the spoken radio script. No quotation marks, no emojis.\n"
    )

    user_prompt = (
        f"Track incoming: '{title}' by '{artist}'.\n"
        f"{storyline_context}\n"
        f"{trend_context}\n"
        f"Hype the transition into '{title}' and drop a quick punchy cliffhanger or thought."
    )

    for attempt in range(2):
        generated = None
        # Try NVIDIA NIM
        if NVIDIA_API_KEY:
            try:
                nv_resp = await client.post(
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": "nvidia/nemotron-3.5-bolt-e4b",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.82,
                        "max_tokens": 120
                    },
                    timeout=5.0
                )
                if nv_resp.status_code == 200:
                    generated = nv_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            except Exception:
                pass

        # Try Groq Fallback
        if not generated and GROQ_API_KEY:
            try:
                g_resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                    json={
                        "model": "qwen/qwen3.8-27b",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.8,
                        "max_tokens": 120
                    },
                    timeout=5.0
                )
                if g_resp.status_code == 200:
                    generated = g_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            except Exception:
                pass

        if generated:
            is_clean, reason, clean_script = phrase_validator.sanitize_and_validate_script(generated)
            if is_clean:
                return clean_script, arc_id, ep_num
            else:
                print(f"[PhraseGate Warning] Attempt {attempt+1} rejected due to {reason}: '{generated}'")
                user_prompt += f" REJECTED: Avoid {reason}. Write a clean, high-energy transition line."

    # Pre-validated safe fallback
    safe_fallbacks = [
        f"Grounds are set for the Sunday Festival at Marara Camp Thika! Turn the volume up, GOODLIFE Radio rolling straight into {title} by {artist}!",
        f"Festival weather outside and pure rhythm inside! Lock your passes on the Goodlife website now before tiers vanish, taking you into {title}!",
        f"Heavy sound systems warming up and nyama choma on the highway! DJ Smokey on the decks for GOODLIFE Radio, let us run {title} by {artist}!"
    ]
    fallback_choice = random.choice(safe_fallbacks)
    return fallback_choice, arc_id, ep_num

async def synthesize_and_master(script_text: str, drop_id: int) -> Path:
    audio_bytes, provider = await tts_client.synthesize(script_text, FISH_VOICE_ID)
    raw_path = TEMP_DIR / f"raw_drop_{drop_id}.mp3"
    out_path = TEMP_DIR / f"mastered_drop_{drop_id}.mp3"

    with open(raw_path, "wb") as f:
        f.write(audio_bytes)

    # Broadcast standard loudnorm -14 LUFS
    cmd = [
        "ffmpeg", "-y", "-i", str(raw_path),
        "-af", "loudnorm=I=-14:TP=-1.0:LRA=9",
        "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k",
        str(out_path)
    ]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    await proc.wait()
    return out_path

async def run_follower_loop():
    global LAST_PROCESSED_TRANSITION_ID, TRACKS_SINCE_LAST_DROP
    print(f"[PlayoutFollower v2.1] Starting daemon with DJ Smokey ({FISH_VOICE_ID})...")
    dj_memory_manager.init_db(CURRENT_DIR / "storylines.json")

    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            try:
                # 1. Fetch Authoritative Broadcast State
                resp = await client.get(f"{APP_URL}/api/radio/playout-state")
                if resp.status_code != 200:
                    await asyncio.sleep(4)
                    continue

                playout = resp.json()
                if not playout or playout.get("offline"):
                    await asyncio.sleep(8)
                    continue

                current_track = playout.get("current_track", {})
                next_track = playout.get("next_track", {})
                transition_id = playout.get("transition_id")
                time_remaining = current_track.get("time_remaining_sec", 0)

                # 2. Timing Gate Check: 14s <= time_remaining <= 38s
                window_start = timing_cfg.get("generation_window_start_sec", 38)
                window_end = timing_cfg.get("generation_window_end_sec", 14)

                if window_end <= time_remaining <= window_start:
                    if transition_id and transition_id != LAST_PROCESSED_TRANSITION_ID:
                        LAST_PROCESSED_TRANSITION_ID = transition_id
                        TRACKS_SINCE_LAST_DROP += 1
                        print(f"[PlayoutFollower] Transition approaching: {transition_id}. Tracks since drop: {TRACKS_SINCE_LAST_DROP}")

                        cadence_ok = await check_last_drop_cadence_allowed()
                        min_tracks = timing_cfg.get("drop_cadence_min_tracks_between_drops", 3)

                        if TRACKS_SINCE_LAST_DROP >= min_tracks and cadence_ok:
                            next_track_id = int(next_track.get("id", 0))
                            title = next_track.get("title", "")
                            artist = next_track.get("artist", "")

                            # Generate Script
                            script, arc_id, ep = await generate_script_with_retries(client, title, artist)
                            drop_uid = int(time.time())
                            drop_id_str = f"drop_smokey_{drop_uid}"

                            print(f"[PlayoutFollower] Generated DJ Smokey Script: '{script}'")

                            # Synthesize & Master
                            mastered_file = await synthesize_and_master(script, drop_uid)

                            # Upload to Cloudflare R2
                            drop_url = ""
                            try:
                                s3 = get_s3_client()
                                if s3:
                                    r2_key = f"radio/drops/smokey_{drop_uid}.mp3"
                                    loop = asyncio.get_running_loop()
                                    await loop.run_in_executor(
                                        None,
                                        lambda: s3.upload_file(
                                            str(mastered_file),
                                            R2_BUCKET,
                                            r2_key,
                                            ExtraArgs={"ContentType": "audio/mpeg"}
                                        )
                                    )
                                    drop_url = f"{R2_PUBLIC_DOMAIN}/{r2_key}"
                                    print(f"[PlayoutFollower] R2 upload success: {drop_url}")
                            except Exception as ue:
                                print(f"[PlayoutFollower] R2 upload failed: {ue}")

                            # Insert into Postgres radio_drops so playout-state / web player consumes it
                            if drop_url and next_track_id:
                                try:
                                    await async_db("""
                                        INSERT INTO radio_drops 
                                        (title, audio_url, category, is_active, persona, mood, script, target_track_id, status, timing_type, created_at)
                                        VALUES (%s, %s, 'ai_voice', true, 'DJ Smokey', 'live_air', %s, %s, 'READY', 'live_drop', NOW())
                                    """, (f"DJ Smokey - {title[:40]}", drop_url, script, next_track_id), fetch=False)
                                    print(f"[PlayoutFollower] Inserted into Postgres radio_drops for track {next_track_id}")
                                except Exception as dbe:
                                    print(f"[PlayoutFollower] Postgres insert error: {dbe}")

                            # Record in SQLite Ledger
                            conn = dj_memory_manager.sqlite3.connect(dj_memory_manager.DB_PATH)
                            cur = conn.cursor()
                            cur.execute("""
                                INSERT INTO drop_ledger 
                                (drop_id, transition_id, broadcast_session_id, track_id, tier, storyline_arc, storyline_episode, script_text, audio_path, status, provider)
                                VALUES (?, ?, 'sess_20261112', ?, 2, ?, ?, ?, ?, 'STAGED', 'FishAudio_DJSmokey')
                            """, (drop_id_str, transition_id, next_track_id, arc_id, ep, script, str(mastered_file)))
                            conn.commit()
                            conn.close()

                            # AutoDJ Drop Confirmation Simulation
                            # Confirm playout & advance storyline episode
                            dj_memory_manager.confirm_drop_playout(drop_id_str)
                            TRACKS_SINCE_LAST_DROP = 0
                            print(f"[PlayoutFollower] Drop {drop_id_str} STAGED and CONFIRMED for transition {transition_id}!")

            except Exception as e:
                import traceback
                print(f"[PlayoutFollower Loop Error] {e}")
                traceback.print_exc()

            await asyncio.sleep(3)

if __name__ == '__main__':
    asyncio.run(run_follower_loop())
