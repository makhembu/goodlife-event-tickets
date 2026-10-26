"""
GOODLIFE Radio 254 - Automated DJ Session Archiver Service
Processes raw 320k harbor captures, applies EBU R128 loudnorm (-14 LUFS),
uploads to Cloudflare R2, and syncs recording metadata to Neon PostgreSQL.
"""

import datetime
import logging
import os
import shutil
import subprocess
import time
from typing import Dict, Any, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import psycopg2
from psycopg2.extras import RealDictCursor
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger("goodlife.archiver")


class SessionArchiver:
    def __init__(
        self,
        pending_dir: str = "/var/goodlife/recordings/pending",
        mastered_dir: str = "/var/goodlife/recordings/mastered",
        temp_dir: str = "/tmp/goodlife-processing",
    ):
        self.pending_dir = pending_dir
        self.mastered_dir = mastered_dir
        self.temp_dir = temp_dir
        os.makedirs(self.pending_dir, exist_ok=True)
        os.makedirs(self.mastered_dir, exist_ok=True)
        os.makedirs(self.temp_dir, exist_ok=True)

        self.r2_account_id = os.getenv("R2_ACCOUNT_ID", "")
        self.r2_access_key = os.getenv("R2_ACCESS_KEY_ID", "")
        self.r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY", "")
        self.r2_bucket = os.getenv("R2_BUCKET_NAME", "goodlife")
        self.r2_public_domain = os.getenv("R2_PUBLIC_DOMAIN", "https://assets.goodlife.co.ke").rstrip("/")
        self.database_url = os.getenv("DATABASE_URL", "")

    def _get_r2_client(self):
        """Initializes S3-compatible client for Cloudflare R2."""
        endpoint_url = f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
        return boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=self.r2_access_key,
            aws_secret_access_key=self.r2_secret_key,
            config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
            region_name="auto",
        )

    def extract_audio_duration(self, file_path: str) -> int:
        """Extracts audio duration in seconds using ffprobe."""
        try:
            cmd = [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if result.returncode == 0 and result.stdout.strip():
                return int(float(result.stdout.strip()))
        except Exception as e:
            logger.warning(f"Failed to probe duration for {file_path}: {e}")
        return 0

    def _insert_pending_job(self, local_path: str) -> Optional[int]:
        """Insert a pending_archives row and return its id."""
        if not self.database_url:
            return None
        conn = None
        try:
            conn = psycopg2.connect(self.database_url)
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO pending_archives (local_path, status) VALUES (%s, 'pending') RETURNING id;",
                    (local_path,)
                )
                job_id = cur.fetchone()[0]
                conn.commit()
                return job_id
        except Exception as e:
            logger.error(f"Failed to insert pending_archives row: {e}")
            if conn:
                conn.rollback()
            return None
        finally:
            if conn:
                conn.close()

    def _update_pending_job(
        self,
        job_id: int,
        status: str,
        recording_id: Optional[int] = None,
        error: Optional[str] = None,
    ) -> None:
        """Update a pending_archives row after an attempt."""
        if not self.database_url or not job_id:
            return
        conn = None
        try:
            conn = psycopg2.connect(self.database_url)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE pending_archives
                    SET status = %s,
                        recording_id = COALESCE(%s, recording_id),
                        error_message = %s,
                        retry_count = retry_count + 1,
                        last_attempted_at = NOW(),
                        updated_at = NOW()
                    WHERE id = %s;
                    """,
                    (status, recording_id, error, job_id)
                )
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to update pending_archives row {job_id}: {e}")
        finally:
            if conn:
                conn.close()

    def master_session_audio(self, raw_path: str, title: str, dj_name: str) -> str:
        """
        Runs two-pass ffmpeg loudnorm (-14 LUFS EBU R128) on the raw live recording
        and embeds ID3 metadata.
        """
        from services.audio_mixer import AudioMixer
        mixer = AudioMixer(output_dir=self.temp_dir)

        base_name = os.path.basename(raw_path)
        mastered_path = os.path.join(self.temp_dir, f"mastered_{base_name}")

        logger.info(f"Two-pass loudnorm mastering: {raw_path} -> {mastered_path}")
        success = mixer._two_pass_loudnorm(raw_path, mastered_path)

        if not success:
            logger.warning("Two-pass loudnorm failed; using raw file as fallback.")
            return raw_path

        # Embed ID3 metadata into the mastered file
        tagged_path = mastered_path + ".tagged.mp3"
        tag_cmd = [
            "ffmpeg", "-y",
            "-i", mastered_path,
            "-c:a", "copy",
            "-metadata", f"title={title}",
            "-metadata", f"artist={dj_name}",
            "-metadata", "album=GOODLIFE Radio 254 (Live Sets Archive)",
            tagged_path,
        ]
        result = subprocess.run(tag_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0 and os.path.exists(tagged_path):
            shutil.move(tagged_path, mastered_path)

        return mastered_path

    @retry(
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception_type(Exception),
    )
    def upload_to_r2(self, local_file_path: str, r2_key: str) -> str:
        """
        Uploads local MP3 file to Cloudflare R2 bucket with retry backoff.
        Returns the public HTTPS URL.
        """
        if not self.r2_account_id or not self.r2_access_key:
            logger.warning("Cloudflare R2 credentials not configured. Skipping remote upload.")
            return f"local://{local_file_path}"

        r2 = self._get_r2_client()
        logger.info(f"Uploading session file to Cloudflare R2: r2://{self.r2_bucket}/{r2_key}...")

        with open(local_file_path, "rb") as f:
            r2.upload_fileobj(
                f,
                self.r2_bucket,
                r2_key,
                ExtraArgs={"ContentType": "audio/mpeg"},
            )

        public_url = f"{self.r2_public_domain}/{r2_key}"
        logger.info(f"R2 upload confirmed: {public_url}")
        return public_url

    def insert_recording_record(
        self,
        title: str,
        dj_name: str,
        audio_url: str,
        r2_key: str,
        duration: int,
        file_size: int,
        bitrate: int = 320,
        genre: str = "Live DJ Set",
    ) -> Optional[int]:
        """
        Inserts recording metadata into Neon PostgreSQL table `radio_recordings`.
        """
        if not self.database_url:
            logger.warning("DATABASE_URL not set. Skipping database insert.")
            return None

        conn = None
        try:
            conn = psycopg2.connect(self.database_url)
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                query = """
                    INSERT INTO radio_recordings (
                        title, dj_name, audio_url, r2_key, duration, file_size, bitrate, genre, recorded_at, is_public
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, NOW(), true
                    )
                    RETURNING id;
                """
                cur.execute(
                    query,
                    (title, dj_name, audio_url, r2_key, duration, file_size, bitrate, genre),
                )
                record_id = cur.fetchone()["id"]
                conn.commit()
                logger.info(f"Neon DB row created: radio_recordings ID={record_id}")
                return record_id
        except Exception as e:
            logger.error(f"Neon DB insert failed: {e}")
            if conn:
                conn.rollback()
            raise e
        finally:
            if conn:
                conn.close()

    def process_live_session(self, raw_file_path: str, dj_name: str = "Resident DJ") -> Dict[str, Any]:
        """
        Orchestrates full session archival with a durable pending_archives queue.
        Failures are persisted and can be retried by the recovery cron.
        """
        if not os.path.exists(raw_file_path):
            raise FileNotFoundError(f"Session recording not found at: {raw_file_path}")

        # 1. Register the job in the recovery queue
        job_id = self._insert_pending_job(raw_file_path)
        logger.info(f"Registered archive job id={job_id} for {raw_file_path}")

        try:
            file_size = os.path.getsize(raw_file_path)
            timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")
            title = f"Live Festival Set ({timestamp_str})"

            duration = self.extract_audio_duration(raw_file_path)
            mastered_local_path = self.master_session_audio(raw_file_path, title, dj_name)

            r2_key = f"radio/recordings/{timestamp_str}_{os.path.basename(mastered_local_path)}"
            audio_url = self.upload_to_r2(mastered_local_path, r2_key)

            # Only insert DB row if we have a real URL (not a local:// fallback)
            record_id = None
            if not audio_url.startswith("local://"):
                record_id = self.insert_recording_record(
                    title=title,
                    dj_name=dj_name,
                    audio_url=audio_url,
                    r2_key=r2_key,
                    duration=duration,
                    file_size=file_size,
                    bitrate=320,
                    genre="Festival Live Set",
                )
            else:
                logger.warning(f"R2 upload returned local URL; skipping DB insert. Job {job_id} will be retried.")

            # 2. Update job status in recovery queue
            if record_id:
                if job_id:
                    self._update_pending_job(job_id, "complete", recording_id=record_id)
                # Move to persistent mastered storage
                permanent_dest = os.path.join(self.mastered_dir, os.path.basename(mastered_local_path))
                shutil.move(mastered_local_path, permanent_dest)
                if os.path.exists(raw_file_path) and raw_file_path != permanent_dest:
                    try:
                        os.remove(raw_file_path)
                    except Exception:
                        pass
                logger.info(f"Session successfully archived! Record ID: {record_id}, URL: {audio_url}")
            else:
                # Leave local files in place for retry
                if job_id:
                    self._update_pending_job(job_id, "failed", error="R2 upload returned local URL or DB insert skipped")

            return {
                "status": "archived" if record_id else "pending_retry",
                "record_id": record_id,
                "audio_url": audio_url,
                "r2_key": r2_key,
                "duration": duration,
                "file_size": file_size,
                "title": title,
            }

        except Exception as e:
            logger.error(f"Session archival failed for job {job_id}: {e}", exc_info=True)
            if job_id:
                self._update_pending_job(job_id, "failed", error=str(e)[:500])
            raise e

    def retry_failed_archives(self) -> None:
        """Scans pending_archives for failed/pending jobs and retries them."""
        if not self.database_url:
            return
        conn = None
        jobs = []
        try:
            conn = psycopg2.connect(self.database_url)
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT id, local_path FROM pending_archives
                    WHERE status IN ('pending', 'failed') AND retry_count < 10
                    ORDER BY created_at ASC
                    LIMIT 5;
                    """
                )
                jobs = cur.fetchall()
        except Exception as e:
            logger.error(f"Failed to query pending_archives: {e}")
            return
        finally:
            if conn:
                conn.close()

        for job in jobs:
            logger.info(f"Retrying archive job id={job['id']} for {job['local_path']}")
            try:
                self.process_live_session(job["local_path"])
            except Exception as e:
                logger.error(f"Retry failed for job {job['id']}: {e}")
