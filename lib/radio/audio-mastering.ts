import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { encode } from "@msgpack/msgpack";
import { bridgeMasterAudioFfmpeg } from "./bridge-client";

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

  // 10 Station Personas + Aliases
  "dj-fusion": "Puck",
  "fusion": "Puck",
  "dj-sudi": "Fenrir",
  "sudi": "Fenrir",
  "dj-sney": "Puck",
  "sney": "Puck",
  "mc-cheche": "Fenrir",
  "cheche": "Fenrir",
  "dj-shax": "Puck",
  "shax": "Puck",
  "amina": "Aoede",
  "bwana-mkubwa": "Charon",
  "bwana": "Charon",
  "malkia-kenya": "Aoede",
  "malkia": "Aoede",
  "wigman": "Charon",
  "the-chief": "Charon",
  "zari": "Kore",
  "anz-ben": "Fenrir",

  // Gemini Broadcast Voices
  "gemini-aoede": "Aoede",
  "gemini-puck": "Puck",
  "gemini-charon": "Charon",
  "gemini-fenrir": "Fenrir",
  "gemini-kore": "Kore",
  "gemini": "Aoede",
};

/**
 * Normalizes Kenyan radio idioms, station branding, and numbers so TTS engines
 * produce natural spoken cadence without corrupting natural words.
 * The zero-shot acoustic model derives authentic Kenyan accent and pronunciation
 * directly from the voice reference itself.
 */
export function normalizeRadioScriptForTts(text: string): string {
  if (!text) return "";
  return text
    // Replace telephone/country code 254 with natural spoken cadence
    .replace(/\b254\b/g, "two five four")
    // Fix elongated street shouts
    .replace(/\b[Yy]ooo+!?\b/g, "Yo! Yo!")
    // Radio station callsign spacing
    .replace(/\bGOODLIFE\s*254\b/gi, "GOODLIFE two five four")
    .replace(/\bGL\s*254\b/gi, "GOODLIFE two five four")
    // Currency pronunciation: expand numbers before "bob" naturally
    .replace(/\b200\s*bob\b/gi, "two hundred bob")
    .replace(/\b500\s*bob\b/gi, "five hundred bob")
    .replace(/\b1000\s*bob\b/gi, "one thousand bob")
    .replace(/\b1k\s*bob\b/gi, "one thousand bob")
    // Common abbreviations
    .replace(/\bNBO\b/gi, "Nairobi")
    .replace(/\bKE\b/gi, "Kenya")
    .replace(/\bDJ\b/g, "D J");
}

/**
 * Strips formatting, markdown, and unwanted punctuation.
 * If preserveEmotions is true, bracketed and parenthesized emotion tags like
 * [hype], [excited], (laughs) are preserved for expressive TTS engines like Fish Audio.
 */
export function sanitizeScriptForTts(rawText: string, preserveEmotions = false): string {
  let cleaned = rawText;

  if (!preserveEmotions) {
    // Remove bracketed stage directions like [excited], [whisper], [banter]
    cleaned = cleaned.replace(/\[[^\]]*\]/g, " ");
    // Remove parenthesized directions like (energetic DJ tone)
    cleaned = cleaned.replace(/\([^)]*(?:tone|voice|energy|dj|host|shout|style|drop)[^)]*\)/gi, " ");
  } else {
    // S2.1 uses square brackets [...] for emotion/prosody tags.
    // Convert common parenthesized emotions to square brackets
    cleaned = cleaned.replace(/\((laughs?|laughing|chuckle|gasp|sigh|whisper|whispering|excited|hype|shout|shouting|calm|happy|energetic)\)/gi, "[$1]");
  }

  cleaned = cleaned
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
 * Synthesizes expressive voice audio via Fish Audio API (Tier 1).
 * Uses model: s2.1-pro-free.
 * Implements Instant Inline Zero-Shot Voice Cloning by sending raw reference audio bytes
 * via application/msgpack, perfectly capturing authentic Kenyan accent and DJ tone.
 */
export async function synthesizeFishAudioTts(
  script: string,
  voiceOrPersona = "dj-fusion",
  explicitVoiceId?: string
): Promise<Buffer | null> {
  const apiKey = getEnv("FISH_AUDIO_KEY") || process.env.FISH_AUDIO_KEY;
  if (!apiKey) return null;

  const normalized = normalizeRadioScriptForTts(sanitizeScriptForTts(script, true));
  if (!normalized || normalized.length < 3) return null;

  const lookup = voiceOrPersona.toLowerCase().trim();

  // Locate authentic vocal reference for inline zero-shot cloning
  let referencePath: string | null = null;
  if (lookup === "dj-fusion" || lookup === "fusion") {
    const fusionSample = path.resolve(process.cwd(), "public", "voice-samples", "dj_fusion_reference.mp3");
    if (fs.existsSync(fusionSample)) {
      referencePath = fusionSample;
    }
  } else if (lookup === "amina") {
    const aminaSample = path.resolve(process.cwd(), "public", "voice-samples", "amina_reference.mp3");
    if (fs.existsSync(aminaSample)) {
      referencePath = aminaSample;
    }
  } else if (lookup === "zari") {
    const zariSample = path.resolve(process.cwd(), "public", "voice-samples", "zari_reference.mp3");
    if (fs.existsSync(zariSample)) {
      referencePath = zariSample;
    }
  } else if (lookup === "gemini-aoede" || lookup === "aoede") {
    const s = path.resolve(process.cwd(), "public", "voice-samples", "gemini_aoede_reference.mp3");
    if (fs.existsSync(s)) referencePath = s;
  } else if (lookup === "gemini-puck" || lookup === "puck") {
    const s = path.resolve(process.cwd(), "public", "voice-samples", "gemini_puck_reference.mp3");
    if (fs.existsSync(s)) referencePath = s;
  } else if (lookup === "gemini-charon" || lookup === "charon") {
    const s = path.resolve(process.cwd(), "public", "voice-samples", "gemini_charon_reference.mp3");
    if (fs.existsSync(s)) referencePath = s;
  } else if (lookup === "gemini-fenrir" || lookup === "fenrir") {
    const s = path.resolve(process.cwd(), "public", "voice-samples", "gemini_fenrir_reference.mp3");
    if (fs.existsSync(s)) referencePath = s;
  } else if (lookup === "gemini-kore" || lookup === "kore") {
    const s = path.resolve(process.cwd(), "public", "voice-samples", "gemini_kore_reference.mp3");
    if (fs.existsSync(s)) referencePath = s;
  } else {
    // Check if a dedicated reference audio file exists for this persona
    const personaSample = path.resolve(process.cwd(), "public", "voice-samples", `${lookup}_reference.mp3`);
    const personaSampleUnderscore = path.resolve(process.cwd(), "public", "voice-samples", `${lookup.replace(/-/g, "_")}_reference.mp3`);
    if (fs.existsSync(personaSample)) {
      referencePath = personaSample;
    } else if (fs.existsSync(personaSampleUnderscore)) {
      referencePath = personaSampleUnderscore;
    }
  }

  try {
    let headers: Record<string, string> = {
      "Authorization": `Bearer ${apiKey}`,
      "model": "s2.1-pro-free",
    };
    let bodyData: any;

    if (referencePath && fs.existsSync(referencePath)) {
      // Inline Zero-Shot Cloning with exact voice reference bytes and matching transcript via msgpack
      const refAudioBytes = fs.readFileSync(referencePath);
      let referenceText = "";
      const textFile = referencePath.replace(/\.mp3$/i, ".txt");
      if (fs.existsSync(textFile)) {
        referenceText = fs.readFileSync(textFile, "utf8").trim();
      }

      headers["Content-Type"] = "application/msgpack";
      const payload = {
        text: normalized,
        references: [
          {
            audio: refAudioBytes,
            text: referenceText,
          },
        ],
        temperature: 0.6,
        top_p: 0.7,
        prosody: {
          speed: 0.93,
          volume: 0,
        },
        format: "mp3",
        latency: "balanced",
      };
      bodyData = encode(payload);
      console.log(`[audio-mastering] Sending inline zero-shot voice clone with reference (${refAudioBytes.length} bytes, voice: ${lookup}, transcriptLen: ${referenceText.length})`);
    } else {
      // Determine reference_id: explicit voice ID, persona-specific env, or default persistent model
      let voiceId = explicitVoiceId && /^[a-f0-9]{32}$/i.test(explicitVoiceId) ? explicitVoiceId : "";
      if (!voiceId) {
        if (lookup.includes("sudi")) {
          voiceId = getEnv("FISH_SUDI_VOICE_ID") || "ed2dfca6b6f440869006f9d3e721f3a3";
        } else if (lookup.includes("sney")) {
          voiceId = getEnv("FISH_SNEY_VOICE_ID") || "3b68e8a9193b45b7ac873c693c49b7ad";
        } else if (lookup.includes("shax")) {
          voiceId = getEnv("FISH_SHAX_VOICE_ID") || "4dc4683877cd4538b0ffe233885b5f4e";
        } else if (lookup.includes("bwana")) {
          voiceId = getEnv("FISH_BWANA_VOICE_ID") || "51b9c141b0e642fc9c5f30a5f89c2d31";
        } else if (lookup.includes("malkia")) {
          voiceId = getEnv("FISH_MALKIA_VOICE_ID") || "f53027b3260f4c7080c761effa6e6891";
        } else if (lookup.includes("wigman")) {
          voiceId = getEnv("FISH_WIGMAN_VOICE_ID") || "d4483baa705e4ff5bfe1831b6960359f";
        } else if (lookup.includes("cheche")) {
          voiceId = getEnv("FISH_CHECHE_VOICE_ID") || "6801890ec345469d8818129e5bdd50dd";
        } else {
          voiceId = getEnv("FISH_VOICE_ID") || "ed2dfca6b6f440869006f9d3e721f3a3";
        }
      }

      headers["Content-Type"] = "application/json";
      bodyData = JSON.stringify({
        text: normalized,
        reference_id: voiceId,
        temperature: 0.6,
        top_p: 0.7,
        prosody: {
          speed: 0.93,
          volume: 0,
        },
        format: "mp3",
        mp3_bitrate: 128,
        latency: "normal",
      });
    }

    const res = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers,
      body: bodyData,
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[audio-mastering] Fish Audio (${res.status}): ${errText.slice(0, 120)}`);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > 500) {
      console.log(`[audio-mastering] Synthesized Fish Audio s2.1-pro-free (${buffer.length} bytes, voice: ${lookup})`);
      return buffer;
    }
  } catch (err: any) {
    console.warn(`[audio-mastering] Fish Audio error: ${err.message}`);
  }

  return null;
}

/**
 * Synthesizes voice audio with multi-tier failover:
 * Tier 1: Fish Audio s2.1-pro-free (expressive with emotions & phonetic normalization)
 * Tier 2: Gemini 3.8 Flash TTS cascade
 */
export async function synthesizeVoiceAudio(
  text: string,
  voiceOrPersonaId = "Aoede",
  explicitVoiceId?: string
): Promise<Buffer | null> {
  // Tier 1: Try Fish Audio s2.1-pro-free first
  try {
    const fishBuffer = await synthesizeFishAudioTts(text, voiceOrPersonaId, explicitVoiceId);
    if (fishBuffer && fishBuffer.length > 500) {
      return fishBuffer;
    }
  } catch (err: any) {
    console.warn("[audio-mastering] Fish Audio Tier 1 bypassed:", err?.message);
  }

  // Tier 2: Fallback to Gemini Flash TTS
  const geminiKey = getEnv("GEMINI_API_KEY") || process.env.GEMINI_API_KEY || "";
  if (!geminiKey) {
    console.warn("[audio-mastering] GEMINI_API_KEY not set in environment");
    return null;
  }

  const cleanText = normalizeRadioScriptForTts(sanitizeScriptForTts(text, false));
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
 * - Resamples to 44.1 kHz, 192 kbps MP3 via local ffmpeg OR remote .29 home server FFmpeg
 * - Falls back to valid RFC-compliant 24kHz WAV when ffmpeg is unavailable
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

  // Fallback buffer if both local & remote FFmpeg fail
  const validBuffer = (isWav || isMp3) ? rawBuffer : pcmToWav(rawBuffer);

  const inExt = isWav ? "wav" : isMp3 ? "mp3" : "pcm";
  const inputPath = path.join(tmpDir, `${id}_in.${inExt}`);
  const outputPath = path.join(tmpDir, `${id}_out.mp3`);

  // Tier 1: Try local ffmpeg if installed in environment
  try {
    fs.writeFileSync(inputPath, rawBuffer);
    const inputFlags = inExt === "pcm" ? "-f s16le -ar 24000 -ac 1" : "";
    const cmd = `ffmpeg -y -v error ${inputFlags} -i "${inputPath}" -af "loudnorm=I=-14:TP=-1.0:LRA=7" -ar 44100 -b:a 192k "${outputPath}"`;
    await execAsync(cmd, { timeout: 8000 });

    if (fs.existsSync(outputPath)) {
      const mastered = fs.readFileSync(outputPath);
      console.log(`[audio-mastering] Mastered drop via local FFmpeg (${mastered.length} bytes)`);
      return mastered;
    }
  } catch {
    // Local ffmpeg not available (e.g. Vercel Serverless), cascade to .29 Home Server
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {}
  }

  // Tier 2: Try .29 Ubuntu Home Server FFmpeg over LAN / Cloudflare Tunnel
  try {
    const remoteMastered = await bridgeMasterAudioFfmpeg(rawBuffer, {
      inputFormat: inExt as any,
      sampleRate: 24000,
      channels: 1,
      targetLufs: -14.0,
      timeoutMs: 9000,
    });
    if (remoteMastered && remoteMastered.length > 500) {
      console.log(`[audio-mastering] Mastered drop via .29 server FFmpeg (${remoteMastered.length} bytes MP3)`);
      return remoteMastered;
    }
  } catch (bridgeErr: any) {
    console.warn("[audio-mastering] .29 server FFmpeg error:", bridgeErr.message);
  }

  // Tier 3: Pure JS RFC-compliant WAV fallback
  console.warn("[audio-mastering] FFmpeg cascade exhausted, using RFC WAV fallback");
  return validBuffer;
}
