import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { generateScheduleSlots } from "@/lib/radio/schedule-generator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.replace(/^["']|["']$/g, "").trim();
  if (!cronSecret) return false;

  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const incBuf = Buffer.from(authHeader);
  const expBuf = Buffer.from(cronSecret);
  if (incBuf.length !== expBuf.length || !timingSafeEqual(incBuf, expBuf)) {
    return false;
  }
  return true;
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 500 });
  }
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateScheduleSlots(30);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to generate schedule" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 500 });
  }
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await generateScheduleSlots(30);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to generate schedule" }, { status: 500 });
  }
}
