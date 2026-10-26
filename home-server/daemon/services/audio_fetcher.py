"""
GOODLIFE Radio 254 - Audio Ingestion & Extraction Service
Downloads audio from YouTube, SoundCloud, or direct URLs using yt-dlp.
"""

import asyncio
import logging
import os
import uuid
from typing import Dict, Any, Optional

import yt_dlp

from .title_cleaner import sanitize_track_title

logger = logging.getLogger("goodlife.audio_fetcher")


class AudioFetcher:
    def __init__(self, output_dir: str = "/tmp/goodlife-processing"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    async def fetch_audio(self, url: str) -> Dict[str, Any]:
        """
        Extracts audio from a remote URL (YouTube, SoundCloud, direct MP3)
        and converts it to a clean local MP3 file.
        
        Returns dict containing:
          - file_path: local path to the downloaded MP3
          - artist: cleaned artist name
          - title: cleaned song title
          - duration: duration in seconds
        """
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_fetch, url)

    def _sync_fetch(self, url: str) -> Dict[str, Any]:
        job_id = uuid.uuid4().hex[:8]
        output_template = os.path.join(self.output_dir, f"ingest_{job_id}_%(id)s.%(ext)s")

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                }
            ],
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "socket_timeout": 30,
        }

        logger.info(f"Initiating audio download for URL: {url} (Job ID: {job_id})")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=True)
            except Exception as e:
                logger.error(f"Failed to fetch audio from {url}: {e}")
                raise RuntimeError(f"Audio fetch error: {str(e)}")

            if not info:
                raise RuntimeError("yt-dlp returned empty info dict")

            raw_title = info.get("title", "")
            raw_uploader = info.get("uploader", "")
            duration = int(info.get("duration", 0))

            # Determine downloaded file path
            # Postprocessor converts extension to .mp3
            base_filename = ydl.prepare_filename(info)
            final_mp3_path = os.path.splitext(base_filename)[0] + ".mp3"

            if not os.path.exists(final_mp3_path):
                # Search matching job_id
                candidates = [
                    os.path.join(self.output_dir, f)
                    for f in os.listdir(self.output_dir)
                    if f.startswith(f"ingest_{job_id}") and f.endswith(".mp3")
                ]
                if candidates:
                    final_mp3_path = candidates[0]
                else:
                    raise FileNotFoundError(f"Expected MP3 file not found after download for {url}")

            # Clean metadata
            if " - " in raw_title:
                artist, title = sanitize_track_title(raw_title)
            elif raw_uploader:
                artist, title = sanitize_track_title(f"{raw_uploader} - {raw_title}")
            else:
                artist, title = sanitize_track_title(raw_title)

            logger.info(f"Audio fetched successfully: '{artist} - {title}' ({duration}s) -> {final_mp3_path}")

            return {
                "file_path": final_mp3_path,
                "artist": artist,
                "title": title,
                "duration": duration,
                "raw_title": raw_title,
            }
