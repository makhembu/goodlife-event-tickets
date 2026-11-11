import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { getPromotableEvents } from "@/lib/radio/events";
import { formatTrackTitle } from "@/lib/radio/media-helpers";

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
}

/**
 * Fetch fresh broadcast and event metadata for dynamic drop tags
 */
async function fetchBroadcastContext(): Promise<ScriptContext> {
  const context: ScriptContext = {
    event_name: "GOODLIFE Festival Experience",
    venue: "Nairobi Frequencies",
    date: "24/7 Live Stream",
    price: "",
    ticket_url: "goodlife.smwhr.space",
    station_name: "GOODLIFE Radio 254",
  };

  try {
    const events = await getPromotableEvents(new Date()).catch(() => []);
    if (events.length > 0) {
      const ev = events[0];
      if (ev.name_spoken) context.event_name = ev.name_spoken;
      if (ev.venue_spoken) context.venue = ev.venue_spoken;
      if (ev.is_recurring) {
        context.date = "Weekly Sessions";
      } else if (ev.countdown_phrase) {
        context.date = ev.countdown_phrase;
      }
      if (ev.tiers && ev.tiers.length > 0 && ev.tiers[0].price) {
        context.price = ev.tiers[0].price_spoken || `${ev.tiers[0].price} bob`;
      }
      if (ev.spoken_ticket_url) {
        context.ticket_url = ev.spoken_ticket_url;
      }
    }

    // Fetch Up Next track from active playlist and settings
    const [livePlRes, settingsRes] = await Promise.all([
      neonQuery(`
        SELECT p.id as playlist_id, p.activated_at,
               s.id, s.title, s.dj_name, s.duration_sec, pt.position
        FROM radio_playlists p
        JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
        JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND (s.is_active = true OR s.is_active IS NULL)
        WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
        ORDER BY pt.position ASC, pt.id ASC
      `).catch(() => ({ rows: [] })),
      neonQuery("SELECT broadcast_mode, active_set_id FROM radio_settings WHERE id = 1").catch(() => ({ rows: [] })),
    ]);

    let sets = livePlRes.rows;
    if (sets.length === 0) {
      const catRes = await neonQuery(`
        SELECT id, title, dj_name, duration_sec
        FROM radio_sets
        WHERE deleted_at IS NULL AND (is_active = true OR is_active IS NULL) AND processing_status = 'ready'
        ORDER BY display_order ASC, id ASC
        LIMIT 200
      `).catch(() => ({ rows: [] }));
      sets = catRes.rows || [];
    }

    if (sets.length > 0) {
      const settings = settingsRes.rows[0] || {};
      let activeIdx = -1;
      if (settings.broadcast_mode === "mania" && settings.active_set_id) {
        activeIdx = sets.findIndex((s: any) => s.id === Number(settings.active_set_id));
      }
      if (activeIdx === -1) {
        const totalDurationSec = sets.reduce((acc: number, s: any) => acc + (s.duration_sec || 180), 0);
        const nowSec = Math.floor(Date.now() / 1000);
        const activatedAtSec = sets[0]?.activated_at
          ? Math.floor(new Date(sets[0].activated_at).getTime() / 1000)
          : 0;
        const cycleSec = totalDurationSec > 0 ? (Math.max(0, nowSec - activatedAtSec) % totalDurationSec) : 0;

        let cumulative = 0;
        activeIdx = 0;
        for (let i = 0; i < sets.length; i++) {
          const dur = sets[i].duration_sec || 180;
          if (cumulative + dur > cycleSec) {
            activeIdx = i;
            break;
          }
          cumulative += dur;
        }
      }
      const cur = sets[activeIdx];
      const next = sets[(activeIdx + 1) % sets.length];
      if (cur) context.current_track = `${cur.dj_name ? cur.dj_name + " - " : ""}${formatTrackTitle(cur.title)}`;
      if (next) context.up_next = `${next.dj_name ? next.dj_name + " - " : ""}${formatTrackTitle(next.title)}`;
    }
  } catch (err: any) {
    console.warn("[write-script] fetchBroadcastContext warning:", err?.message || err);
  }

  return context;
}

/**
 * Validates that an LLM output contains real spoken dialogue beyond just an emotion tag,
 * and rejects forbidden repetitive openings like "Yo".
 */
function isValidScript(s?: string | null): boolean {
  if (!s || typeof s !== "string") return false;
  const stripped = s.replace(/\[[a-zA-Z\s]+\]/g, "").replace(/["“”']/g, "").trim();
  if (/^\s*y+o+[,\s!?.]/i.test(stripped)) return false; // Strict ban on "Yo" openings
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
  const systemPrompt = `You are a veteran Kenyan FM Radio creative producer and high-energy DJ imaging scriptwriter (producing for NRG Radio, Homeboyz Radio, Ghetto Radio 89.5, and Capital FM Nairobi).
Your job is to write an EXPLOSIVE, electrifying, punchy, authentic on-air radio DJ drop / talkover script.

CRITICAL STYLE & ANTI-CLICHÉ RULES:
- STRICTLY BANNED: NEVER EVER start with "Yo", "Yo,", "Yoo", "Yo what's good", or generic low-energy greetings. Starting with "Yo" is an IMMEDIATE FAILURE.
- Launch directly with high-octane broadcast hooks: e.g., "Turn up your speakers across the 254!", "Straight from the main stage!", "Nairobi na Thika, mko ready?!", "Lock in right now!", "Wazi wazi wanavybe!", "Drop everything and listen!".
- Write 2 to 3 complete, high-pace, punchy spoken sentences (between 20 and 38 spoken words).
- Start strictly with ONE emotion tag: [hype], [confident], [energetic], [relaxed], [warm tone], or [chuckle].
- Code-switch naturally between urban Kenyan English and crisp Nairobi Sheng!

PERSONA EXAMPLES (notice ZERO "Yo" clichés and explosive pace):
- DJ Fusion:
  "[hype] Turn your speakers all the way up across the 254! DJ Fusion locking down the decks on GOODLIFE Radio. This Saturday we take over Marara Camp — grab advance tickets at goodlife.smwhr.space!"
- MC Cheche:
  "[energetic] Wazi wazi wanavybe wa Nairobi na Thika! MC Cheche on the mic, moto hauzimi! Saturday form ni Marara Camp, pass ni 500 bob tu on goodlife.smwhr.space!"
- DJ Sudi:
  "[confident] Mambo vipi watu wangu! Ni DJ Sudi hewani sasa hivi. Jumamosi tunakutana Marara Camp kwa muziki safi. Tiketi ni mia tano pekee kupitia goodlife.smwhr.space!"
- Bwana Mkubwa:
  "[relaxed] Nairobi usiku sana. Hewani ni GOODLIFE Radio 254. Safe frequencies, no rush, vibe safi hadi che. Tiketi ni mia tano pekee kwa goodlife.smwhr.space."

GROUND TRUTH LIVE CONTEXT TO WEAVE IN DYNAMICALLY:
- Event: ${ctx.event_name}
- Venue: ${ctx.venue}
- Date: ${ctx.date}
- Price: ${ctx.price}
- Tickets website: goodlife.smwhr.space
- Station: ${ctx.station_name}
${ctx.current_track ? `- Currently Playing On Air: ${ctx.current_track}` : ""}
${ctx.up_next ? `- Up Next Track (TEASE THIS!): ${ctx.up_next}` : ""}

Return ONLY the spoken script starting with the emotion tag. No quotes, no markdown, no conversational commentary.`;

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
              { role: "user", content: `Write an explosive, high-pace 25-to-35 word radio drop for persona "${persona}" based on: ${userPrompt}` },
            ],
            max_tokens: 700,
            reasoning_effort: "low",
            temperature: 0.9,
          }),
          signal: AbortSignal.timeout(4500),
        });
        if (res.ok) {
          const j = await res.json();
          const text = j.choices?.[0]?.message?.content?.trim();
          if (isValidScript(text)) {
            return text!.replace(/^["“”']|["“”']$/g, "").trim();
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
        if (isValidScript(text)) {
          return text!.replace(/^["“”']|["“”']$/g, "").trim();
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
          if (isValidScript(text)) {
            return text!.replace(/^["“”']|["“”']$/g, "").trim();
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

  const context = await fetchBroadcastContext();

  let cleanTicketUrl = "goodlife.smwhr.space";
  if (context.ticket_url) {
    if (context.ticket_url.includes("somewhere") || context.ticket_url.includes("smwhr")) {
      cleanTicketUrl = "goodlife.smwhr.space";
    } else {
      cleanTicketUrl = context.ticket_url.replace(/^tickets on (the )?/i, "").replace(/website,?\s*/i, "").trim() || "goodlife.smwhr.space";
    }
  }

  return NextResponse.json({
    success: true,
    context: {
      ...context,
      ticket_url: cleanTicketUrl,
    },
    tags: [
      { id: "tickets", label: `🎟️ Tickets: ${cleanTicketUrl}`, value: `tickets on ${cleanTicketUrl}` },
      { id: "date", label: `📅 Date: ${context.date}`, value: context.date },
      { id: "venue", label: `📍 Venue: ${context.venue}`, value: context.venue },
      { id: "price", label: `💰 Price: ${context.price}`, value: context.price },
      { id: "station", label: `📻 Station: ${context.station_name}`, value: context.station_name },
      ...(context.up_next ? [{ id: "up_next", label: `🎵 Up Next: ${context.up_next}`, value: `Up next: ${context.up_next}` }] : []),
    ],
  });
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { prompt, voice_persona, voice_id, context: clientContext } = body;

    const baseContext = await fetchBroadcastContext();
    const mergedContext: ScriptContext = {
      ...baseContext,
      ...(clientContext || {}),
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
