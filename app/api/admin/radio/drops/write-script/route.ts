import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { buildUnifiedDropContext, formatContextPromptSummary, type BroadcastContextTag } from "@/lib/radio/drop-context";

export const dynamic = "force-dynamic";

interface ScriptContext {
  event_name: string;
  venue: string;
  date: string;
  price: string;
  ticket_url: string;
  station_name: string;
  up_next?: string;
  current_track?: string;
  lineup?: string[];
  weather?: string;
  traffic?: string;
  vendors?: string;
  promos?: string[];
  unified_briefing?: string;
}

/**
 * Fetch fresh broadcast and event metadata via Unified Drop Context Aggregator
 */
async function fetchBroadcastContext(): Promise<{ context: ScriptContext; tags: BroadcastContextTag[] }> {
  try {
    const unified = await buildUnifiedDropContext();
    const ev = unified.primary_event;
    const entryTier = ev?.tiers.find((t) => !t.is_camping_bundle) || ev?.tiers[0];
    const cleanTicketUrl = ev?.spoken_ticket_url || "goodlife.smwhr.space";
    const cur = unified.radio.now_playing;
    const next = unified.radio.up_next[0];

    const context: ScriptContext = {
      event_name: ev?.name_spoken || "GOODLIFE Festival Experience",
      venue: ev?.venue_spoken || "Nairobi Frequencies",
      date: ev?.countdown_phrase || ev?.custom_schedule_text || unified.clock.coarse_phrase,
      price: entryTier ? (entryTier.price === 0 ? "free entry" : entryTier.price_spoken) : "",
      ticket_url: cleanTicketUrl,
      station_name: unified.station_name,
      current_track: cur ? `${cur.artist ? cur.artist + " - " : ""}${cur.title}` : undefined,
      up_next: next ? `${next.artist ? next.artist + " - " : ""}${next.title}` : undefined,
      lineup: ev?.lineup_confirmed ? ev.lineup : [],
      weather: unified.weather.spoken_summary,
      traffic: `${unified.traffic.route_label} (~${unified.traffic.estimated_drive_min} min drive, ${unified.traffic.congestion_level} traffic)`,
      vendors: ev?.vendors?.length ? ev.vendors.map((v) => v.name).join(", ") : undefined,
      promos: unified.promos_highlights,
      unified_briefing: formatContextPromptSummary(unified),
    };

    return { context, tags: unified.tags };
  } catch (err: any) {
    console.warn("[write-script] Unified context fallback:", err?.message || err);
    return {
      context: {
        event_name: "GOODLIFE Festival Experience",
        venue: "Nairobi",
        date: "24/7 Live Stream",
        price: "",
        ticket_url: "goodlife.smwhr.space",
        station_name: "GOODLIFE Radio 254",
      },
      tags: [],
    };
  }
}

/**
 * Cleans punctuation and casing quirks that degrade neural TTS pronunciation.
 */
function sanitizeScriptForTts(raw: string): string {
  let out = raw
    .replace(/^["“”']|["“”']$/g, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+—\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();

  // Soften ALL-CAPS 2+ word venue/location shouts (preserve GOODLIFE, DJ, MC, VIP, EAT)
  const keepUpper = new Set(["GOODLIFE", "DJ", "MC", "VIP", "EAT", "NRG", "CBD"]);
  out = out.replace(/\b[A-Z]{3,}(?:\s+[A-Z]{3,})+\b/g, (phrase) =>
    phrase
      .split(/\s+/)
      .map((w) => (keepUpper.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
      .join(" ")
  );

  return out;
}

/**
 * Validates that an LLM output contains real spoken dialogue beyond just an emotion tag,
 * rejects forbidden repetitive openings like "Yo", and blocks widget telemetry strings.
 */
function isValidScript(s?: string | null, options?: { strictTts?: boolean }): boolean {
  if (!s || typeof s !== "string") return false;
  const stripped = s.replace(/\[[a-zA-Z\s]+\]/g, "").replace(/["“”']/g, "").trim();
  if (/^\s*y+o+[,\s!?.]/i.test(stripped)) return false; // Strict ban on "Yo" openings
  if (options?.strictTts) {
    // Reject robotic widget dumps: "14.7 km", "23 min", "23°C", decimal readings
    if (/°\s*c\b|\b\d+(\.\d+)?\s*(km|mins?)\b|\b\d+\.\d+\b/i.test(stripped)) {
      return false;
    }
  }
  const words = stripped.split(/\s+/).filter(Boolean);
  return stripped.length >= 25 && words.length >= 6;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Deterministic localized Sheng / Swahili / English DJ drop generator fallback
 * Provides dynamic randomized variations without weak "Yo" clichés
 */
function generateDeterministicScript(
  prompt: string,
  persona: string,
  ctx: ScriptContext
): string {
  const p = persona.toLowerCase();
  const pr = prompt.toLowerCase();

  let ticketUrlSpoken = "goodlife.smwhr.space";
  if (ctx.ticket_url) {
    if (ctx.ticket_url.includes("somewhere") || ctx.ticket_url.includes("smwhr")) {
      ticketUrlSpoken = "goodlife.smwhr.space";
    } else {
      ticketUrlSpoken = ctx.ticket_url.replace(/^tickets on (the )?/i, "").replace(/website,?\s*/i, "").trim() || "goodlife.smwhr.space";
    }
  }

  // If prompt is about tickets, event, venue, price, dates
  if (
    pr.includes("ticket") ||
    pr.includes("park") ||
    pr.includes("chill") ||
    pr.includes("marara") ||
    pr.includes("price") ||
    pr.includes("shilling") ||
    pr.includes("bob") ||
    pr.includes("saturday") ||
    pr.includes("sunday") ||
    pr.includes("goodlife")
  ) {
    if (p.includes("sudi") || p.includes("swahili")) {
      return pickRandom([
        `[confident] Mambo vipi watu wangu! Ni DJ Sudi hapa. ${ctx.date}, tuko ${ctx.venue} kwa vibe ya ${ctx.event_name}. Tiketi ni ${ctx.price} pekee kupitia ${ticketUrlSpoken}. Usikose manze!`,
        `[warm tone] Salamu kwa wana 254! Ni DJ Sudi. ${ctx.date} tunakutana ${ctx.venue} kwa ${ctx.event_name}. Muziki mzuri na mandhari tulivu, pass ni ${ctx.price} kwa ${ticketUrlSpoken}. Wahi yako mapema!`,
        `[confident] DJ Sudi ndani ya nyumba! ${ctx.date} vibe yote inahamia ${ctx.venue}. Usibaki nyuma, tiketi ni ${ctx.price} pekee kwa ${ticketUrlSpoken}. Tukutane kule!`,
      ]);
    }
    if (p.includes("cheche") || p.includes("sheng")) {
      return pickRandom([
        `[hype] Wasee wa Nairobi na Thika, mko ready?! MC Cheche pande hii. ${ctx.date} tunaruka ${ctx.venue} kwa ${ctx.event_name}! Form ni ${ctx.price} pekee. Wahi tiketi yako sasa hivi kwa ${ticketUrlSpoken}!`,
        `[energetic] Wanavybe maze! MC Cheche on the mic. ${ctx.date} form ndio hiyo pale ${ctx.venue}. Pass yako ni ${ctx.price} tu kwenye ${ticketUrlSpoken}. We outside kabisa!`,
        `[hype] Big shouts kwa wanajeshi wote! ${ctx.date} tukutane ${ctx.venue} tuchill river-side. Entry ni ${ctx.price} pekee via ${ticketUrlSpoken}. Piga luku ucome!`,
      ]);
    }
    if (p.includes("amina") || p.includes("sunset")) {
      return pickRandom([
        `[warm tone] Sunset vibes on ${ctx.station_name}. Join us ${ctx.date} at ${ctx.venue} for ${ctx.event_name}. River breeze, cold drinks, and advance passes are ${ctx.price} at ${ticketUrlSpoken}.`,
        `[relaxed] Golden hour in Nairobi. Join the vibe this ${ctx.date} at ${ctx.venue} for ${ctx.event_name}. Passes are ${ctx.price} on ${ticketUrlSpoken}. See you by the river.`,
      ]);
    }
    if (p.includes("bwana") || p.includes("mkubwa")) {
      return pickRandom([
        `[relaxed] Nairobi usiku sana. Hewani ni ${ctx.station_name}. ${ctx.date} tukutane ${ctx.venue} kwa ${ctx.event_name}. Tiketi ni ${ctx.price} pekee kupitia ${ticketUrlSpoken}. Vibe safi bila rush.`,
        `[confident] Bwana Mkubwa hewani. ${ctx.date} safari ni moja tu hadi ${ctx.venue}. Muziki mzuri, mazingira tulivu. Pata tiketi yako ya ${ctx.price} kwa ${ticketUrlSpoken}.`,
      ]);
    }
    // Default / DJ Fusion variations
    return pickRandom([
      `[hype] Thika na Nairobi, turn up your speakers! DJ Fusion in the mix. ${ctx.date}, we park and chill at ${ctx.venue}! Entry ni ${ctx.price} pekee. Grab your advance passes at ${ticketUrlSpoken}. We outside!`,
      `[energetic] Squad, lock in right now! Form ya ${ctx.date} ni Park & Chill kule ${ctx.venue}. Vibe safi, pure anthems, na pass ni ${ctx.price} pekee kwa ${ticketUrlSpoken}. Kaa chonjo!`,
      `[hype] Maze wasee, DJ Fusion ndani ya 254! ${ctx.date} tukutane ${ctx.venue} kwa vibe ya ${ctx.event_name}. Tiketi ni ${ctx.price} tu via ${ticketUrlSpoken}. Come through tufurahi!`,
      `[confident] Massive across the 254, DJ Fusion on the decks! Don't sleep on ${ctx.date} at ${ctx.venue}. Advance passes ziko live for ${ctx.price} on ${ticketUrlSpoken}. Twendeni wote!`,
      `[hype] Big energy kutoka kwa DJ Fusion! ${ctx.event_name} ndio kusema ${ctx.date} pale ${ctx.venue}. Shika yako sasa hivi kwa ${ticketUrlSpoken} kwa ${ctx.price} pekee!`,
    ]);
  }

  // If prompt is about up next track
  if (pr.includes("next") || pr.includes("song") || pr.includes("track") || pr.includes("coming up") || ctx.up_next) {
    const nextSong = ctx.up_next || "pure festival fire";
    if (p.includes("sudi")) {
      return pickRandom([
        `[confident] Hii ni ${ctx.station_name}. Ngoma inayofuata ni kali kinoma: ${nextSong}. Kaa hapo hapo!`,
        `[warm tone] DJ Sudi hewani. Inayofuata sasa hivi ni banger safi: ${nextSong}. Shika frequency!`,
      ]);
    }
    if (p.includes("cheche")) {
      return pickRandom([
        `[energetic] Moto unazidi kuwaka! Inayodrop sasa hivi ni ${nextSong}. Inua mikono juu, we outside!`,
        `[hype] Wazi wazi! Track inayokuja inaitwa ${nextSong}. Volume juu wasee!`,
      ]);
    }
    return pickRandom([
      `[hype] You are locked into ${ctx.station_name}! Up next, loading pure fire on the decks: ${nextSong}. Crank that volume all the way up!`,
      `[energetic] Turn up the energy in the building! Dropping ${nextSong} right after this on ${ctx.station_name}. Don't touch that dial!`,
    ]);
  }

  // Default hype drop
  if (p.includes("sudi")) {
    return `[warm tone] Salamu kwa wote wanaosikiliza ${ctx.station_name}. Muziki mzuri, mazingira safi, na vibes za ukweli. Kaa hapo hapo!`;
  }
  if (p.includes("cheche")) {
    return `[hype] Wazi wazi! MC Cheche niko live on ${ctx.station_name}. Sherehe haisimami, pandisha volume kinoma!`;
  }
  if (p.includes("amina")) {
    return `[relaxed] Chilled beats, golden hour warmth, right here on ${ctx.station_name}. Keep it locked for the finest festival energy.`;
  }
  if (p.includes("bwana")) {
    return `[relaxed] Frequencies za ukweli, bila haraka. Bwana Mkubwa on the airwaves, GOODLIFE Radio 254.`;
  }
  return pickRandom([
    `[hype] Lock in across Nairobi! DJ Fusion on the decks. Non-stop festival anthems 24/7 on ${ctx.station_name}. We outside!`,
    `[confident] Straight bangers only on ${ctx.station_name}. DJ Fusion keeping your playlist lively all day, all night!`,
  ]);
}

/**
 * Multi-provider LLM caller for radio script generation
 */
async function callLlmScriptGenerator(
  userPrompt: string,
  persona: string,
  ctx: ScriptContext
): Promise<string | null> {
  const promptLower = userPrompt.toLowerCase();
  const askedForWeatherOrTraffic =
    /weather|rain|sky|skies|cloud|sun|warm|cool|degree|traffic|cruise|drive|route|road|km|min|thika|waiyaki/i.test(
      promptLower
    );
  const upNextLower = (ctx.up_next || "").toLowerCase();
  const isSmoothOrBallad =
    /sam smith|stay with me|adele|sza|john legend|bruno|chill|soul|r&b|lounge|acoustic|slow/i.test(
      `${upNextLower} ${promptLower}`
    );
  const preferredToneHint = isSmoothOrBallad
    ? "The incoming song is smooth/soulful — use `[warm tone]` or `[relaxed]` or `[confident]` (NOT frantic `[hype]`)."
    : "Match the natural energy of the prompt (`[hype]`, `[energetic]`, `[confident]`, or `[warm tone]`).";

  const systemPrompt = `You are a veteran Kenyan FM Radio creative producer and imaging director (producing for Homeboyz Radio, NRG Radio, Ghetto Radio 89.5, and Capital FM Nairobi).
Write ONE ultra-natural, charismatic, broadcast-ready radio DJ talkover script — written purely FOR THE EAR, never like a dashboard printout.

CRITICAL STYLE & TTS RULES:
1. NO CLICHE OPENINGS: NEVER start with "Yo", "Yo,", "Yoo", or "What's good". Start directly with Kenyan FM hooks like "Wazi wasee across the 254,", "Nairobi locks in right now,", "Turn it up across the 254,", or "Good vibes across the city,".
2. AUTHENTIC URBAN CODE-SWITCHING (70% Kenyan English, 30% crisp Nairobi Sheng MID-SENTENCE):
   - Blend Sheng seamlessly mid-sentence ("ni DJ Fusion pande hii", "form ni", "shika tickets mapema", "alafu relax your vibe", "wasee wa 254", "tukutane grounds").
3. STRICTLY FOR THE EAR (ZERO WIDGET TELEMETRY!):
   - NEVER write abbreviations or symbols like "14.7 km", "23 min", "23°C", decimals, or comma-separated stats!
   - NEVER write ALL-CAPS venue names like "THE HUB GARDEN" — write natural casing ("The Hub Garden").
   - NEVER wrap song titles in quotation marks (write Sam Smith's Stay With Me cleanly without quotes).
   - ONLY weave weather or drive-time color in if the prompt explicitly asks for weather/traffic/cruise${askedForWeatherOrTraffic ? " (the DJ did request route/weather flavor — express it warmly in conversational words only!)" : " (the DJ did NOT ask for weather or traffic here, so skip stats completely!)"}.
4. CLEAR CTA WHEN MENTIONING EVENTS/TICKETS:
   - Always include where to grab passes naturally: say "on the Goodlife website" or "goodlife dot smwhr dot space".
5. LENGTH & EMOTION TAG:
   - Start strictly with ONE tag: [hype], [confident], [energetic], [relaxed], [warm tone], or [chuckle].
   - ${preferredToneHint}
   - Write 2 to 3 punchy spoken sentences (22 to 38 words total). Return ONLY the script line.

GOLD-STANDARD EXAMPLES (study the rhythm, code-switching & spoken polish):
- Smooth Event + Soul Song Bridge (DJ Fusion -> Sam Smith):
  "[warm tone] Wazi wasee across the 254, ni DJ Fusion pande hii on GOODLIFE Radio! Form ya this Sunday ni Park and Chill at The Hub Garden — shika tickets mapema on the Goodlife website, alafu relax your vibe as Sam Smith drops Stay With Me right now!"
- High-Energy Festival Hype (MC Cheche):
  "[energetic] Wazi wanavybe wa Nairobi! MC Cheche on the mic, moto hauzimi on GOODLIFE Radio! This Sunday tunaruka The Hub Garden — grab your advance passes at goodlife dot smwhr dot space kabla zimeisha!"
- Swahili Flow (DJ Sudi):
  "[confident] Mambo vipi watu wangu across the 254! Ni DJ Sudi hewani sasa hivi. Jumapili form ni Park and Chill kule The Hub Garden — shika tiketi yako mapema on the Goodlife website!"
- Smooth Sunset Transition (Amina):
  "[warm tone] Golden hour across Nairobi on GOODLIFE Radio, Amina holding you down. Lock in your passes for Sunday Park and Chill at The Hub Garden on the Goodlife website, right after this vibe."

GROUND TRUTH LIVE CONTEXT (USE ONLY RELEVANT FACTS — NEVER DUMP RAW SYMBOLS):
- Event: ${ctx.event_name}
- Venue (natural spoken): ${ctx.venue}
- Date / Countdown: ${ctx.date}
- Entry Price (spoken): ${ctx.price || "advance passes available online"}
- Tickets Website: ${ctx.ticket_url || "goodlife dot smwhr dot space"}
- Station: ${ctx.station_name}
${ctx.current_track ? `- Currently Playing On Air: ${ctx.current_track}` : ""}
${ctx.up_next ? `- Up Next Track (BRIDGE INTO THIS!): ${ctx.up_next}` : ""}
${ctx.lineup && ctx.lineup.length > 0 ? `- Confirmed Artist Lineup: ${ctx.lineup.join(", ")}` : "- Artist Lineup: Unconfirmed (NEVER invent any artist performing at the event!)"}
${askedForWeatherOrTraffic && ctx.weather ? `- Nairobi Weather (conversational only): ${ctx.weather}` : ""}
${askedForWeatherOrTraffic && ctx.traffic ? `- Drive / Traffic Color (conversational only): ${ctx.traffic}` : ""}
${ctx.vendors ? `- On-Ground Vendors: ${ctx.vendors}` : ""}
${ctx.promos && ctx.promos.length > 0 ? `- Active Offers: ${ctx.promos.join(" | ")}` : ""}

Return ONLY the single spoken line starting with [emotion].`;

  // 1. Primary: Groq (openai/gpt-oss-120b, openai/gpt-oss-20b) — ultra-fast creative inference
  const groqKey = process.env.GROQ_API_KEY?.trim() || process.env.GROQ_API_KEY_FALLBACK?.trim();
  if (groqKey) {
    for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `Write a 9.5/10 spoken Nairobi FM radio drop for persona "${persona}" based on: ${userPrompt}`,
              },
            ],
            max_tokens: 700,
            reasoning_effort: "low",
            temperature: 0.85,
          }),
          signal: AbortSignal.timeout(4500),
        });
        if (res.ok) {
          const j = await res.json();
          const raw = j.choices?.[0]?.message?.content?.trim();
          const text = raw ? sanitizeScriptForTts(raw) : "";
          if (isValidScript(text, { strictTts: true })) {
            return text;
          }
          // One-shot auto-repair if telemetry/units slipped through
          if (text) {
            const repairRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${groqKey}`,
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: `Write for "${persona}": ${userPrompt}` },
                  { role: "assistant", content: text },
                  {
                    role: "user",
                    content:
                      "Rewrite smoothly for radio TTS: remove any numeric telemetry like km, min, or °C, avoid ALL-CAPS venue names, weave 30% Nairobi Sheng naturally, and include 'on the Goodlife website' or 'goodlife dot smwhr dot space'. Return ONLY the line.",
                  },
                ],
                max_tokens: 500,
                reasoning_effort: "low",
                temperature: 0.75,
              }),
              signal: AbortSignal.timeout(4000),
            }).catch(() => null);
            if (repairRes && repairRes.ok) {
              const rj = await repairRes.json();
              const repairedRaw = rj.choices?.[0]?.message?.content?.trim();
              const repaired = repairedRaw ? sanitizeScriptForTts(repairedRaw) : "";
              if (isValidScript(repaired, { strictTts: true })) {
                return repaired;
              }
            }
          }
        }
      } catch (err: any) {
        console.warn(`[write-script] Groq (${model}) failed:`, err?.message);
      }
    }
  }

  // 2. Secondary: OpenRouter (meta-llama/llama-3.3-70b-instruct)
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openrouterKey) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openrouterKey}`,
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Write an explosive 25-to-35 word radio drop for persona "${persona}" based on: ${userPrompt}` },
          ],
          temperature: 0.9,
          max_tokens: 180,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const j = await res.json();
        const text = j.choices?.[0]?.message?.content?.trim();
        const cleaned = text ? sanitizeScriptForTts(text) : "";
        if (isValidScript(cleaned, { strictTts: true })) {
          return cleaned;
        }
      }
    } catch (err: any) {
      console.warn("[write-script] OpenRouter failed:", err?.message);
    }
  }

  // 3. Tertiary: Gemini (gemini-2.0-flash, gemini-1.5-flash)
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    for (const model of ["gemini-2.0-flash", "gemini-1.5-flash"]) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nUser Request: ${userPrompt}\nPersona: ${persona}` }] }],
              generationConfig: {
                temperature: 0.9,
                maxOutputTokens: 180,
              },
            }),
            signal: AbortSignal.timeout(4500),
          }
        );
        if (res.ok) {
          const j = await res.json();
          const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          const cleaned = text ? sanitizeScriptForTts(text) : "";
          if (isValidScript(cleaned, { strictTts: true })) {
            return cleaned;
          }
        }
      } catch (err: any) {
        console.warn(`[write-script] Gemini (${model}) failed:`, err?.message);
      }
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { context, tags } = await fetchBroadcastContext();

  return NextResponse.json({
    success: true,
    context,
    tags,
  });
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { prompt, voice_persona, voice_id, context: clientContext } = body;

    const { context: baseContext } = await fetchBroadcastContext();
    const mergedContext: ScriptContext = {
      ...baseContext,
      ...(clientContext && typeof clientContext === "object" && !clientContext.generated_at ? clientContext : {}),
    };

    const effectivePersona = voice_persona || "DJ Fusion";
    const effectivePrompt = prompt?.trim() || `Hype ${mergedContext.event_name} tickets at ${mergedContext.venue} on ${mergedContext.date}`;

    // Try AI LLM (Gemini -> Groq)
    let script = await callLlmScriptGenerator(effectivePrompt, effectivePersona, mergedContext);

    // If LLM unavailable or timed out, use localized Sheng/Swahili deterministic engine
    if (!script) {
      script = generateDeterministicScript(effectivePrompt, effectivePersona, mergedContext);
    }

    return NextResponse.json({
      success: true,
      script,
      persona: effectivePersona,
      prompt: effectivePrompt,
      context: mergedContext,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to generate AI drop script." },
      { status: 500 }
    );
  }
}
