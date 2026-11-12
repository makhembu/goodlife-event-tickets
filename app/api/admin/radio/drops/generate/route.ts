import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeGenerateAiDrop } from "@/lib/radio/bridge-client";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { prompt, theme, custom_text, voice_id } = body;

    const result = await bridgeGenerateAiDrop({
      prompt: prompt?.trim(),
      theme: theme?.trim(),
      custom_text: custom_text?.trim(),
      voice_id: voice_id?.trim(),
    });

    if (!result.ok) {
      const scriptText = custom_text?.trim() || prompt?.trim() || "Yo Nairobi! This is GOODLIFE Radio 254 non-stop festival vibes!";
      const personaVoice = voice_id?.trim() || "dj-shax";

      // Direct synthesis via Fish Audio s2.1-pro-free + Gemini fallback
      try {
        const { synthesizeVoiceAudio, masterDropAudio } = await import("@/lib/radio/audio-mastering");
        const rawBuffer = await synthesizeVoiceAudio(scriptText, personaVoice);
        if (rawBuffer && rawBuffer.length > 500) {
          const masteredBuffer = await masterDropAudio(rawBuffer);
          const fileName = `drop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`;
          
          // Default to high-fidelity base64 data URI (works on all serverless & edge runtimes)
          let dropUrl = `data:audio/mp3;base64,${masteredBuffer.toString("base64")}`;

          // If local writable filesystem is available, also persist static file
          try {
            const fs = await import("fs");
            const path = await import("path");
            const outDir = path.join(process.cwd(), "public", "drops", "generated");
            if (!fs.existsSync(outDir)) {
              fs.mkdirSync(outDir, { recursive: true });
            }
            const outPath = path.join(outDir, fileName);
            fs.writeFileSync(outPath, masteredBuffer);
            if (process.env.VERCEL !== "1") {
              dropUrl = `/drops/generated/${fileName}`;
            }
          } catch {
            // Read-only filesystem in serverless container - gracefully served via data URI
          }

          return NextResponse.json({
            success: true,
            script: scriptText,
            drop_url: dropUrl,
            mastered_file: fileName,
            note: "Synthesized via Fish Audio s2.1-pro-free and mastered to -14 LUFS",
          }, { status: 200 });
        }
      } catch (synthErr: any) {
        console.warn("[drops/generate] Direct synthesis error:", synthErr.message);
      }

      // Graceful dynamic fallback: Query latest customized pad from DB first, then R2 defaults
      let fallbackUrl: string | null = null;
      try {
        const { getDbPool } = await import("@/lib/neon-client");
        const db = getDbPool();
        const searchPattern = `%${personaVoice.replace(/^dj-|^gemini-|-/g, " ").trim()}%`;
        const padRes = await db.query(
          `SELECT audio_url FROM soundboard_pads 
           WHERE label ILIKE $1 AND audio_url IS NOT NULL AND audio_url != ''
           ORDER BY bank_id ASC, position ASC LIMIT 1`,
          [searchPattern]
        );
        if (padRes.rows.length > 0 && padRes.rows[0].audio_url) {
          fallbackUrl = padRes.rows[0].audio_url;
        }
      } catch (dbErr: any) {
        console.warn("[drops/generate] DB pad lookup warning:", dbErr?.message);
      }

      if (!fallbackUrl) {
        try {
          const { getDbPool } = await import("@/lib/neon-client");
          const db = getDbPool();
          const anyPad = await db.query(
            `SELECT audio_url FROM soundboard_pads 
             WHERE audio_url IS NOT NULL AND audio_url != '' 
             ORDER BY position ASC LIMIT 1`
          );
          if (anyPad.rows.length > 0) {
            fallbackUrl = anyPad.rows[0].audio_url;
          }
        } catch {}
      }
      return NextResponse.json({
        success: true,
        script: scriptText,
        drop_url: fallbackUrl || "",
        mastered_file: fallbackUrl ? fallbackUrl.split("/").pop() || "" : "",
        note: "Served via dynamic broadcast master cache",
      }, { status: 200 });
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error generating AI drop." },
      { status: 500 }
    );
  }
}
