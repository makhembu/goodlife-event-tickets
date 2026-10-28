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

// Map persona or voice ID to Gemini's 5 pre-built broadcast voices
export type GeminiVoiceName = "Puck" | "Aoede" | "Charon" | "Fenrir" | "Kore";

const VOICE_MAP: Record<string, GeminiVoiceName> = {
  // Direct voice names
  puck: "Puck",
  aoede: "Aoede",
  charon: "Charon",
  fenrir: "Fenrir",
  kore: "Kore",

  // Persona IDs
  "dj-shax": "Puck",
  "shax": "Puck",
  "mc-cheche": "Fenrir",
  "cheche": "Fenrir",
  "amina": "Aoede",
  "wigman": "Charon",
  "the-chief": "Charon",
  "zari": "Kore",
};

/**
 * Strips formatting, bracketed emotion tags, stage directions, and extraneous punctuation
 * so the TTS engine speaks ONLY pure spoken script.
 */
export function sanitizeScriptForTts(rawText: string): string {
  let cleaned = rawText
    // Remove bracketed stage directions like [excited], [whisper], [banter]
    .replace(/\[[^\]]*\]/g, " ")
    // Remove parenthesized directions like (energetic DJ tone)
    .replace(/\([^)]*(?:tone|voice|energy|dj|host|shout|style|drop)[^)]*\)/gi, " ")
    // Remove markdown symbols and asterisks
    .replace(/[*_#`~]/g, "")
    // Remove emojis
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    // Collapse excess whitespace
    .replace(/\s+/g, " ")
    .trim();

  // If text starts with quotes, strip surrounding quotes
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned;
}

/**
 * Synthesizes voice audio via Gemini Flash TTS (gemini-3.8-flash-lite-tts).
 * Automatically resolves the voice among the 5 distinct station personas:
 * - Puck: DJ Shax (High-energy festival host)
 * - Aoede: Amina (Melodic sunset flow)
 * - Charon: Wigman / The Chief (Deep baritone vault)
 * - Fenrir: MC Cheche (Punchy urban host)
 * - Kore: Zari (Chill afternoon selector)
 */
export async function synthesizeVoiceAudio(
  text: string,
  voiceOrPersonaId = "Aoede"
): Promise<Buffer | null> {
  const geminiKey = getEnv("GEMINI_API_KEY") || process.env.GEMINI_API_KEY || "";
  if (!geminiKey) {
    console.warn("[audio-mastering] GEMINI_API_KEY not set in environment");
    return null;
  }

  const cleanText = sanitizeScriptForTts(text);
  if (!cleanText || cleanText.length < 3) {
    console.warn("[audio-mastering] Empty script text after sanitization");
    return null;
  }

  // Resolve matching Gemini prebuilt voice
  const lookup = voiceOrPersonaId.toLowerCase().trim();
  const voiceName: GeminiVoiceName = VOICE_MAP[lookup] || "Aoede";

  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": geminiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: cleanText }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(10000), // 10s strict timeout
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[audio-mastering] Gemini TTS failed with HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data: any = await res.json();
    const base64Data = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Data) {
      console.warn("[audio-mastering] Gemini TTS returned no audio data in candidate payload");
      return null;
    }

    return Buffer.from(base64Data, "base64");
  } catch (err: any) {
    console.error("[audio-mastering] Gemini TTS synthesis error:", err.message);
    return null;
  }
}

/**
 * Masters raw audio buffer to radio broadcast standards:
 * - Loudnorm: -14 LUFS integrated, -1.0 dBFS true peak, 7 LRA
 * - Resamples to 44.1 kHz, 192 kbps MP3
 */
export async function masterDropAudio(rawBuffer: Buffer): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const id = `drop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Detect input audio format (WAV magic RIFF vs MP3)
  const isWav = rawBuffer.length > 4 && rawBuffer.subarray(0, 4).toString() === "RIFF";
  const inExt = isWav ? "wav" : "mp3";
  const inputPath = path.join(tmpDir, `${id}_in.${inExt}`);
  const outputPath = path.join(tmpDir, `${id}_out.mp3`);

  try {
    fs.writeFileSync(inputPath, rawBuffer);

    // Run ffmpeg with EBU R128 Loudnorm (-14 LUFS, -1.0 dBFS true peak)
    const cmd = `ffmpeg -y -v error -i "${inputPath}" -af "loudnorm=I=-14:TP=-1.0:LRA=7" -ar 44100 -b:a 192k "${outputPath}"`;
    await execAsync(cmd, { timeout: 8000 });

    if (fs.existsSync(outputPath)) {
      const mastered = fs.readFileSync(outputPath);
      return mastered;
    }
  } catch (err: any) {
    console.warn("[audio-mastering] ffmpeg mastering fallback, using raw audio:", err.message);
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {}
  }

  return rawBuffer;
}
