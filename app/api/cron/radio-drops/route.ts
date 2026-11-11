import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { neonQuery } from "@/lib/supabase-db";
import { generateDropEngineV2 } from "@/lib/radio/drop-engine";
import { selectGenericReviewedDrop } from "@/lib/radio/drop-gate";
import { recordLastDropGeneration } from "@/lib/radio/telemetry";
import { executeCronRadioDrops } from "@/lib/radio/cron-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.replace(/^["']|["']$/g, "").trim();
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const incBuf = Buffer.from(authHeader);
  const expBuf = Buffer.from(cronSecret);
  if (incBuf.length !== expBuf.length || !timingSafeEqual(incBuf, expBuf)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleRequest(req, cronSecret);
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.replace(/^["']|["']$/g, "").trim();
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const incBuf = Buffer.from(authHeader);
  const expBuf = Buffer.from(cronSecret);
  if (incBuf.length !== expBuf.length || !timingSafeEqual(incBuf, expBuf)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleRequest(req, cronSecret);
}

async function handleRequest(req: NextRequest, cronSecret: string) {
  const dailyCap = parseInt(process.env.RADIO_DROPS_DAILY_CAP || "12", 10);
  const targetPool = parseInt(process.env.RADIO_DROPS_TARGET_POOL || "8", 10);

  const result = await executeCronRadioDrops(req.headers.get("authorization"), {
    queryDb: neonQuery,
    generateDrop: generateDropEngineV2,
    selectFallbackDrop: selectGenericReviewedDrop,
    recordTelemetry: recordLastDropGeneration,
    cronSecret,
    dailyCap,
    targetPool,
  });

  return NextResponse.json(result.body, { status: result.statusCode });
}
