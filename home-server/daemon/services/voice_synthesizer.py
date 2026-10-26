"""
GOODLIFE Radio 254 - Multi-Tier Voice Synthesizer Service
1. Primary: Fish Audio API (Kenyan DJ Clone)
2. Tier 1 Fallback: Microsoft Edge-TTS (sw-KE-RafikiNeural / sw-KE-ZuriNeural) [100% Free]
3. Tier 2 Fallback: Local Stock Festival Drops
"""

import asyncio
import logging
import os
import random
import uuid
from typing import Optional

import edge_tts
import httpx

logger = logging.getLogger("goodlife.voice_synthesizer")


class VoiceSynthesizer:
    def __init__(
        self,
        output_dir: str = "/tmp/goodlife-processing",
        stock_drops_dir: str = "/var/goodlife/drops/stock",
    ):
        self.output_dir = output_dir
        self.stock_drops_dir = stock_drops_dir
        self.fish_api_key = os.getenv("FISH_AUDIO_API_KEY", "")
        self.fish_voice_id = os.getenv("FISH_AUDIO_VOICE_ID", "6801890ec345469d8818129e5bdd50dd")
        self.edge_voice = os.getenv("EDGE_TTS_VOICE_MALE", "sw-KE-RafikiNeural")
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(self.stock_drops_dir, exist_ok=True)

    async def synthesize(self, text: str, voice_preference: str = "male") -> str:
        """
        Synthesizes spoken text into an audio file.
        Attempts Fish Audio first -> falls back to Edge-TTS -> falls back to stock drop.
        Returns path to generated audio file (WAV or MP3).
        """
        job_id = uuid.uuid4().hex[:8]
        output_path = os.path.join(self.output_dir, f"drop_{job_id}.mp3")

        # 1. Try Primary: Fish Audio
        if self.fish_api_key:
            try:
                success = await self._synthesize_fish_audio(text, output_path)
                if success and os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
                    logger.info(f"Fish Audio synthesis successful: {output_path}")
                    return output_path
            except Exception as e:
                logger.warning(f"Fish Audio synthesis failed: {e}. Falling back to Edge-TTS.")

        # 2. Try Tier 1 Fallback: Edge-TTS (Free, fast, native Kenyan Swahili accent)
        try:
            voice = self.edge_voice if voice_preference == "male" else os.getenv("EDGE_TTS_VOICE_FEMALE", "sw-KE-ZuriNeural")
            logger.info(f"Synthesizing with Edge-TTS using voice '{voice}'...")
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(output_path)

            if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
                logger.info(f"Edge-TTS synthesis successful: {output_path}")
                return output_path
        except Exception as e:
            logger.warning(f"Edge-TTS synthesis failed: {e}. Falling back to stock drop.")

        # 3. Try Tier 2 Fallback: Pre-rendered stock festival drops
        stock_drop = self._get_random_stock_drop()
        if stock_drop:
            logger.info(f"Using stock festival drop: {stock_drop}")
            return stock_drop

        raise RuntimeError("All voice synthesis tiers failed and no stock drops found.")

    async def _synthesize_fish_audio(self, text: str, output_path: str) -> bool:
        """Calls Fish Audio API v1 for speech synthesis."""
        url = "https://api.fish.audio/v1/tts"
        headers = {
            "Authorization": f"Bearer {self.fish_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "text": text,
            "reference_id": self.fish_voice_id,
            "format": "mp3",
            "latency": "normal",
        }

        async with httpx.AsyncClient(timeout=6.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code == 200:
                with open(output_path, "wb") as f:
                    f.write(response.content)
                return True
            else:
                logger.warning(f"Fish Audio HTTP {response.status_code}: {response.text}")
                return False

    def _get_random_stock_drop(self) -> Optional[str]:
        """Returns a path to a pre-recorded festival jingle or emergency drop."""
        if not os.path.exists(self.stock_drops_dir):
            return None

        candidates = [
            os.path.join(self.stock_drops_dir, f)
            for f in os.listdir(self.stock_drops_dir)
            if f.endswith((".mp3", ".wav"))
        ]
        if candidates:
            return random.choice(candidates)

        # Fallback to general emergency drop
        emergency_file = "/var/goodlife/drops/emergency-fallback.mp3"
        return emergency_file if os.path.exists(emergency_file) else None
