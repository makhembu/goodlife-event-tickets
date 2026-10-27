import { uploadDropBufferToR2 } from "./r2-signer";

const FALLBACK_DROPS = [
  {
    id: "drop-marara-vibes",
    title: "Marara Camp Vibes 254",
    url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793103865_e61bf9.mp3",
    script: "If you liked that jam, stay tuned for the next one on GOODLIFE Radio 98.4 FM, turn the volume all the way up!",
  },
  {
    id: "drop-nairobi-sound",
    title: "Nairobi Sound In The Building",
    url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793102386_09ef74.mp3",
    script: "Yo Nairobi, that tune went crazy! Keep it locked right here on GOODLIFE Radio 254, manze cheza kama wewe!",
  },
];

// Diverse Kenyan / East African DJ Voice Talent Pool
const DYNAMIC_VOICE_POOL = [
  { id: "6801890ec345469d8818129e5bdd50dd", name: "Kenyan DJ Sheng Primary" },
  { id: "ed2dfca6b6f440869006f9d3e721f3a3", name: "Swahili Drops Male" },
  { id: "d4483baa705e4ff5bfe1831b6960359f", name: "Wigman Swahili Hype" },
];

export async function generateDynamicDrop(params: {
  nextTrackTitle?: string;
  nextTrackArtist?: string;
  previousTrackTitle?: string;
  theme?: string;
}): Promise<{ drop_url: string; script: string; title: string }> {
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  const fishKey = process.env.FISH_AUDIO_KEY;
  
  // Pick dynamic voice from Kenyan talent pool or environment override
  const selectedVoice =
    process.env.FISH_VOICE_ID && Math.random() < 0.3
      ? process.env.FISH_VOICE_ID
      : DYNAMIC_VOICE_POOL[Math.floor(Math.random() * DYNAMIC_VOICE_POOL.length)].id;

  const nextTitle = params.nextTrackTitle || "Marara Festival Anthem";
  const nextArtist = params.nextTrackArtist || "Nairobi Sound";

  // If credentials are absent, return a verified rotation drop immediately
  if (!nvidiaKey || !fishKey) {
    const random = FALLBACK_DROPS[Math.floor(Math.random() * FALLBACK_DROPS.length)];
    return { drop_url: random.url, script: random.script, title: random.title };
  }

  try {
    // 1. Generate 70% English / 30% Sheng High-Energy DJ Script via NVIDIA NIM
    let script = "";
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
              content:
                "You are a high-energy urban Nairobi radio DJ host on GOODLIFE Radio 98.4 FM broadcasting live from Marara Camp. " +
                "Write a short, punchy 1-sentence radio station drop and song transition (10 to 18 words). " +
                "RULES: " +
                "- Speak primarily in English (70%) naturally blended with cool Kenyan Sheng slang (30%). " +
                "- High energy party DJ hype: speaking through the music to tease the next incoming track. " +
                "- Natural phrasing examples: " +
                "'If you liked that jam, stay tuned for the next one... Big 7 by Burna Boy, Yeaa turn it up!', " +
                "'Yo Nairobi, that tune was pure fire! Up next we got [Track] by [Artist], manze cheza kama wewe!', " +
                "'GOODLIFE Radio 254! We're keepin the vibes locked, coming up next is [Artist] with [Track], let's get it!' " +
                "- Keep it smooth, hype, and effortless. " +
                "- Output ONLY the spoken words. No quotation marks, no emojis, no hashtags, no asterisks.",
            },
            {
              role: "user",
              content: `Next track is "${nextTitle}" by ${nextArtist}. Hype the crowd as the beat rolls in!`,
            },
          ],
          max_tokens: 45,
          temperature: 0.75,
        }),
      });

      if (nvRes.ok) {
        const nvData = await nvRes.json();
        script = nvData.choices?.[0]?.message?.content?.replace(/["\n\r]/g, " ").trim() || "";
      }
    } catch (e) {
      console.warn("[ai-drops] NVIDIA script generation failed, using fallback copy:", e);
    }

    if (!script) {
      const presets = [
        `If you liked that jam, stay tuned for the next one... ${nextTitle} by ${nextArtist}, turn it up Nairobi!`,
        `Yo Nairobi, that tune went crazy! Coming up next we got ${nextArtist} with ${nextTitle}, manze cheza kama wewe!`,
        `GOODLIFE Radio 254! Big heat dropping right now, here comes ${nextTitle} by ${nextArtist}, let's go!`,
      ];
      script = presets[Math.floor(Math.random() * presets.length)];
    }

    // 2. Synthesize Kenyan Voice Drop via Fish Audio (s2.1-pro-free)
    const fishRes = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fishKey}`,
        "Content-Type": "application/json",
        model: "s2.1-pro-free",
      },
      body: JSON.stringify({
        text: script,
        reference_id: selectedVoice,
        format: "mp3",
      }),
    });

    if (!fishRes.ok) {
      console.warn("[ai-drops] Fish Audio error:", fishRes.status);
      const random = FALLBACK_DROPS[Math.floor(Math.random() * FALLBACK_DROPS.length)];
      return { drop_url: random.url, script: random.script, title: random.title };
    }

    const audioBuffer = await fishRes.arrayBuffer();

    // 3. Upload to Cloudflare R2
    const filename = `dyn_${Math.random().toString(36).substring(2, 8)}.mp3`;
    const dropUrl = await uploadDropBufferToR2({
      buffer: Buffer.from(audioBuffer),
      filename,
    });

    if (dropUrl) {
      return {
        drop_url: dropUrl,
        script,
        title: `${nextArtist} · ${nextTitle}`,
      };
    }

    // Fallback if R2 upload not configured
    const random = FALLBACK_DROPS[Math.floor(Math.random() * FALLBACK_DROPS.length)];
    return { drop_url: random.url, script, title: `${nextArtist} · ${nextTitle}` };
  } catch (err: any) {
    console.error("[ai-drops] Pipeline error:", err.message);
    const random = FALLBACK_DROPS[Math.floor(Math.random() * FALLBACK_DROPS.length)];
    return { drop_url: random.url, script: random.script, title: random.title };
  }
}
