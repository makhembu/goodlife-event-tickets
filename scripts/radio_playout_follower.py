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
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_API_KEY_FALLBACK = os.environ.get("GROQ_API_KEY_FALLBACK", "")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
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
RECENT_SCRIPTS = []

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
    clean = re.sub(r'[*"\'_#`~]', '', no_emoji)
    # Strip any leading "Yo", "Yoo", "Yo what's good"
    clean = re.sub(r'^(yo+|yo+ what\'?s? good|yoo+)[,!\s]+', '', clean, flags=re.IGNORECASE)
    # Strip permanently banned words: "wazi", "waz", "wazi wazi"
    clean = re.sub(r'\bwazi\s+wazi\b', '', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\bwazi\b', '', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\bwaz\b', '', clean, flags=re.IGNORECASE)
    clean = clean.replace("254", "two five four").replace("200 bob", "two hundred bob")
    clean = clean.replace("CBD", "C B D").replace("cbd", "C B D")
    clean = clean.replace("Ksh", "shillings").replace("ksh", "shillings")
    clean = clean.replace(".co.ke", " dot space")
    clean = clean.replace("goodlife.smwhr.space", "the Goodlife website")
    clean = re.sub(r'\s+', ' ', clean)
    return clean.strip()

def get_daypart_name() -> str:
    # EAT time (UTC + 3)
    hour = (datetime.now(timezone.utc).hour + 3) % 24
    if 5 <= hour < 12:
        return "morning hustle"
    elif 12 <= hour < 17:
        return "midday groove"
    elif 17 <= hour < 22:
        return "evening rush"
    return "night flight"

async def get_active_counties() -> list:
    """Fetch active Kenyan counties with recent pings for live radar shoutouts."""
    try:
        rows = await async_db(
            """
            SELECT DISTINCT county_name 
            FROM radio_listener_pings 
            WHERE last_seen >= NOW() - INTERVAL '180 seconds' 
              AND county_name IS NOT NULL 
              AND county_name != ''
            LIMIT 4
            """
        )
        return [r["county_name"] for r in rows if r.get("county_name")]
    except Exception:
        return []

async def seed_recent_scripts():
    """Initializes in-memory anti-repetition cache from Postgres."""
    global RECENT_SCRIPTS
    try:
        rows = await async_db(
            "SELECT script FROM radio_drops WHERE script IS NOT NULL ORDER BY created_at DESC LIMIT 15"
        )
        if rows:
            RECENT_SCRIPTS = [r["script"] for r in rows if r.get("script")]
            print(f"[PlayoutFollower] Seeded {len(RECENT_SCRIPTS)} recent drops for anti-repetition memory.")
    except Exception as e:
        print(f"[PlayoutFollower] Seed recent scripts warning: {e}", file=sys.stderr)

SHENG_DICTIONARY = [
    "cheki vile hii inabounce", "rada ni gani msee", "bila wasi tuko locked",
    "baze imetulia spika zikilia", "wacha mziki utiririke bila breki",
    "kam through na mbogi yako", "kila kona ya jiji inasikiza hii",
    "shika kiti utulie kiasi", "weka volume kwa ceiling maboys",
    "rieng ni moto sana huku nje", "bassline inashake mtaa mzima",
    "round hii ni full throttle", "selector anachoma meza ya mixer",
    "kila pande ya two five four tunabamba", "shika rhythm utulie nayo",
    "vibes ziko intact kabisa", "haina presha tuko ngangari",
    "maraundi za jiji na ngoma kali", "mavibe za two five four",
    "piga luku safi tukutane mbele", "ngoma imenoga aje maze",
    "goodlife ni lifestyle si event tu", "step kwa dancefloor bila aibu"
]

DYNAMIC_OPENERS = [
    "Turn the volume all the way to the ceiling!",
    "Straight heat on the frequency right now!",
    "Spika zikilia pande zote across the two five four!",
    "Cheki vile hii inabounce fresh off the decks!",
    "We outside right now, no slowdown!",
    "Kila pembe ya two five four, tuko locked in!",
    "Baze imetulia mtambo ukiwaka vizuri!",
    "Frequency ya mabazuu inabamba bila breki!",
    "Mziki inatiririka straight to your speakers!",
    "Hold tight, selector anachoma meza!",
    "Kutoka mtaa hadi mtaa, vibez strictly on point!",
    "Full throttle energy right into your space!",
    "Twende kazi sasa hivi na sound safi kabisa!"
]

async def generate_dj_script(next_track: dict, daypart: str, client: httpx.AsyncClient) -> str:
    """
    Generates authentic Homeboyz Radio style on-air script:
    - 70% Kenyan English + 30% Nairobi Sheng
    - Mid-clause code-switching without synthetic rigid repetition
    - PERMANENTLY BANNED: 'wazi', 'waz', and repeating 'Nairobi'
    - Rotating archetypes: Track Stager, Radar Shoutout, Event Teaser, Station ID
    - Zero emojis, no leading 'Yo', 15-drop anti-repetition memory
    """
    global RECENT_SCRIPTS
    import random
    title = next_track.get("title", "Fresh Heat")
    dj_name = next_track.get("artist") or "GOODLIFE Selector"
    active_counties = await get_active_counties()
    
    # Archetype selection
    if active_counties and random.random() < 0.35:
        archetype = "RADAR_SHOUTOUT"
    elif random.random() < 0.60:
        archetype = "TRACK_STAGER"
    elif random.random() < 0.85:
        archetype = "EVENT_SPOTLIGHT"
    else:
        archetype = "STATION_ID"

    # Sample random fresh Sheng phrase & opener
    sheng_flavor = random.choice(SHENG_DICTIONARY)
    suggested_opener = random.choice(DYNAMIC_OPENERS)

    system_prompt = (
        "You are DJ Fusion, the premier on-air radio presenter on GOODLIFE Radio two five four.\n"
        "You broadcast authentic Kenyan urban radio vibes (Homeboyz Radio / NRG style).\n\n"
        "CRITICAL BROADCAST CONSTRAINTS:\n"
        "1. CODE-SWITCHING: Blend 70% Kenyan English and 30% Nairobi Sheng naturally mid-sentence.\n"
        "2. STRICTLY FORBIDDEN WORDS: NEVER use 'wazi', 'waz', or 'wazi wazi'. They are permanently banned.\n"
        "3. GEOGRAPHY DIVERSITY: Do NOT default to saying 'Nairobi' on every drop. GOODLIFE Radio broadcasts to all forty seven counties (Mombasa, Nakuru, Kisumu, Kiambu, Machakos, Eldoret, Thika) and diaspora worldwide. Only mention a specific location if provided in the user prompt. Otherwise speak to 'the two five four' or 'kila pembe' or focus purely on the track.\n"
        "4. STRICTLY BANNED: NEVER EVER start with 'Yo', 'Yoo', or 'Yo what is good'. Never use generic greetings like 'Rise and shine'.\n"
        "5. NO EMOJIS OR SPECIAL CHARACTERS: Never output emojis, quotation marks, hashtags, or asterisks. Output plain text only.\n"
        "6. BROADCAST SPEECH: Say 'two five four' (never '254'). Say 'C B D' (never 'CBD'). Say 'two hundred bob' (never '200 bob'). For website, say 'the Goodlife website' (NEVER say '.co.ke').\n"
        "7. LENGTH: 1 to 2 punchy sentences maximum (14 to 22 words).\n"
        "8. Output ONLY the raw spoken radio script. Nothing else.\n"
    )

    if RECENT_SCRIPTS:
        recent_snippet = " | ".join(RECENT_SCRIPTS[-6:])
        system_prompt += f"\nRECENT DROPS ALREADY AIRED (DO NOT REPEAT THESE OPENERS OR PHRASES):\n{recent_snippet}\n"

    if archetype == "RADAR_SHOUTOUT" and active_counties:
        counties_str = " and ".join(active_counties)
        user_prompt = (
            f"Archetype: LIVE RADAR SHOUTOUT. Active counties on the radar: {counties_str}. "
            f"Give them massive love and hype incoming track '{title}' by '{dj_name}'. "
            f"Suggested flavor phrase: '{sheng_flavor}'."
        )
    elif archetype == "EVENT_SPOTLIGHT":
        user_prompt = (
            f"Archetype: EVENT SPOTLIGHT. Hype the Sunday Festival at Marara Camp Thika. "
            f"Grounds are set, secure tickets on the Goodlife website, leading into '{title}' by '{dj_name}'. "
            f"Suggested flavor phrase: '{sheng_flavor}'."
        )
    elif archetype == "STATION_ID":
        user_prompt = (
            f"Archetype: STATION ID. Frequency pride for {daypart}. Street hustle, matatus, and beats on GOODLIFE Radio two five four leading into '{title}' by '{dj_name}'. "
            f"Suggested opening style: '{suggested_opener}'. Suggested flavor phrase: '{sheng_flavor}'."
        )
    else:
        user_prompt = (
            f"Archetype: TRACK STAGER. Hype the transition and sound for incoming track '{title}' by '{dj_name}' during {daypart}. "
            f"Suggested opening style: '{suggested_opener}'. Suggested flavor phrase: '{sheng_flavor}'. "
            f"Focus on the DJ mix, bassline, and high-pace energy."
        )

    generated_script = None

    # Provider 1: NVIDIA NIM (nvidia/nemotron-3.5-bolt-e4b) - fastest & sharpest
    if NVIDIA_API_KEY:
        try:
            nv_resp = await client.post(
                "https://integrate.api.nvidia.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {NVIDIA_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "nvidia/nemotron-3.5-bolt-e4b",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": 0.85,
                    "max_tokens": 60
                },
                timeout=5.0
            )
            if nv_resp.status_code == 200:
                raw_c = nv_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if raw_c and len(raw_c) > 10:
                    generated_script = raw_c
        except Exception:
            pass

    # Provider 2: Groq (Primary: qwen/qwen3.8-27b, Fallback: openai/gpt-oss-20b)
    if not generated_script:
        for api_key in [GROQ_API_KEY, GROQ_API_KEY_FALLBACK]:
            if not api_key:
                continue
            for model in ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"]:
                try:
                    resp = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {api_key}"},
                        json={
                            "model": model,
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_prompt}
                            ],
                            "temperature": 0.8,
                            "max_tokens": 65
                        },
                        timeout=6.0
                    )
                    if resp.status_code == 200:
                        content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                        if content and len(content) > 10:
                            generated_script = content
                            break
                except Exception:
                    pass
            if generated_script:
                break

    # Curated Diverse Fallbacks with zero 'wazi' and varied geography
    if not generated_script:
        fallbacks = [
            f"Spika zikilia across the two five four! Taking the energy all the way up right now with {title} by {dj_name} on GOODLIFE Radio!",
            f"Kila pembe tuko locked in! Incoming pure heat kutoka {dj_name} na ngoma inaitwa {title}. Twende kazi!",
            f"Grounds ziko ready this Sunday at Marara Camp Thika! Turn the volume up, GOODLIFE Radio two five four rolling straight into {title}!",
            f"Frequency ya mabazuu haisimami! Mziki inatiririka bila breki, ngoma inafuata ni {title} by {dj_name}!",
            f"Hold tight, selector anachoma meza! Massive energy across the frequency right now with {title} by {dj_name}!",
            f"Turn the volume to the ceiling! We outside with pure fire, {dj_name} dropping {title} on GOODLIFE Radio two five four!",
            f"Mavibe za two five four straight to your speakers! Transition safi kabisa into {title} by {dj_name}!"
        ]
        generated_script = random.choice(fallbacks)

    final_script = clean_script_for_tts(generated_script)

    # Anti-repetition check: if first 3 words match any recent script, swap opener
    script_words = final_script.lower().split()[:3]
    for past_script in RECENT_SCRIPTS[-10:]:
        past_words = past_script.lower().split()[:3]
        if script_words == past_words:
            # Swap with random distinct opener
            alt_opener = random.choice(DYNAMIC_OPENERS)
            final_script = clean_script_for_tts(f"{alt_opener} GOODLIFE Radio two five four rolling with {title} by {dj_name}!")
            break

    # Update anti-repetition memory
    RECENT_SCRIPTS.append(final_script)
    if len(RECENT_SCRIPTS) > 15:
        RECENT_SCRIPTS.pop(0)

    return final_script

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
        "Content-Type": "application/msgpack",
        "model": "s2.1-pro-free"
    }
    payload = {
        "text": clean_text,
        "format": "mp3",
        "model": "s2.1-pro-free",
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

    await seed_recent_scripts()

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
                                    # Generate Authentic Homeboyz Radio Script
                                    daypart = get_daypart_name()
                                    script = await generate_dj_script(next_track, daypart, client)
                                    print(f"[PlayoutFollower] Script generated for Drop #{drop_id}: \"{script}\"")
                                    
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
