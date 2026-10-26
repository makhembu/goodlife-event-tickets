"""
GOODLIFE Radio 254 - Audio Mixing & Mastering Service
Handles sidechain ducking (-12dB intro), EBU R128 (-14 LUFS) loudnorm, and DIY drop mastering.
"""

import asyncio
import json
import logging
import os
import shutil
import subprocess
import uuid

logger = logging.getLogger("goodlife.audio_mixer")


class AudioMixer:
    def __init__(self, output_dir: str = "/tmp/goodlife-processing"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def _two_pass_loudnorm(
        self,
        input_path: str,
        output_path: str,
        target_i: float = -14.0,
        target_lra: float = 7.0,
        target_tp: float = -1.5,
    ) -> bool:
        """
        Applies EBU R128 loudness normalization using the correct two-pass approach.
        Pass 1: measures actual integrated loudness, LRA, and true peak.
        Pass 2: applies precise gain correction using measured values.
        Returns True on success, False on failure.
        """
        # Pass 1: Measure
        measure_cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-af", f"loudnorm=I={target_i}:LRA={target_lra}:TP={target_tp}:print_format=json",
            "-f", "null", "-",
        ]
        result = subprocess.run(
            measure_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        stderr = result.stderr
        try:
            json_start = stderr.rfind("{")
            json_end = stderr.rfind("}") + 1
            if json_start == -1 or json_end <= json_start:
                raise ValueError("JSON block not found in ffmpeg output")
            measured = json.loads(stderr[json_start:json_end])
        except Exception as e:
            logger.warning(f"Pass 1 loudnorm measure failed to parse JSON: {e}. Falling back to single-pass.")
            return False

        # Pass 2: Apply with measured values
        apply_filter = (
            f"loudnorm=I={target_i}:LRA={target_lra}:TP={target_tp}:linear=true"
            f":measured_I={measured['input_i']}"
            f":measured_LRA={measured['input_lra']}"
            f":measured_TP={measured['input_tp']}"
            f":measured_thresh={measured['input_thresh']}"
            f":offset={measured['target_offset']}"
            f":print_format=none"
        )
        apply_cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-af", apply_filter,
            "-c:a", "libmp3lame", "-b:a", "320k", "-ar", "44100",
            output_path,
        ]
        result2 = subprocess.run(
            apply_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        if result2.returncode != 0:
            logger.error(f"Pass 2 loudnorm apply failed: {result2.stderr}")
            return False

        logger.info(
            f"Two-pass loudnorm complete: {input_path} -> {output_path} "
            f"(input_i={measured.get('input_i')} -> target={target_i} LUFS)"
        )
        return True

    async def duck_song_intro(
        self,
        song_path: str,
        drop_path: str,
        artist: str,
        title: str,
    ) -> str:
        """
        Ducks the song intro by -12dB under the voice drop using ffmpeg sidechain compression,
        and normalizes the final mix to -14 LUFS.
        """
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._sync_duck_song_intro, song_path, drop_path, artist, title
        )

    def _sync_duck_song_intro(
        self,
        song_path: str,
        drop_path: str,
        artist: str,
        title: str,
    ) -> str:
        job_id = uuid.uuid4().hex[:8]
        output_path = os.path.join(self.output_dir, f"mastered_{job_id}.mp3")
        mix_path = os.path.join(self.output_dir, f"mix_{job_id}.mp3")

        # ffmpeg complex filtergraph:
        # [0:a] = Song audio
        # [1:a] = Voice drop
        # 1. Delay drop by 200ms so initial beat hits first
        # 2. Sidechaincompress song with linear threshold 0.25 (≈-12dBFS), ratio 6, attack 15ms, release 900ms, knee 6dB
        # 3. amix duration=longest to avoid truncating drop
        filter_complex = (
            "[1:a]adelay=200|200[delayed_drop];"
            "[0:a][delayed_drop]sidechaincompress="
            "threshold=0.25:ratio=6:attack=15:release=900:knee=6[ducked_song];"
            "[ducked_song][delayed_drop]amix=inputs=2:duration=longest:dropout_transition=3[out]"
        )

        cmd = [
            "ffmpeg",
            "-y",
            "-i", song_path,
            "-i", drop_path,
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-c:a", "libmp3lame",
            "-b:a", "320k",
            "-ar", "44100",
            "-metadata", f"artist={artist}",
            "-metadata", f"title={title}",
            "-metadata", "album=GOODLIFE Radio 254 (On-Air Selection)",
            mix_path,
        ]

        logger.info(f"Executing ffmpeg sidechain ducking filtergraph for '{artist} - {title}'...")
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        if result.returncode != 0:
            logger.error(f"ffmpeg mixing failed: {result.stderr}")
            logger.warning("Falling back to un-ducked clean song due to ffmpeg error.")
            return song_path

        # Step B: Apply two-pass loudnorm to mix
        success = self._two_pass_loudnorm(mix_path, output_path)
        if not success:
            logger.warning("Two-pass loudnorm failed; using mixed output.")
            shutil.move(mix_path, output_path)
        else:
            try:
                os.remove(mix_path)
            except OSError:
                pass

        logger.info(f"Mastered track ready with ducked drop: {output_path}")
        return output_path

    async def master_diy_drop(self, raw_audio_path: str, name: str = "custom_drop") -> str:
        """
        Masters mobile phone mic recordings for the DJ Cartwall or station drops:
        - High-pass at 120Hz (removes phone mic rumble)
        - High-shelf filter at 10kHz (-3dB air band rolloff)
        - Fast peak compressor (4:1)
        - EBU R128 Loudness Normalization to -14 LUFS with linear=true
        """
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._sync_master_diy_drop, raw_audio_path, name
        )

    def _sync_master_diy_drop(self, raw_audio_path: str, name: str) -> str:
        job_id = uuid.uuid4().hex[:8]
        output_path = os.path.join(self.output_dir, f"diy_{name}_{job_id}.mp3")

        audio_filter = (
            "highpass=f=120,"
            "equalizer=f=10000:t=h:w=0.5:g=-3,"
            "acompressor=threshold=-18dB:ratio=4:attack=20:release=250,"
            "loudnorm=I=-14:LRA=7:TP=-1.5:linear=true"
        )

        cmd = [
            "ffmpeg",
            "-y",
            "-i", raw_audio_path,
            "-af", audio_filter,
            "-c:a", "libmp3lame",
            "-b:a", "320k",
            "-ar", "44100",
            output_path,
        ]

        logger.info(f"Mastering DIY voice recording: {raw_audio_path} -> {output_path}")
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        if result.returncode != 0:
            logger.error(f"DIY mastering failed: {result.stderr}")
            raise RuntimeError(f"DIY drop mastering failed: {result.stderr}")

        logger.info(f"DIY drop mastered successfully: {output_path}")
        return output_path
