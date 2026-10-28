#!/usr/bin/env python3
"""
GOODLIFE Radio 254 - Cloudflare R2 HLS Synchronizer Worker
Watches /var/azuracast/hls/goodlife/ for new .ts video/audio segments and live.m3u8,
and immediately uploads them to Cloudflare R2 with minimal latency and proper cache headers.
"""

import os
import sys
import time
import logging
from pathlib import Path
import boto3
from botocore.config import Config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [r2-hls-sync] %(message)s"
)
logger = logging.getLogger("r2_hls_sync")

# Environment configuration
HLS_DIR = os.getenv("HLS_LOCAL_DIR", "/var/azuracast/hls/goodlife")
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.getenv("R2_BUCKET_NAME", "goodlife")
R2_PREFIX = os.getenv("R2_HLS_PREFIX", "hls").strip("/")

def get_s3_client():
    endpoint = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4", max_pool_connections=25),
        region_name="auto"
    )

def upload_file(s3_client, file_path: Path):
    rel_name = file_path.name
    key = f"{R2_PREFIX}/{rel_name}"
    
    # Proper Content-Type & Cache-Control
    if rel_name.endswith(".m3u8"):
        content_type = "application/vnd.apple.mpegurl"
        cache_control = "no-cache, no-store, must-revalidate, max-age=0"
    elif rel_name.endswith(".ts"):
        content_type = "video/MP2T"
        cache_control = "public, max-age=86400, immutable"
    else:
        content_type = "application/octet-stream"
        cache_control = "public, max-age=3600"

    try:
        with open(file_path, "rb") as f:
            s3_client.put_object(
                Bucket=R2_BUCKET,
                Key=key,
                Body=f,
                ContentType=content_type,
                CacheControl=cache_control
            )
        logger.debug(f"Uploaded {key}")
    except Exception as e:
        logger.error(f"Failed to upload {key}: {e}")

def run_loop():
    logger.info(f"Starting R2 HLS Sync Worker watching {HLS_DIR} -> R2 bucket '{R2_BUCKET}/{R2_PREFIX}'...")
    hls_path = Path(HLS_DIR)
    
    if not (R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY):
        logger.warning("R2 credentials not fully set. Worker will run in dry-run monitoring mode.")
        s3 = None
    else:
        s3 = get_s3_client()

    seen_mtimes = {}

    while True:
        try:
            if hls_path.exists():
                for item in hls_path.glob("*"):
                    if item.is_file() and (item.suffix in [".ts", ".m3u8"]):
                        mtime = item.stat().st_mtime
                        if seen_mtimes.get(item.name) != mtime:
                            seen_mtimes[item.name] = mtime
                            if s3:
                                upload_file(s3, item)
                            else:
                                logger.info(f"[DRY RUN] Would upload {item.name}")

                # Clean up seen_mtimes cache for deleted files
                current_files = {p.name for p in hls_path.glob("*")}
                for fname in list(seen_mtimes.keys()):
                    if fname not in current_files:
                        del seen_mtimes[fname]

            time.sleep(0.5)
        except KeyboardInterrupt:
            logger.info("Stopping R2 sync worker.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in sync loop: {e}")
            time.sleep(2.0)

if __name__ == "__main__":
    run_loop()
