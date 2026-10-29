import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  DropVerifiedFacts,
  DropValidationResult,
  GeneratedDropRecord,
  RadioDropType,
  RadioDaypart,
} from "./drop-types";
import { getPromotableEvents, RadioPromotableEvent } from "./events";
import { selectGenericReviewedDrop, verifyDropBeforePlayout } from "./drop-gate";
import { synthesizeVoiceAudio, masterDropAudio } from "./audio-mastering";
import { uploadDropBufferToR2, deleteRadioAudioKeys } from "./r2-signer";
import { neonQuery } from "../supabase-db";

// Environment parser
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

// Config caches
let stationConfigCache: any = null;
function getStationConfig() {
  if (stationConfigCache) return stationConfigCache;
  try {
    const p = path.resolve(process.cwd(), "config/station.json");
    if (fs.existsSync(p)) stationConfigCache = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return (
    stationConfigCache || {
      station_name: "GOODLIFE Radio 254",
      site_base_url: "https://goodlife.smwhr.space",
      default_spoken_ticket_url: "tickets on the Goodlife website",
    }
  );
}

let personasConfigCache: any = null;
function getPersonasConfig() {
  if (personasConfigCache) return personasConfigCache;
  try {
    const p = path.resolve(process.cwd(), "config/radio-personas.json");
    if (fs.existsSync(p)) personasConfigCache = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return personasConfigCache;
}

let shengPhrasesCache: string[] = [];
function getShengPhrases(): string[] {
  if (shengPhrasesCache.length > 0) return shengPhrasesCache;
  try {
    const p = path.resolve(process.cwd(), "config/sheng-phrases.json");
    if (fs.existsSync(p)) shengPhrasesCache = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return shengPhrasesCache;
}

// Recent scripts cache to prevent repetition (last 50 drops)
export const RECENT_SCRIPTS_CAPACITY = 50;
const recentScriptsCache: string[] = [];
let isRecentScriptsSeeded = false;

/**
 * Seeds recent scripts cache from Neon PostgreSQL database on cold start.
 */
export async function seedRecentScriptsCache(): Promise<void> {
  if (isRecentScriptsSeeded) return;
  try {
    if (typeof neonQuery === "function") {
      const { rows } = await neonQuery(
        "SELECT script FROM radio_drops WHERE script IS NOT NULL ORDER BY created_at DESC LIMIT 50"
      );
      if (rows && Array.isArray(rows)) {
        for (const r of rows.reverse()) {
          if (r.script && !recentScriptsCache.includes(r.script)) {
            recentScriptsCache.push(r.script);
          }
        }
      }
    }
  } catch (err: any) {
    // Non-fatal, database might be cold or table initializing
  } finally {
    isRecentScriptsSeeded = true;
  }
}

/**
 * Checks if a candidate script is too close in syntax, structure, or vocabulary to recent drops.
 * Evaluates:
 * 1. 4-gram repetition: Rejects if any 4-word consecutive sequence matches a recent drop.
 * 2. Jaccard token similarity: Rejects if significant word overlap exceeds 40%.
 */
export function isScriptTooClose(
  candidate: string,
  recentScripts: string[]
): { tooClose: boolean; reason?: string } {
  if (!candidate || !recentScripts || recentScripts.length === 0) {
    return { tooClose: false };
  }

  const cleanCand = candidate
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const candWords = cleanCand.split(" ").filter(Boolean);
  if (candWords.length < 3) return { tooClose: false };

  // 1. 4-gram repetition check
  if (candWords.length >= 4) {
    for (let i = 0; i <= candWords.length - 4; i++) {
      const shingle = candWords.slice(i, i + 4).join(" ");
      // Allow ubiquitous brand identifier
      if (shingle.includes("goodlife radio 254")) continue;

      for (const prev of recentScripts) {
        const cleanPrev = prev
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (cleanPrev.includes(shingle)) {
          return { tooClose: true, reason: `Repeats 4-word sequence: "${shingle}"` };
        }
      }
    }
  }

  // 2. Jaccard similarity on significant tokens (>3 characters)
  const candTokens = new Set(candWords.filter((w) => w.length > 3));
  if (candTokens.size >= 4) {
    for (const prev of recentScripts) {
      const prevWords = prev
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .filter((w) => w.length > 3);
      const prevTokens = new Set(prevWords);
      if (prevTokens.size < 4) continue;

      let intersection = 0;
      for (const token of candTokens) {
        if (prevTokens.has(token)) intersection++;
      }
      const union = new Set([...candTokens, ...prevTokens]).size;
      const jaccard = union > 0 ? intersection / union : 0;
      if (jaccard > 0.40) {
        return {
          tooClose: true,
          reason: `High vocabulary overlap (${Math.round(jaccard * 100)}%) with recent drop`,
        };
      }
    }
  }

  return { tooClose: false };
}

export type DropArchetype =
  | "track_stager"
  | "station_callout"
  | "event_spotlight"
  | "host_banter"
  | "ticket_cta";

export const DROP_ARCHETYPES: DropArchetype[] = [
  "track_stager",
  "station_callout",
  "event_spotlight",
  "host_banter",
  "ticket_cta",
];

/**
 * Drops retention cleanup: Deletes drops older than 24 hours (1 day) from:
 * 1. Neon Postgres `radio_drops` table
 * 2. Cloudflare R2 bucket audio files
 * 3. Local disk dynamic drop cache (public/drops/generated/)
 */
export async function cleanupExpiredRadioDrops(
  maxAgeHours = 24
): Promise<{ deletedDbRows: number; deletedFiles: number }> {
  let deletedDbRows = 0;
  let deletedFiles = 0;

  // 1. Database Cleanup
  try {
    if (typeof neonQuery === "function") {
      const { rows } = await neonQuery(
        `DELETE FROM radio_drops 
         WHERE created_at < NOW() - ($1 || ' hours')::interval 
         RETURNING id, audio_url`,
        [maxAgeHours]
      );
      if (rows && rows.length > 0) {
        deletedDbRows = rows.length;
        const r2Urls = rows.map((r: any) => r.audio_url).filter((url: string) => url && url.startsWith("http"));
        if (r2Urls.length > 0) {
          try {
            await deleteRadioAudioKeys(r2Urls);
          } catch (r2Err: any) {
            console.warn("[drop-engine] R2 drop cleanup error:", r2Err.message);
          }
        }
      }
    }
  } catch (err: any) {
    console.warn("[drop-engine] DB drop cleanup warning:", err.message);
  }

  // 2. Local Disk Cleanup (prune temporary/dynamic drop files in public/drops/generated/ or public/drops/)
  try {
    const candidateDirs = [
      path.resolve(process.cwd(), "public", "drops", "generated"),
      path.resolve(process.cwd(), "public", "drops"),
    ];

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;

    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(".mp3")) {
            // NEVER delete permanent soundboard FX, reference voice samples, or baseline sample drops
            if (
              entry.name.startsWith("fx_") ||
              entry.name.startsWith("sample_") ||
              entry.name.startsWith("reference_") ||
              entry.name.includes("reference")
            ) {
              continue;
            }

            const fullPath = path.join(dir, entry.name);
            const stats = fs.statSync(fullPath);
            if (stats.mtimeMs < cutoff) {
              fs.unlinkSync(fullPath);
              deletedFiles++;
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn("[drop-engine] Local disk cleanup warning:", err.message);
  }

  return { deletedDbRows, deletedFiles };
}

/**
 * Determines current daypart based on Nairobi time (UTC+3)
 */
export function getCurrentDaypart(now = new Date()): RadioDaypart {
  const eatHour = (now.getUTCHours() + 3) % 24;
  if (eatHour >= 6 && eatHour < 12) return "morning";
  if (eatHour >= 12 && eatHour < 18) return "afternoon";
  if (eatHour >= 18 && eatHour < 24) return "peak_evening";
  return "deep_overnight";
}

/**
 * Selects an on-air persona for the daypart
 */
export function resolveDaypartPersona(daypart: RadioDaypart, preferredPersonaId?: string) {
  const cfg = getPersonasConfig();
  if (preferredPersonaId && cfg?.personas) {
    const match = cfg.personas.find((p: any) => p.id === preferredPersonaId);
    if (match) return match;
  }
  const rule = cfg?.daypart_rules?.[daypart];
  const defaultId = rule?.default_persona || "mc-cheche";
  return cfg?.personas?.find((p: any) => p.id === defaultId) || {
    id: "mc-cheche",
    name: "MC Cheche",
    voice_id: "6801890ec345469d8818129e5bdd50dd",
    tags: ["[excited]"],
  };
}

/**
 * Selects an on-air persona for dynamic drop generation:
 * - DJ Fusion is assigned ~30% of all generated drops (Resident Entertainer)
 * - The remaining 70% is distributed randomly among the other 9 personas
 */
export function selectDropPersona(daypart: RadioDaypart, preferredPersonaId?: string) {
  const cfg = getPersonasConfig();
  if (preferredPersonaId && cfg?.personas) {
    const match = cfg.personas.find((p: any) => p.id === preferredPersonaId);
    if (match) return match;
  }

  if (!cfg?.personas || cfg.personas.length === 0) {
    return resolveDaypartPersona(daypart);
  }

  // 30% probability assigned to DJ Fusion
  const roll = Math.random();
  if (roll < 0.30) {
    const fusion = cfg.personas.find((p: any) => p.id === "dj-fusion");
    if (fusion) return fusion;
  }

  // Remaining 70%: pick randomly from the other 9 personas
  const otherPersonas = cfg.personas.filter((p: any) => p.id !== "dj-fusion");
  if (otherPersonas.length > 0) {
    const picked = otherPersonas[Math.floor(Math.random() * otherPersonas.length)];
    return picked;
  }

  return resolveDaypartPersona(daypart);
}

/**
 * Builds the strict broadcast facts block and system/user prompt
 */
export function buildDropPrompt(
  facts: DropVerifiedFacts,
  introSeconds = 10,
  recentDrops: string[] = [],
  archetype?: DropArchetype
): { system: string; user: string; archetype: DropArchetype } {
  const phrases = getShengPhrases();
  // Sample 8 fresh Sheng expressions
  const shengSample = phrases.sort(() => 0.5 - Math.random()).slice(0, 8).join(", ");

  const chosenArchetype: DropArchetype =
    archetype ||
    (facts.next_track && Math.random() < 0.4
      ? "track_stager"
      : DROP_ARCHETYPES[Math.floor(Math.random() * DROP_ARCHETYPES.length)]);

  let archetypeDirectives = "";
  switch (chosenArchetype) {
    case "track_stager":
      archetypeDirectives = `DROP ARCHETYPE: TRACK STAGER (80% MUSIC ANTICIPATION)
- Focus heavily on hyping the incoming track ("${facts.next_track?.title || "upcoming banger"}" by "${facts.next_track?.artist || "the artist"}") and the DJ transition.
- Emphasize bassline, rhythm, and dancefloor energy.
- Do NOT spend time advertising tickets or dates; keep the musical hype front and center.`;
      break;
    case "station_callout":
      archetypeDirectives = `DROP ARCHETYPE: STATION CALLOUT & URBAN FREQUENCY
- Focus on GOODLIFE Radio 254 identity, the heartbeat of Nairobi streets, and the current ${facts.daypart} mood.
- Shout out the listeners, matatus, hoods, and sound lovers across 254.
- Pure station pride, zero marketing pitch.`;
      break;
    case "event_spotlight":
      archetypeDirectives = `DROP ARCHETYPE: LIVE EVENT SPOTLIGHT
- Focus on the upcoming live festival experience (${facts.event?.name_spoken || "the festival"}) at ${facts.event?.venue_spoken || "the grounds"}.
- Mention the countdown and open-air festival vibe. Keep it vivid and sensory.`;
      break;
    case "host_banter":
      archetypeDirectives = `DROP ARCHETYPE: HOST BANTER & STREET FLAVOR
- Showcase the distinctive personality of host "${facts.persona}".
- Use natural, witty Nairobi banter, conversational storytelling, and authentic slang.`;
      break;
    case "ticket_cta":
      archetypeDirectives = `DROP ARCHETYPE: TICKET CALL-TO-ACTION
- Deliver a clear, punchy call-to-action directing the squad to secure passes on "the Goodlife website".
- Keep it natural and casual, like a friend reminding the squad to lock down tickets.`;
      break;
  }

  const system = `You are a professional on-air radio presenter for ${facts.station_callout}.
You write ultra-punchy, high-energy on-air drops and stagers for host "${facts.persona}".

CRITICAL BROADCAST STYLE & RULES:
1. LANGUAGE MIX (STRICT 70/30): 70% Kenyan English, 30% Sheng.
   - The presenter speaks predominantly fluent, confident Nairobi urban English.
   - DO NOT speak entirely in Swahili or Sheng! Only pepper in natural Sheng expressions or urban slang for ~30% of the words (e.g. ${shengSample}).
   - Never sound like an AI translating slogans. Sound like a real, top-tier Nairobi FM presenter (NRG, Capital, Homeboyz style).
2. WEBSITE & TICKETS (NO .co.ke):
   - When mentioning where to buy tickets, 80% of the time say "the Goodlife website" (e.g. "tickets on the Goodlife website").
   - 20% of the time say "s m w h r" or "goodlife dot somewhere dot space".
   - NEVER EVER say ".co.ke" under any circumstances.
3. ANTI-REPETITION (STRICT 50-DROP DIVERSITY):
   - Do NOT repeat the same catchphrase (like "Chapaa sasa, msee!" or "vibe ya leo") over and over.
   - Never reuse opening structures from recent drops.
   - Vary sentence lengths and emotional beats. Keep every drop fresh, spontaneous, and conversational.
4. ZERO FACT INVENTING: Only state facts explicitly given in the VERIFIED FACTS block below.
5. PRECOMPUTED PHRASES: Never calculate dates, countdowns or ticket prices. Use the exact precomputed phrases provided.
6. UNCONFIRMED ITEMS: If lineup is empty, do NOT name any artist. If weather/traffic is not in facts, DO NOT mention it.
7. STRICT FORBIDDEN LIST: Never speak ".co.ke", "98.4", or marketing buzzwords like "selling fast".
8. OUTPUT FORMAT: Output ONLY a single JSON object with EXACTLY this structure:
{"tag": "[excited]", "text": "Your script here"}

Do not include backticks, markdown, or any introductory commentary.`;

  const user = `VERIFIED FACTS:
${JSON.stringify(facts, null, 2)}

${archetypeDirectives}

Time cap: ${introSeconds} seconds (Keep it ultra-punchy: 15 to 25 words maximum).
Avoid similarity or shared phrasing with recently aired drops (last ${Math.min(recentDrops.length, 15)}):
${recentDrops.slice(-15).map((d, i) => `${i + 1}. "${d}"`).join("\n")}

Write the on-air drop JSON now:`;

  return { system, user, archetype: chosenArchetype };
}

/**
 * Strict AST & regex drop validator
 */
export function validateDropScript(output: string, facts: DropVerifiedFacts, introSeconds = 10): DropValidationResult {
  const errors: string[] = [];
  let parsed: any = null;

  try {
    let clean = output.replace(/```json/gi, "").replace(/```/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = { tag: "[excited]", text: clean.replace(/^["']|["']$/g, "").trim() };
    }
  } catch {
    const rawClean = output.replace(/```json/gi, "").replace(/```/g, "").replace(/^["']|["']$/g, "").trim();
    parsed = { tag: "[excited]", text: rawClean };
  }

  if (!parsed.text || typeof parsed.text !== "string") {
    return { valid: false, errors: ["Missing or invalid 'text' property in JSON"] };
  }

  let text = parsed.text.trim();

  // 1. Preambles and markdown
  if (/^(here is|sure|okay|here's|presenter:|dj:)/i.test(text)) {
    errors.push("Preamble or speaker label detected");
  }
  if (/[#*`_~]/.test(text)) {
    errors.push("Markdown formatting characters detected in script");
  }

  // 2. Length & word count
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) {
    errors.push("Drop text is too short (< 3 words)");
  }
  const maxWords = Math.max(50, Math.round(introSeconds * 4.5));
  if (words.length > maxWords) {
    errors.push(`Word count (${words.length}) exceeds intro cap (${maxWords})`);
  }

  // 3. Hardcoded forbidden strings
  const forbidden = ["goodlife.co.ke", "98.4", "SELLING FAST", "hurry up", "tickets running out"];
  for (const f of forbidden) {
    if (text.toLowerCase().includes(f.toLowerCase())) {
      errors.push(`Contained forbidden string: "${f}"`);
    }
  }

  // 4. Grounding verification on event facts
  if (facts.event) {
    // If prices mentioned, must match verified price_spoken
    if (facts.event.tiers && facts.event.tiers.length > 0) {
      const allowedPrices = facts.event.tiers.map((t) => t.price_spoken.toLowerCase());
      const hasPriceWord = /shillings|bob|kes/i.test(text);
      if (hasPriceWord) {
        const matchesAllowed = allowedPrices.some((ap) => text.toLowerCase().includes(ap));
        if (!matchesAllowed) {
          errors.push("Price mentioned in drop did not match any verified on-sale tier price");
        }
      }
    }

    // Lineup check: if event has no confirmed lineup, model must not invent artists
    if (!facts.event.lineup || facts.event.lineup.length === 0) {
      const nextArtist = (facts.next_track?.artist || "").toLowerCase();
      const suspiciousArtists = ["wakadinali", "sauti sol", "burna boy", "drake", "diamond", "otile"];
      for (const a of suspiciousArtists) {
        if (nextArtist.includes(a)) continue;
        if (text.toLowerCase().includes(a)) {
          errors.push(`Invented unconfirmed artist: "${a}"`);
        }
      }
    }
  }

  // 5. Digit safety check: numbers must come only from verified phrases (station name, event title, countdown, track/artist title)
  let digitsToCheck = text.replace(/254/g, "").replace(/\b4\b/g, "");
  if (facts.event?.countdown_phrase) {
    digitsToCheck = digitsToCheck.replace(new RegExp(facts.event.countdown_phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
    // Also allow individual numbers extracted from countdown_phrase (e.g. "10" from "in 10 days")
    const cdNumbers = facts.event.countdown_phrase.match(/\d+/g);
    if (cdNumbers) {
      for (const num of cdNumbers) {
        digitsToCheck = digitsToCheck.replace(new RegExp(`\\b${num}\\b`, "g"), "");
      }
    }
  }
  if (facts.event?.gates_open_phrase) {
    digitsToCheck = digitsToCheck.replace(new RegExp(facts.event.gates_open_phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
    const gateNumbers = facts.event.gates_open_phrase.match(/\d+/g);
    if (gateNumbers) {
      for (const num of gateNumbers) {
        digitsToCheck = digitsToCheck.replace(new RegExp(`\\b${num}\\b`, "g"), "");
      }
    }
  }
  if (facts.next_track?.title) {
    const trackNumbers = facts.next_track.title.match(/\d+/g);
    if (trackNumbers) {
      for (const num of trackNumbers) {
        digitsToCheck = digitsToCheck.replace(new RegExp(`\\b${num}\\b`, "g"), "");
      }
    }
  }
  if (facts.next_track?.artist) {
    const artistNumbers = facts.next_track.artist.match(/\d+/g);
    if (artistNumbers) {
      for (const num of artistNumbers) {
        digitsToCheck = digitsToCheck.replace(new RegExp(`\\b${num}\\b`, "g"), "");
      }
    }
  }
  if (/\d/.test(digitsToCheck)) {
    errors.push(`Contained rogue digits: "${digitsToCheck.match(/\d+/)?.[0]}" (must use spoken words)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    parsedJson: parsed,
  };
}

/**
 * Cascading Multi-Provider LLM Caller
 * Tier 1: Groq (qwen/qwen3.8-27b) -> Tier 2: NVIDIA NIM (nemotron-3.5-bolt-e4b) -> Tier 3: Pollinations
 */
async function callCascadingLlm(
  system: string,
  user: string
): Promise<{ text: string; provider: "groq" | "nvidia" | "pollinations" | "gemini"; model_id: string; latency_ms: number } | null> {
  // Tier 0: Gemini 3.8 / 2.5 Flash Broadcast Script Generator
  const geminiKey = getEnv("GEMINI_API_KEY");
  if (geminiKey) {
    const t0 = Date.now();
    for (const model of ["gemini-2.5-flash", "gemini-3.8-flash"]) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.7,
                thinkingConfig: { thinkingBudget: 0 },
              },
            }),
            signal: AbortSignal.timeout(3500),
          }
        );
        if (res.ok) {
          const j = await res.json();
          const content = j.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (content) {
            return { text: content, provider: "gemini", model_id: model, latency_ms: Date.now() - t0 };
          }
        }
      } catch (e: any) {
        console.warn(`[drop-engine] Gemini LLM (${model}) failed: ${e.message}`);
      }
    }
  }

  const groqKey = getEnv("GROQ_API_KEY");
  const groqKeyFallback = getEnv("GROQ_API_KEY_FALLBACK");
  const nvidiaKey = getEnv("NVIDIA_API_KEY");
  const pollinationsKey = getEnv("POLLINATIONS_API_KEY");

  // Tier 1: Groq
  if (groqKey) {
    const t0 = Date.now();
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen/qwen3.8-27b",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          max_tokens: 150,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const j = await res.json();
        const content = j.choices?.[0]?.message?.content || "";
        if (content) {
          return { text: content, provider: "groq", model_id: "qwen/qwen3.8-27b", latency_ms: Date.now() - t0 };
        }
      } else if (res.status === 429 && groqKeyFallback) {
        // Fallback to second Groq key
        const retryRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKeyFallback}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "qwen/qwen3.8-27b",
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            response_format: { type: "json_object" },
            max_tokens: 150,
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (retryRes.ok) {
          const rj = await retryRes.json();
          const rContent = rj.choices?.[0]?.message?.content || "";
          if (rContent) {
            return { text: rContent, provider: "groq", model_id: "qwen/qwen3.8-27b", latency_ms: Date.now() - t0 };
          }
        }
      }
    } catch (e: any) {
      console.warn("[drop-engine] Groq attempt failed, cascading to NVIDIA:", e.message);
    }
  }

  // Tier 2: NVIDIA NIM
  if (nvidiaKey) {
    const t0 = Date.now();
    try {
      const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nvidiaKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta/llama-3.2-11b-vision-instruct",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          max_tokens: 150,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const j = await res.json();
        const content = j.choices?.[0]?.message?.content || "";
        if (content) {
          return { text: content, provider: "nvidia", model_id: "meta/llama-3.2-11b-vision-instruct", latency_ms: Date.now() - t0 };
        }
      }
    } catch (e: any) {
      console.warn("[drop-engine] NVIDIA attempt failed, cascading to Pollinations:", e.message);
    }
  }

  // Tier 3: Pollinations
  if (pollinationsKey) {
    const t0 = Date.now();
    try {
      const res = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pollinationsKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5.4-nano",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          max_tokens: 150,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const j = await res.json();
        const content = j.choices?.[0]?.message?.content || "";
        if (content) {
          return { text: content, provider: "pollinations", model_id: "openai/gpt-5.4-nano", latency_ms: Date.now() - t0 };
        }
      }
    } catch (e: any) {
      console.warn("[drop-engine] Pollinations attempt failed:", e.message);
    }
  }

  return null;
}

export interface GenerateDropRequest {
  dropType?: RadioDropType;
  daypart?: RadioDaypart;
  preferredPersonaId?: string;
  archetype?: DropArchetype;
  nextTrack?: { id?: number; title: string; artist: string; genre?: string };
  currentGenre?: string;
  introSeconds?: number;
  skipAudioSynthesis?: boolean;
}

/**
 * Drop Engine v2: Generates a verified, punchy on-air drop with multi-provider failover,
 * strict grounding, loudnorm mastering, and pre-flight Drop Gate verification.
 */
export async function generateDropEngineV2(req: GenerateDropRequest = {}): Promise<GeneratedDropRecord> {
  // Ensure recent drops memory is seeded from Postgres database
  await seedRecentScriptsCache();

  // Retention cleanup: automatically prune drops older than 24h
  cleanupExpiredRadioDrops(24).catch(() => {});

  const now = new Date();
  const station = getStationConfig();
  const daypart = req.daypart || getCurrentDaypart(now);
  const persona = selectDropPersona(daypart, req.preferredPersonaId);
  const introSeconds = req.introSeconds || 10;

  // 1. Fetch promotable events from the live data layer
  let promotableEvents: RadioPromotableEvent[] = [];
  try {
    promotableEvents = await getPromotableEvents(now);
  } catch (err: any) {
    console.warn("[drop-engine] DB getPromotableEvents failed:", err.message);
  }

  // 2. Select target event if applicable
  const primaryEvent = promotableEvents[0] || null;

  // Resolve spoken ticket URL: ~80% "the Goodlife website", ~20% "s m w h r" / "goodlife dot somewhere dot space"
  const urlRand = Math.random();
  let spokenTicketUrl = "tickets on the Goodlife website";
  if (urlRand < 0.1) {
    spokenTicketUrl = "tickets on goodlife dot s m w h r dot space";
  } else if (urlRand < 0.2) {
    spokenTicketUrl = "tickets on goodlife dot somewhere dot space";
  }

  // Determine drop type
  let resolvedDropType: RadioDropType = req.dropType || "station_id";
  if (!req.dropType) {
    if (req.nextTrack) {
      resolvedDropType = "next_track_tease";
    } else if (primaryEvent) {
      resolvedDropType = primaryEvent.countdown_phrase === "today" ? "happening_now" : "event_countdown";
    } else {
      resolvedDropType = "station_id";
    }
  }

  const includeEventTiers = resolvedDropType === "event_countdown" || resolvedDropType === "happening_now";

  // Build verified facts block
  const facts: DropVerifiedFacts = {
    station_callout: station.station_name,
    daypart,
    persona: persona.name,
    current_genre: req.currentGenre || req.nextTrack?.genre,
    next_track: req.nextTrack,
    event: primaryEvent
      ? {
          id: primaryEvent.id,
          name_spoken: primaryEvent.name_spoken,
          venue_spoken: primaryEvent.venue_spoken,
          countdown_phrase: primaryEvent.countdown_phrase,
          gates_open_phrase: primaryEvent.gates_open_phrase,
          spoken_ticket_url: spokenTicketUrl,
          tiers: includeEventTiers
            ? primaryEvent.tiers.map((t) => ({
                name: t.name,
                price: t.price,
                price_spoken: t.price_spoken,
              }))
            : [],
          lineup: primaryEvent.lineup,
          promo_blurb: primaryEvent.promo_blurb,
          facts_hash: primaryEvent.facts_hash,
          valid_until: primaryEvent.valid_until,
        }
      : undefined,
  };

  // Build prompt with archetype rotation & anti-repetition memory
  const { system, user } = buildDropPrompt(facts, introSeconds, recentScriptsCache, req.archetype);

  // 3. Inference with cascade
  let chosenScript = "";
  let chosenTag = persona.tags?.[0] || "[excited]";
  let providerUsed: "groq" | "nvidia" | "pollinations" | "gemini" | "generic_library" = "generic_library";
  let modelIdUsed = "fallback";
  let latencyMs = 0;
  let isFallback = false;

  const llmRes = await callCascadingLlm(system, user);

  if (llmRes) {
    let candidateJson = llmRes.text;
    try {
      const match = candidateJson.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.text && typeof parsed.text === "string") {
          parsed.text = parsed.text
            .replace(/^((?:dj|presenter|host|mc)\s*[^:]{0,25}:\s*)/gi, "")
            .replace(/^(here is|sure|okay|here's)\s*[:,-]?\s*/gi, "")
            .replace(/^["']|["']$/g, "")
            .trim();
          candidateJson = JSON.stringify(parsed);
        }
      }
    } catch {}

    const val = validateDropScript(candidateJson, facts, introSeconds);
    if (val.valid && val.parsedJson) {
      // Anti-closeness check against last 50 drops
      const closeness = isScriptTooClose(val.parsedJson.text, recentScriptsCache);
      if (closeness.tooClose) {
        console.warn(`[drop-engine] Script too close to recent drops (${closeness.reason}), substituting fresh drop`);
      } else {
        chosenScript = val.parsedJson.text;
        chosenTag = val.parsedJson.tag || chosenTag;
        providerUsed = llmRes.provider;
        modelIdUsed = llmRes.model_id;
        latencyMs = llmRes.latency_ms;
      }
    } else {
      console.warn(`[drop-engine] LLM response failed validation (${val.errors.join("; ")}), using fallback drop`);
    }
  }

  // If LLM failed, validator rejected, or script was too close, select reviewed generic drop
  if (!chosenScript) {
    const generic = selectGenericReviewedDrop(persona.id, daypart);
    chosenScript = generic.script;
    chosenTag = generic.tag;
    providerUsed = "generic_library";
    modelIdUsed = "reviewed-library";
    isFallback = true;
  }

  // Update recent scripts cache (maintains up to 50 drops)
  recentScriptsCache.push(chosenScript);
  while (recentScriptsCache.length > RECENT_SCRIPTS_CAPACITY) {
    recentScriptsCache.shift();
  }

  // Create tentative drop record
  const dropRecord: GeneratedDropRecord = {
    id: `drop_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
    drop_type: resolvedDropType,
    persona_id: persona.id,
    persona_name: persona.name,
    voice_id: persona.voice_id,
    tag: chosenTag,
    script: chosenScript,
    audio_url: "",
    event_id: primaryEvent ? primaryEvent.id : null,
    facts_hash: primaryEvent ? primaryEvent.facts_hash : null,
    valid_until: primaryEvent ? new Date(primaryEvent.valid_until) : new Date(now.getTime() + 4 * 3600 * 1000),
    target_track_id: req.nextTrack?.id || null,
    created_at: now,
    provider: providerUsed,
    model_id: modelIdUsed,
    latency_ms: latencyMs,
    is_generic_fallback: isFallback,
  };

  // 4. Pre-flight Drop Gate Verification
  const gateResult = await verifyDropBeforePlayout(dropRecord, req.nextTrack?.id, now);
  const finalDrop = gateResult.final_drop;

  // 5. Audio Synthesis & Loudnorm Mastering (if not explicitly skipped)
  if (!req.skipAudioSynthesis) {
    try {
      const voiceId = finalDrop.voice_id || persona.voice_id || persona.id || "Aoede";
      const rawAudio = await synthesizeVoiceAudio(finalDrop.script, persona.id, voiceId);

      if (rawAudio) {
        // Apply broadcast loudnorm (-14 LUFS, -1 dBFS TP)
        const masteredAudio = await masterDropAudio(rawAudio);

        // Upload to Cloudflare R2
        const filename = `${finalDrop.persona_id}_${finalDrop.id}.mp3`;
        const r2Url = await uploadDropBufferToR2({
          buffer: masteredAudio,
          filename,
        });

        if (r2Url) {
          finalDrop.audio_url = r2Url;
        }
      }
    } catch (audioErr: any) {
      console.error("[drop-engine] Audio synthesis/upload error:", audioErr.message);
    }
  }

  return finalDrop;
}
