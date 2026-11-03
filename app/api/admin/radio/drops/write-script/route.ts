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
    event_name: "Park & Chill",
    venue: "Marara Camp, Thika",
    date: "Every Sunday",
    price: "200 bob",
    ticket_url: "goodlife.smwhr.space",
    station_name: "GOODLIFE Radio 254",
  };

  try {
    const events = await getPromotableEvents(new Date()).catch(() => []);
    if (events.length > 0) {
      const ev = events[0];
      context.event_name = ev.name_spoken || context.event_name;
      context.venue = ev.venue_spoken || context.venue;
      if (ev.is_recurring) {
        context.date = "Every Sunday";
      } else if (ev.countdown_phrase) {
        context.date = ev.countdown_phrase;
      }
      if (ev.tiers && ev.tiers.length > 0) {
        context.price = ev.tiers[0].price_spoken || `${ev.tiers[0].price} bob`;
      }
      if (ev.spoken_ticket_url) {
        context.ticket_url = ev.spoken_ticket_url;
      }
    }

    // Fetch Up Next track from active playlist
    const livePlRes = await neonQuery(`
      SELECT p.id as playlist_id, p.activated_at,
             s.id, s.title, s.dj_name, s.duration_sec, pt.position
      FROM radio_playlists p
      JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
      JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND (s.is_active = true OR s.is_active IS NULL)
      WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
      ORDER BY pt.position ASC, pt.id ASC
    `).catch(() => ({ rows: [] }));

    if (livePlRes.rows.length > 0) {
      const sets = livePlRes.rows;
      const totalDurationSec = sets.reduce((acc: number, s: any) => acc + (s.duration_sec || 180), 0);
      const nowSec = Math.floor(Date.now() / 1000);
      const activatedAtSec = Math.floor(new Date(sets[0].activated_at || Date.now()).getTime() / 1000);
      const cycleSec = totalDurationSec > 0 ? ((nowSec - activatedAtSec) % totalDurationSec) : 0;

      let cumulative = 0;
      let activeIdx = 0;
      for (let i = 0; i < sets.length; i++) {
        const dur = sets[i].duration_sec || 180;
        if (cumulative + dur > cycleSec) {
          activeIdx = i;
          break;
        }
        cumulative += dur;
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
 * Deterministic localized Sheng / Swahili / English DJ drop generator fallback
 */
function generateDeterministicScript(
  prompt: string,
  persona: string,
  ctx: ScriptContext
): string {
  const p = persona.toLowerCase();
  const pr = prompt.toLowerCase();

  // If prompt is about tickets or park & chill
  if (pr.includes("ticket") || pr.includes("park") || pr.includes("chill") || pr.includes("marara") || pr.includes("price") || pr.includes("200")) {
    if (p.includes("sudi") || p.includes("swahili")) {
      return `[confident] Wazi wasee! Ni DJ Sudi hapa. ${ctx.date}, tuko ${ctx.venue} kwa vibe ya ${ctx.event_name}. Tiketi ni ${ctx.price} pekee kupitia ${ctx.ticket_url}. Usipitwe manze!`;
    }
    if (p.includes("cheche") || p.includes("sheng")) {
      return `[hype] Yoo Nairobi na Thika! MC Cheche pande hii. ${ctx.date} tunasonga ${ctx.venue} kwa ${ctx.event_name}! Form ni ${ctx.price} tu. Wahi tiketi yako sasa hivi kwa ${ctx.ticket_url}!`;
    }
    if (p.includes("amina") || p.includes("sunset")) {
      return `[warm tone] Sunset vibes on ${ctx.station_name}. Make plans for ${ctx.date} at ${ctx.venue} for ${ctx.event_name}. Tickets are just ${ctx.price} at ${ctx.ticket_url}.`;
    }
    return `[hype] Yo, what's good Thika! DJ Fusion in the mix. ${ctx.date}, we park and chill at ${ctx.venue}! Entry is only ${ctx.price}. Grab your passes at ${ctx.ticket_url}. We outside!`;
  }

  // If prompt is about up next track
  if (pr.includes("next") || pr.includes("song") || pr.includes("track") || pr.includes("coming up")) {
    const nextSong = ctx.up_next || "pure festival fire";
    if (p.includes("sudi")) {
      return `[confident] Hii ni ${ctx.station_name}. Ngoma inayofuata ni kali kinoma: ${nextSong}. Kaa hapo hapo!`;
    }
    if (p.includes("cheche")) {
      return `[energetic] Moto unazidi kuwaka! Inayodrop sasa hivi ni ${nextSong}. Inua mikono juu, we outside!`;
    }
    return `[hype] You are locked into ${ctx.station_name}! Up next, brand new heat: ${nextSong}. Crank up that volume!`;
  }

  // Default hype drop
  if (p.includes("sudi")) {
    return `[warm tone] Salamu kwa wote wanaosikiliza ${ctx.station_name}. Muziki mzuri, mazingira safi, vibes za ukweli.`;
  }
  if (p.includes("cheche")) {
    return `[hype] Wazi wazi! MC Cheche niko live on ${ctx.station_name}. Sherehe haisimami, pandisha volume kinoma!`;
  }
  if (p.includes("amina")) {
    return `[relaxed] Chilled beats, golden hour warmth, right here on ${ctx.station_name}. Keep it locked.`;
  }
  return `[hype] Yo Nairobi! DJ Fusion on the decks. Non-stop festival anthems 24/7 on ${ctx.station_name}. We outside!`;
}

/**
 * Multi-provider LLM caller for radio script generation
 */
async function callLlmScriptGenerator(
  userPrompt: string,
  persona: string,
  ctx: ScriptContext
): Promise<string | null> {
  const systemPrompt = `You are a legendary Kenyan FM Radio creative producer and DJ scriptwriter (producing for stations like Homeboyz Radio, NRG Radio, Ghetto Radio 89.5, and Capital FM Nairobi).
Your job is to write a punchy, authentic on-air radio DJ drop / talkover script (15 to 30 words max).

PERSONA INSTRUCTIONS:
- Name: ${persona}
- If persona is DJ Fusion: energetic resident DJ speaking cool Nairobi Sheng/English mix ("Yo what's good Thika! DJ Fusion on the decks...")
- If persona is DJ Sudi: coastal Swahili DJ drops ("Mambo vipi... DJ Sudi hapa...")
- If persona is MC Cheche: raw urban Sheng hypeman ("Wazi wazi wasee! MC Cheche pande hii...")
- If persona is DJ Sney or DJ Shax: high-energy mixtape MC, club hype ("Turn up the volume! DJ Sney in the mix...")
- If persona is Amina: smooth sunset presenter, sophisticated Afro-house warmth ("You're locked into the sunset sessions with Amina...")
- If Gemini Aoede/Puck/Charon/Fenrir/Kore: charismatic modern broadcast presenter.

RULES:
1. ALWAYS start with or include an emotion tag: [hype], [confident], [energetic], [relaxed], [warm tone], or [chuckle].
2. Keep it punchy (15–30 words). Never write long paragraphs.
3. Ground the script in the verified event context provided:
   - Event: ${ctx.event_name}
   - Venue: ${ctx.venue}
   - Date: ${ctx.date}
   - Price: ${ctx.price}
   - Tickets website: ${ctx.ticket_url}
   - Station: ${ctx.station_name}
   ${ctx.up_next ? `- Up Next Track: ${ctx.up_next}` : ""}
4. DO NOT invent dates, prices, or locations outside this verified context.
5. Return ONLY the spoken drop text (with emotion tags). No meta-commentary, no quotation marks.`;

  // 1. Gemini
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    for (const model of ["gemini-2.5-flash", "gemini-3.8-flash"]) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nUser Request: ${userPrompt}` }] }],
              generationConfig: {
                temperature: 0.75,
                maxOutputTokens: 120,
              },
            }),
            signal: AbortSignal.timeout(4000),
          }
        );
        if (res.ok) {
          const j = await res.json();
          const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text && text.length > 10) {
            return text.replace(/^["“”']|["“”']$/g, "").trim();
          }
        }
      } catch (err: any) {
        console.warn(`[write-script] Gemini (${model}) failed:`, err?.message);
      }
    }
  }

  // 2. Groq
  const groqKey = process.env.GROQ_API_KEY?.trim() || process.env.GROQ_API_KEY_FALLBACK?.trim();
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Write a drop script for: ${userPrompt}` },
          ],
          max_tokens: 120,
          temperature: 0.75,
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const j = await res.json();
        const text = j.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 10) {
          return text.replace(/^["“”']|["“”']$/g, "").trim();
        }
      }
    } catch (err: any) {
      console.warn("[write-script] Groq failed:", err?.message);
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const context = await fetchBroadcastContext();

  return NextResponse.json({
    success: true,
    context,
    tags: [
      { id: "tickets", label: `🎟️ Tickets: ${context.ticket_url}`, value: `tickets on ${context.ticket_url}` },
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
