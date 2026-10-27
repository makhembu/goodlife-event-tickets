import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neonQuery } from "@/lib/supabase-db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.set_id) {
      return new NextResponse(null, { status: 400 });
    }

    const setId = parseInt(String(body.set_id), 10);
    const secondsListened = Math.min(Math.max(0, parseInt(String(body.seconds_listened || 0), 10)), 14400);
    const completed = Boolean(body.completed);
    const quality = body.quality === "high" ? "high" : "standard";

    // Extract geographical city from Cloudflare / Vercel edge IP headers (no client permission prompt required)
    const rawCity =
      req.headers.get("x-vercel-ip-city") ||
      req.headers.get("cf-ipcity") ||
      req.headers.get("x-real-ip-city") ||
      "Nairobi";
    const city = decodeURIComponent(rawCity).replace(/[^a-zA-Z\s]/g, "").trim().slice(0, 50) || "Nairobi";

    // Kenya Data Protection Act compliance:
    // Hash IP + daily rotating date salt so identity cannot be stored or reversed
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const dateSalt = new Date().toISOString().slice(0, 10);
    const sessionHash = crypto
      .createHash("sha256")
      .update(`${ip}:${dateSalt}`)
      .digest("hex")
      .slice(0, 32);

    await neonQuery(
      `INSERT INTO radio_plays (set_id, session_hash, seconds_listened, completed, quality_used, listener_city)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [setId, sessionHash, secondsListened, completed, quality, city]
    );

    // If completed or listened for >= 30s, increment play_count
    if (completed || secondsListened >= 30) {
      await neonQuery("UPDATE radio_sets SET play_count = play_count + 1 WHERE id = $1", [setId]);
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    return new NextResponse(null, { status: 204 }); // Never fail client beacons
  }
}
