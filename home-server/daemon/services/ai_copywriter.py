"""
GOODLIFE Radio 254 - AI DJ Copywriter Service
Generates authentic Nairobi Sheng / English radio drop scripts using NVIDIA NIM (Llama 3.1 8B).
"""

import datetime
import logging
import os
import random
from typing import Optional

import httpx

logger = logging.getLogger("goodlife.ai_copywriter")


class AICopywriter:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://integrate.api.nvidia.com/v1",
        model: str = "meta/llama-3.1-8b-instruct",
    ):
        self.api_key = api_key or os.getenv("NVIDIA_NIM_API_KEY", "")
        self.base_url = base_url.rstrip("/")
        self.model = model

    def _get_daypart_context(self) -> dict:
        """Determines current daypart based on Nairobi EAT (UTC+3) time."""
        now_eat = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3)))
        hour = now_eat.hour

        if 6 <= hour < 10:
            return {"name": "Nairobi Sunrise", "vibes": "morning chill, soulful, easy vibes", "sheng": "wazi, amka"}
        elif 10 <= hour < 15:
            return {"name": "The Goodlife Daily", "vibes": "midday work flow, upbeat, high energy", "sheng": "form ni gani, mazee"}
        elif 15 <= hour < 19:
            return {"name": "Sunset Sessions", "vibes": "park & chill, sundowner, smooth afrobeats", "sheng": "washaa, chill out"}
        elif 19 <= hour or hour < 2:
            return {"name": "Quiver Madness", "vibes": "nightlife, amapiano bangers, club hype", "sheng": "kushika, shangwe"}
        else:
            return {"name": "The Afterhours", "vibes": "late night deep tech, minimal, insomniac groove", "sheng": "manze, usiku"}

    async def generate_drop_script(self, artist: str, title: str) -> str:
        """
        Generates a concise 1-2 sentence radio drop script tailored to the current
        station daypart and track.
        """
        daypart = self._get_daypart_context()

        # If no API key configured, use instant rule-based Kenyan radio script
        if not self.api_key:
            logger.warning("NVIDIA_NIM_API_KEY not set. Using rule-based Kenyan script generator.")
            return self._fallback_script(artist, title, daypart)

        system_prompt = (
            "You are the voice of 'GOODLIFE Radio 254', Kenya's premier festival and nightlife radio station broadcasting live from Nairobi. "
            "Write a punchy, authentic 1 to 2 sentence radio drop that introduces the upcoming song. "
            "Use natural Nairobi youth slang (Sheng) mixed with English. Keep it energetic, smooth, and under 18 words. "
            "Never use hashtags, stage directions, asterisks, or quotes. Output ONLY the raw spoken words."
        )

        user_prompt = (
            f"Current Nairobi Daypart: {daypart['name']} ({daypart['vibes']}).\n"
            f"Upcoming Song: {title} by {artist}.\n"
            f"Slang vibe: {daypart['sheng']}.\n"
            f"Write the spoken drop now:"
        )

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.7,
                        "max_tokens": 60,
                    },
                )

                if response.status_code == 200:
                    data = response.json()
                    script = data["choices"][0]["message"]["content"].strip()
                    # Clean any extraneous quotes
                    script = script.strip("\"' \n")
                    logger.info(f"NVIDIA NIM generated drop script: '{script}'")
                    return script
                else:
                    logger.error(f"NVIDIA NIM API error {response.status_code}: {response.text}")
                    return self._fallback_script(artist, title, daypart)

        except Exception as e:
            logger.error(f"NVIDIA NIM request failed: {e}. Falling back to rule-based script.")
            return self._fallback_script(artist, title, daypart)

    def _fallback_script(self, artist: str, title: str, daypart: dict) -> str:
        """Instant rule-based Kenyan drops if AI service is offline."""
        templates = [
            f"Wazi 254! You're locked to GOODLIFE Radio. Right now, {artist} with {title} taking over the airwaves!",
            f"Form ni gani Nairobi? {daypart['name']} vibes on GOODLIFE Radio, check out {artist} on this one!",
            f"Non-stop bangers live on 254! Fresh drop right now: {artist} with {title}!",
            f"You know how we do it at GOODLIFE! Straight out of Nairobi, here is {artist} with {title}!",
        ]
        return random.choice(templates)
