"""
GOODLIFE Radio 254 - Audio Metadata & Title Sanitizer
Extracts clean Artist and Song Title from noisy track names or YouTube titles.
"""

import re
from typing import Tuple


def sanitize_track_title(raw_title: str) -> Tuple[str, str]:
    """
    Cleans a raw track or video title into a clean (artist, title) tuple.
    
    Examples:
      "Diamond Platnumz - Komasava [Official Music Video] (feat. Jason Derulo) 1080p"
      -> ("Diamond Platnumz", "Komasava (feat. Jason Derulo)")
      
      "Mnike - Tyler ICU & Tumelo.za (Official Audio) [HQ]"
      -> ("Tyler ICU & Tumelo.za", "Mnike")
    """
    if not raw_title or not raw_title.strip():
        return ("Goodlife Radio", "Festival Anthem")

    title = raw_title.strip()

    # 1. Remove bracketed noise: [Official Video], [Lyrics], [HD], [4K], [1080p], [HQ], etc.
    noise_patterns = [
        r"\[(official\s+video|official\s+music\s+video|music\s+video|lyrics|official\s+audio|audio|visualizer|video|4k|1080p|720p|hd|hq)\]",
        r"\((official\s+video|official\s+music\s+video|music\s+video|lyrics|official\s+audio|audio|visualizer|video|4k|1080p|720p|hd|hq)\)",
        r"\|\s*official\s+video",
        r"\|\s*official\s+audio",
        r"//\s*official\s+music\s+video",
        # Standalone resolution and video fluff flags
        r"\b(1080p|720p|4k|2160p|hd|hq)\b",
    ]
    for pattern in noise_patterns:
        title = re.sub(pattern, "", title, flags=re.IGNORECASE)

    # 2. Normalize whitespace and trailing hyphens/pipes
    title = re.sub(r"\s+", " ", title).strip()
    title = title.strip("-| /:")

    # 3. Detect standard "Artist - Title" separator
    if " - " in title:
        parts = title.split(" - ", 1)
        artist = parts[0].strip()
        song = parts[1].strip()
    elif ":" in title:
        parts = title.split(":", 1)
        artist = parts[0].strip()
        song = parts[1].strip()
    else:
        # Fallback when no clear delimiter exists
        artist = "Goodlife Selection"
        song = title

    # Clean artist and song of any remaining dangling punctuation
    artist = re.sub(r"\s+", " ", artist).strip("-_()[]{} ")
    song = re.sub(r"\s+", " ", song).strip("-_()[]{} ")

    if not artist:
        artist = "Goodlife Selection"
    if not song:
        song = "Festival Track"

    return (artist, song)


def format_radio_metadata(artist: str, song: str) -> str:
    """Returns standard on-air metadata format for Icecast / Liquidsoap."""
    return f"{artist} - {song}"
