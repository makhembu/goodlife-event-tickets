"""
GOODLIFE Radio 254 - AzuraCast REST API Client
Uploads tracks, injects requests into AutoDJ queue, and fetches Now Playing metadata.
"""

import logging
import os
from typing import Dict, Any, Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger("goodlife.azuracast_client")


class AzuraCastClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        station_id: int = 1,
    ):
        self.base_url = (base_url or os.getenv("AZURACAST_BASE_URL", "http://127.0.0.1:8055")).rstrip("/")
        self.api_key = api_key or os.getenv("AZURACAST_API_KEY", "")
        self.station_id = station_id

    def _headers(self) -> Dict[str, str]:
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def get_now_playing(self) -> Dict[str, Any]:
        """Fetches current track, listener count, and queue preview from AzuraCast."""
        url = f"{self.base_url}/api/nowplaying/{self.station_id}"
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(url)
            if res.status_code == 200:
                return res.json()
            logger.error(f"Failed to fetch now playing: {res.status_code} - {res.text}")
            return {}

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def upload_media_file(self, file_path: str, destination_dir: str = "on_demand_inserts") -> int:
        """
        Uploads a local MP3 file to the AzuraCast station media library.
        Returns the created media ID.
        """
        filename = os.path.basename(file_path)
        url = f"{self.base_url}/api/station/{self.station_id}/files"

        logger.info(f"Uploading '{filename}' to AzuraCast media directory '{destination_dir}'...")

        async with httpx.AsyncClient(timeout=45.0) as client:
            with open(file_path, "rb") as f:
                files = {"file": (filename, f, "audio/mpeg")}
                data = {"file_path": f"{destination_dir}/{filename}"}

                response = await client.post(
                    url,
                    headers=self._headers(),
                    data=data,
                    files=files,
                )

                if response.status_code in (200, 201):
                    res_data = response.json()
                    # AzuraCast returns either media object or record with id
                    media_id = res_data.get("id") or res_data.get("media", {}).get("id")
                    if media_id:
                        logger.info(f"File uploaded successfully. Media ID: {media_id}")
                        return int(media_id)
                    logger.warning(f"File uploaded but media_id not found in response: {res_data}")
                    return 0
                else:
                    logger.error(f"AzuraCast upload failed HTTP {response.status_code}: {response.text}")
                    raise RuntimeError(f"AzuraCast upload failed: {response.text}")

    async def queue_song_request(self, media_id: int) -> bool:
        """
        Submits a track request via AzuraCast Request API.
        Because station is configured with 'Play Requests Immediately',
        this inserts the song as 'Up Next' (Slot 11) right after current song.
        """
        url = f"{self.base_url}/api/station/{self.station_id}/request/{media_id}"
        logger.info(f"Submitting high-priority song request for media ID: {media_id}...")

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=self._headers())

            if response.status_code in (200, 201):
                logger.info(f"Song request queued successfully: {response.json()}")
                return True
            else:
                logger.error(f"Song request failed HTTP {response.status_code}: {response.text}")
                return False
