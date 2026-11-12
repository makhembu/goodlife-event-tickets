import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface ProbedAudioMetadata {
  durationSec: number;
  durationFormatted: string;
  bitrateKbps: number;
}

/**
 * Format seconds into mm:ss or hh:mm:ss
 */
export function formatAudioDuration(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Probes the exact duration and bitrate of an audio file via ffprobe or streaming header inspection.
 * Never guesses duration from a hardcoded 160kbps formula.
 */
export async function probeAudioMetadata(audioUrl: string, fileSize?: number): Promise<ProbedAudioMetadata | null> {
  // Method 1: ffprobe (handles MP3 CBR/VBR, M4A, WAV, AAC with container accuracy)
  try {
    const cmd = `ffprobe -v error -show_entries format=duration,bit_rate -of json "${audioUrl}"`;
    const { stdout } = await execAsync(cmd, { timeout: 15000 });
    const parsed = JSON.parse(stdout);

    const dur = parseFloat(parsed?.format?.duration || "0");
    const bit = parseInt(parsed?.format?.bit_rate || "0", 10);

    if (dur && isFinite(dur) && dur > 0) {
      const durationSec = Math.round(dur);
      const bitrateKbps = bit > 0 ? Math.round(bit / 1000) : 192;
      return {
        durationSec,
        durationFormatted: formatAudioDuration(durationSec),
        bitrateKbps,
      };
    }
  } catch (err: any) {
    console.warn(`[audio-prober] ffprobe probe failed for ${audioUrl}:`, err?.message || err);
  }

  // Method 2: Range-request MPEG Header inspection fallback
  try {
    const res = await fetch(audioUrl, {
      headers: { Range: "bytes=0-131072" },
    });
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      let offset = 0;

      // Skip ID3v2 tag if present
      if (buffer.length > 10 && buffer.subarray(0, 3).toString() === "ID3") {
        const id3Size =
          ((buffer[6] & 0x7f) << 21) |
          ((buffer[7] & 0x7f) << 14) |
          ((buffer[8] & 0x7f) << 7) |
          (buffer[9] & 0x7f);
        offset = 10 + id3Size;
      }

      // Search for sync word 0xFFE0 (first 11 bits set)
      while (offset < buffer.length - 4) {
        if (buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0) {
          const versionBits = (buffer[offset + 1] >> 3) & 0x03;
          const layerBits = (buffer[offset + 1] >> 1) & 0x03;
          const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;

          // MPEG-1 Layer III bitrate table (kbps)
          if (versionBits === 3 && layerBits === 1 && bitrateIndex > 0 && bitrateIndex < 15) {
            const mpeg1Layer3Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
            const detectedBitrate = mpeg1Layer3Bitrates[bitrateIndex];

            // If we know file size, calculate duration from true bitrate
            const effectiveSize = fileSize || parseInt(res.headers.get("content-range")?.split("/")?.[1] || "0", 10);
            if (effectiveSize > 0 && detectedBitrate > 0) {
              const audioBytes = Math.max(0, effectiveSize - offset);
              const durationSec = Math.round((audioBytes * 8) / (detectedBitrate * 1000));
              return {
                durationSec,
                durationFormatted: formatAudioDuration(durationSec),
                bitrateKbps: detectedBitrate,
              };
            }
          }
        }
        offset++;
      }
    }
  } catch (err: any) {
    console.warn(`[audio-prober] Range header probe fallback failed for ${audioUrl}:`, err?.message || err);
  }

  return null;
}
