import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function getEnv(key: string): string {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"#\\r\\n]+?)"?\\s*$`));
      if (m && m[1].trim()) return m[1].trim();
    }
  }
  return process.env[key] || "";
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

  // Strict Gemini 3.8 Flash TTS model cascade
  const ttsModels = [
    "gemini-3.8-flash-tts",
    "gemini-3.8-flash-lite-tts",
    "gemini-3.1-flash-tts-preview",
    "gemini-2.5-flash-preview-tts",
  ];

  for (const model of ttsModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
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
        console.warn(`[audio-mastering] Gemini TTS (${model}) failed with HTTP ${res.status}: ${errText.slice(0, 150)}`);
        continue;
      }

      const data: any = await res.json();
      const base64Data = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Data) {
        console.warn(`[audio-mastering] Gemini TTS (${model}) returned no audio data`);
        continue;
      }

      console.log(`[audio-mastering] Synthesized Gemini 3.8 Flash TTS audio with ${model} (${voiceName})`);
      return Buffer.from(base64Data, "base64");
    } catch (err: any) {
      console.warn(`[audio-mastering] Gemini TTS (${model}) error: ${err.message}`);
    }
  }

  console.error("[audio-mastering] All Gemini Flash TTS models exhausted or failed");
  return null;
}

/**
 * Converts raw 16-bit PCM (24000Hz, mono) to valid RFC-compliant WAV audio buffer.
 */
export function pcmToWav(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const fileSize = dataSize + 36;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Masters raw audio buffer to radio broadcast standards:
 * - Loudnorm: -14 LUFS integrated, -1.0 dBFS true peak, 7 LRA
 * - Resamples to 44.1 kHz, 192 kbps MP3 when ffmpeg is available
 * - Falls back to valid RFC-compliant 24kHz WAV when ffmpeg is absent (e.g. Serverless)
 */
export async function masterDropAudio(rawBuffer: Buffer): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const id = `drop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Detect input audio format:
  // 1. WAV magic: "RIFF"
  // 2. MP3 magic: 0xFFFB, 0xFFF3, 0xFFF2, "ID3"
  // 3. Otherwise: Raw PCM 16-bit LE, 24000 Hz, 1 channel (Gemini Flash TTS default audio/l16)
  const isWav = rawBuffer.length > 4 && rawBuffer.subarray(0, 4).toString() === "RIFF";
  const isId3 = rawBuffer.length > 3 && rawBuffer.subarray(0, 3).toString() === "ID3";
  const isMp3Sync = rawBuffer.length > 2 && rawBuffer[0] === 0xff && (rawBuffer[1] & 0xe0) === 0xe0;
  const isMp3 = isId3 || isMp3Sync;

  // If input is raw PCM, convert to valid WAV buffer so browser can natively decode it immediately
  const validBuffer = (isWav || isMp3) ? rawBuffer : pcmToWav(rawBuffer);

  const inExt = isWav ? "wav" : isMp3 ? "mp3" : "pcm";
  const inputPath = path.join(tmpDir, `${id}_in.${inExt}`);
  const outputPath = path.join(tmpDir, `${id}_out.mp3`);

  try {
    fs.writeFileSync(inputPath, rawBuffer);

    // If raw PCM from Gemini TTS, specify decoding format parameters
    const inputFlags = inExt === "pcm" ? "-f s16le -ar 24000 -ac 1" : "";
    const cmd = `ffmpeg -y -v error ${inputFlags} -i "${inputPath}" -af "loudnorm=I=-14:TP=-1.0:LRA=7" -ar 44100 -b:a 192k "${outputPath}"`;
    await execAsync(cmd, { timeout: 8000 });

    if (fs.existsSync(outputPath)) {
      const mastered = fs.readFileSync(outputPath);
      return mastered;
    }
  } catch (err: any) {
    console.warn("[audio-mastering] ffmpeg mastering fallback, using valid WAV buffer:", err.message);
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {}
  }

  return validBuffer;
}
