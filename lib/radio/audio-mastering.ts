import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function getEnv(key: string): string {
  if (process.env[key]) return process.env[key]!;
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"#\\r\\n]+?)"?\\s*$`));
      if (m) return m[1].trim();
    }
  }
  return "";
}

/**
 * Synthesizes voice audio via Fish Audio REST API.
 */
export async function synthesizeVoiceAudio(
  text: string,
  referenceId: string
): Promise<Buffer | null> {
  const fishKey = getEnv("FISH_AUDIO_KEY");
  if (!fishKey) {
    console.warn("[audio-mastering] FISH_AUDIO_KEY not set in environment");
    return null;
  }

  try {
    const res = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fishKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        reference_id: referenceId,
        format: "mp3",
        mp3_bitrate: 192,
        normalize: true,
      }),
      signal: AbortSignal.timeout(10000), // 10s timeout per spec 6.10
    });

    if (!res.ok) {
      console.warn(`[audio-mastering] Fish Audio failed with HTTP ${res.status}: ${await res.text()}`);
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err: any) {
    console.error("[audio-mastering] Fish Audio synthesis error:", err.message);
    return null;
  }
}

/**
 * Masters raw audio buffer to radio broadcast standards:
 * - Loudnorm: -14 LUFS integrated, -1.0 dBFS true peak, 7 LRA
 * - Silenceremove: Trims head and tail silence
 * - Resamples to 44.1 kHz, 192 kbps MP3
 */
export async function masterDropAudio(rawBuffer: Buffer): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const id = `drop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(tmpDir, `${id}_in.mp3`);
  const outputPath = path.join(tmpDir, `${id}_out.mp3`);

  try {
    fs.writeFileSync(inputPath, rawBuffer);

    // Run ffmpeg with Loudnorm and silence removal
    const cmd = `ffmpeg -y -v error -i "${inputPath}" -af "loudnorm=I=-14:TP=-1.0:LRA=7,silenceremove=start_periods=1:start_threshold=-50dB:stop_periods=1:stop_threshold=-50dB" -ar 44100 -b:a 192k "${outputPath}"`;
    await execAsync(cmd, { timeout: 8000 });

    if (fs.existsSync(outputPath)) {
      const mastered = fs.readFileSync(outputPath);
      return mastered;
    }
  } catch (err: any) {
    console.warn("[audio-mastering] ffmpeg mastering failed or timed out, using raw audio:", err.message);
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {}
  }

  return rawBuffer;
}
