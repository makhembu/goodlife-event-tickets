import { uploadDropBufferToR2 } from "./r2-signer";
import { getRadioTelemetry, RadioTelemetry } from "./telemetry";
import { neonQuery } from "@/lib/supabase-db";

export interface RadioPersona {
  id: string;
  name: string;
  voiceId: string;
  tagline: string;
  defaultMood: string;
}

// 4 Distinct On-Air Radio Personas across Gender & Delivery Styles
export const RADIO_PERSONAS: RadioPersona[] = [
  {
    id: "dj-shax",
    name: "DJ Shax",
    voiceId: "ed2dfca6b6f440869006f9d3e721f3a3",
    tagline: "The Booming Hype MC",
    defaultMood: "[excited] [shouting]",
  },
  {
    id: "mc-cheche",
    name: "MC Cheche",
    voiceId: "6801890ec345469d8818129e5bdd50dd",
    tagline: "Slick Urban Sheng Selector",
    defaultMood: "[laughing]",
  },
  {
    id: "amina",
    name: "Amina",
    voiceId: "3520fc5bdf414830a3c46f8dc7f29b04",
    tagline: "Queen of the Airwaves",
    defaultMood: "[whispering] [sensual]",
  },
  {
    id: "wigman",
    name: "Wigman",
    voiceId: "d4483baa705e4ff5bfe1831b6960359f",
    tagline: "Club & Festival Commander",
    defaultMood: "[confident] [calm]",
  },
];

const FALLBACK_DROPS = [
  {
    persona: "DJ Shax",
    mood: "HYPE",
    title: "DJ Shax · Nairobi Festival Airwaves",
    url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/1793110740827-dyn_dj-shax_mvqru6hd_ht10.mp3",
    script: "[excited] [shouting] GOODLIFE Radio 98.4 FM! Nairobi Live Festival Airwave, Marara Camp is locked in... TURN IT UP!",
  },
  {
    persona: "Amina",
    mood: "SENSUAL",
    title: "Amina · Sunset Frequency",
    url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/1793110767747-dyn_amina_mvqrur9e_aq1d.mp3",
    script: "[whispering] [sensual] You're tuned into the official frequency. GOODLIFE 98.4 FM, feeling the sunset breeze at Marara Camp... wazi.",
  },
  {
    persona: "MC Cheche",
    mood: "BANTER",
    title: "MC Cheche · Nairobi Sound",
    url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793102386_09ef74.mp3",
    script: "[laughing] Yo Nairobi, keep it locked right here on GOODLIFE Radio 254, manze cheza kama wewe!",
  },
  {
    persona: "Wigman",
    mood: "STOIC",
    title: "Wigman · 98.4 FM Live",
    url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793103865_e61bf9.mp3",
    script: "[confident] [calm] GOODLIFE 98.4 FM live at Marara Camp! Pure frequency, zero static. The heartbeat of Kenya festivals.",
  },
];

export interface GenerateDropParams {
  nextTrackId?: number;
  nextTrackTitle?: string;
  nextTrackArtist?: string;
  nextTrackGenre?: string;
  currentTrackTitle?: string;
  currentTrackArtist?: string;
  timingType?: "intro" | "mid_song" | "outro";
  preferredMood?: "hype" | "sensual" | "comedic" | "stoic";
  forceNew?: boolean;
}

export interface DynamicDropResult {
  drop_url: string;
  script: string;
  title: string;
  persona: string;
  mood: string;
  timingType: "intro" | "mid_song" | "outro";
}

export async function generateDynamicDrop(params: GenerateDropParams): Promise<DynamicDropResult> {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const fishKey = process.env.FISH_AUDIO_KEY;

  const nextTitle = params.nextTrackTitle || "Marara Festival Anthem";
  const nextArtist = params.nextTrackArtist || "Nairobi Sound";
  const nextGenre = params.nextTrackGenre || "Afrobeats";
  const currentTitle = params.currentTrackTitle || "Goodlife Jam";
  const currentArtist = params.currentTrackArtist || "Marara Allstars";
  const timing = params.timingType || "outro";

  // 1. Fetch live telemetry (listener count, Nairobi time, traffic, weather, festival mood)
  let telemetry: RadioTelemetry;
  try {
    telemetry = await getRadioTelemetry();
  } catch {
    telemetry = {
      listenersCount: 1350,
      nairobiTimeEAT: "17:25",
      nairobiTime12h: "5:25 PM",
      timeSlot: "sunset_vibes",
      timeSlotLabel: "Sunset Golden Hour at Marara Camp",
      weather: "23°C clear evening skies in Nairobi",
      trafficBulletin: "Thika Superhighway moving steady outbound past Juja towards Marara Camp",
      entertainmentNews: "Nairobi music scene buzzing with sold-out shows and festival excitement",
      activeCities: ["Nairobi", "Thika", "Eldoret"],
      venue: "Marara Camp, Thika",
      frequency: "98.4 FM",
    };
  }

  // Check shared broadcast cache in DB for this upcoming track (prevents rate limit burn & ensures audience sync)
  if (params.nextTrackId && !params.forceNew) {
    try {
      const { rows } = await neonQuery(
        `SELECT persona, mood, title, script, audio_url, timing_type
         FROM radio_drops
         WHERE target_track_id = $1 AND created_at > NOW() - INTERVAL '30 minutes'
         ORDER BY created_at DESC LIMIT 1`,
        [params.nextTrackId]
      );
      if (rows && rows.length > 0) {
        const cached = rows[0];
        return {
          drop_url: cached.audio_url,
          script: cached.script,
          title: cached.title,
          persona: cached.persona,
          mood: cached.mood,
          timingType: cached.timing_type || timing,
        };
      }
    } catch (e) {
      console.warn("[ai-drops] DB cache check skipped:", e);
    }
  }

  // 2. Select dynamic on-air persona (alternating randomly among all 4)
  const persona = RADIO_PERSONAS[Math.floor(Math.random() * RADIO_PERSONAS.length)];

  // If credentials are absent, return a rich rotation drop immediately
  if (!nvidiaKey || !fishKey) {
    const random = FALLBACK_DROPS[Math.floor(Math.random() * FALLBACK_DROPS.length)];
    return {
      drop_url: random.url,
      script: random.script,
      title: `${random.persona} · ${nextArtist}`,
      persona: random.persona,
      mood: random.mood,
      timingType: timing,
    };
  }

  try {
    // 3. Generate Hyper-Personalized Script via NVIDIA NIM with Emotion Tags, Lyrics Lore & Telemetry
    let script = "";
    let detectedMood = "HYPE";

    const systemPrompt = `You are ${persona.name} (${persona.tagline}) broadcasting live on GOODLIFE Radio 98.4 FM from ${telemetry.venue}.
You are producing a personalized on-air radio imaging drop for the frequency.

REAL-TIME BROADCAST TELEMETRY & LOCAL NAIROBI DATA:
- Nairobi Clock Time: ${telemetry.nairobiTime12h} (${telemetry.nairobiTimeEAT} EAT)
- Nairobi Traffic Bulletin: "${telemetry.trafficBulletin}"
- Live Temperature & Weather: ${telemetry.weather}
- Entertainment Scene Buzz: "${telemetry.entertainmentNews}"
- Active Listener Hotspots: ${telemetry.activeCities.join(", ")}
- Active Listeners Count: ${telemetry.listenersCount.toLocaleString()} listeners locked in across Kenya right now
- Time Slot & Atmosphere: ${telemetry.timeSlotLabel}
- Drop Timing Slot: ${timing.toUpperCase()} (${timing === "intro" ? "Intro Ramp over opening beat" : timing === "mid_song" ? "Mid-Song Power Stager during instrumental bridge" : "Outro Transition teasing next track"})
- Current Track: "${currentTitle}" by ${currentArtist}
- Upcoming Next Track: "${nextTitle}" by ${nextArtist} (Genre: ${nextGenre})

HUMAN RADIO IMAGING & EMOTION TAG RULES:
1. START THE SENTENCE WITH EXACTLY ONE FISH AUDIO INLINE EMOTION TAG IN SQUARE BRACKETS:
   - For high-energy bangers/Amapiano/drill: "[excited] [shouting]"
   - For smooth Afrobeats, R&B, sunset/late-night: "[whispering] [sensual]"
   - For playful banter or jokes: "[laughing]"
   - For station authority, deep bass drops: "[confident] [calm]"
2. WEAVE IN ONE FAMOUS HOOK, VIRAL LYRIC, OR CULTURAL TAGLINE of "${nextTitle}" by ${nextArtist} (e.g. signature catchphrases, viral TikTok lines, or famous chorus hooks).
3. PERSONAL LOCAL REAL-TIME TOUCH: Incorporate AT LEAST ONE of:
   - Exact Nairobi time: e.g. "It's ${telemetry.nairobiTime12h} in the 254" or "Just past ${telemetry.nairobiTime12h} on 98.4 FM"
   - Quick traffic shoutout: e.g. "Thika Superhighway is clear all the way to Marara Camp"
   - City shoutout to listeners: e.g. "Big up our crew tuning in from ${telemetry.activeCities[0]} and ${telemetry.activeCities[1] || 'Eldoret'}"
   - Active crowd count: e.g. "${telemetry.listenersCount.toLocaleString()} people locked in"
4. NATURAL HUMAN CADENCE:
   - Use ellipses (...) for breathless anticipation.
   - Use em dashes (—) for rhythmic syncopation.
   - Capitalize 1-2 key hype words (e.g. "TURN IT UP", "MASSIVE", "LETS GO").
5. LANGUAGE MIX: 70% fluent urban English mixed seamlessly with 30% natural Nairobi Sheng slang (manze, cheza kama wewe, wazi, rada safi, twende kazi).
6. LENGTH: 12 to 24 words maximum. Output ONLY the spoken words with the opening bracket tag. No markdown, quotes, emojis, or asterisks.`;

    try {
      const nvRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nvidiaKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta/llama-3.2-11b-vision-instruct",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: `Drop transition for "${nextTitle}" by ${nextArtist}. Hype the crowd!`,
            },
          ],
          max_tokens: 60,
          temperature: 0.82,
        }),
      });

      if (nvRes.ok) {
        const nvData = await nvRes.json();
        script = nvData.choices?.[0]?.message?.content?.replace(/["\r]/g, " ").trim() || "";
        if (script.includes("[whisper") || script.includes("[sensual")) detectedMood = "SENSUAL";
        else if (script.includes("[laugh")) detectedMood = "COMEDIC";
        else if (script.includes("[confident") || script.includes("[calm")) detectedMood = "STOIC";
        else detectedMood = "HYPE";
      }
    } catch (e) {
      console.warn("[ai-drops] NVIDIA generation failed, using fallback copy:", e);
    }

    if (!script) {
      const presets = [
        `[excited] [shouting] Over ${telemetry.listenersCount.toLocaleString()} people locked in! Here comes ${nextTitle} by ${nextArtist}, turn it UP Nairobi!`,
        `[laughing] Yo Nairobi, that last tune went crazy! Coming up next we got ${nextArtist} with ${nextTitle}, manze cheza kama wewe!`,
        `[confident] [calm] GOODLIFE 98.4 FM live at Marara Camp! Next up is ${nextTitle} by ${nextArtist}, let's go!`,
      ];
      script = presets[Math.floor(Math.random() * presets.length)];
    }

    // Ensure Fish Audio opening tag exists
    if (!script.startsWith("[")) {
      script = `${persona.defaultMood} ${script}`;
    }

    // 4. Synthesize Voice Drop via Fish Audio (s2.1-pro-free) with Persona Voice
    const fishRes = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fishKey}`,
        "Content-Type": "application/json",
        model: "s2.1-pro-free",
      },
      body: JSON.stringify({
        text: script,
        reference_id: persona.voiceId,
        format: "mp3",
      }),
    });

    if (!fishRes.ok) {
      console.warn("[ai-drops] Fish Audio error:", fishRes.status);
      const random = FALLBACK_DROPS[Math.floor(Math.random() * FALLBACK_DROPS.length)];
      return {
        drop_url: random.url,
        script: random.script,
        title: `${persona.name} · ${nextArtist}`,
        persona: persona.name,
        mood: detectedMood,
        timingType: timing,
      };
    }

    const audioBuffer = await fishRes.arrayBuffer();

    // 5. Upload to Cloudflare R2
    const filename = `dyn_${persona.id}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}.mp3`;
    const dropUrl = await uploadDropBufferToR2({
      buffer: Buffer.from(audioBuffer),
      filename,
    });

    const finalUrl = dropUrl || FALLBACK_DROPS[0].url;

    // 6. Save to radio_drops for shared broadcast synchronization & admin telemetry
    try {
      await neonQuery(
        `INSERT INTO radio_drops 
          (persona, mood, title, script, audio_url, target_track_id, target_track_title, target_artist, timing_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          persona.name,
          detectedMood,
          `${persona.name} · ${nextArtist} - ${nextTitle}`,
          script,
          finalUrl,
          params.nextTrackId || null,
          nextTitle,
          nextArtist,
          timing,
        ]
      );
    } catch (dbErr) {
      console.warn("[ai-drops] DB record insert skipped:", dbErr);
    }

    return {
      drop_url: finalUrl,
      script,
      title: `${persona.name} · ${nextArtist} - ${nextTitle}`,
      persona: persona.name,
      mood: detectedMood,
      timingType: timing,
    };
  } catch (err: any) {
    console.error("[ai-drops] Pipeline error:", err.message);
    const random = FALLBACK_DROPS[Math.floor(Math.random() * FALLBACK_DROPS.length)];
    return {
      drop_url: random.url,
      script: random.script,
      title: `${persona.name} · ${nextArtist}`,
      persona: persona.name,
      mood: "HYPE",
      timingType: timing,
    };
  }
}
