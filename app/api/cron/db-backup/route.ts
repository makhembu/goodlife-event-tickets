import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { executeDatabaseBackup } from "@/lib/db-backup";
import { verifyAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Allow up to 5 minutes for full database dump & upload

async function verifyCronAuth(req: NextRequest): Promise<boolean> {
  // 1. Check CRON_SECRET (Vercel standard)
  const cronSecret = process.env.CRON_SECRET?.replace(/^["']|["']$/g, "").trim();
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const querySecret = new URL(req.url).searchParams.get("key");

  if (cronSecret) {
    if (authHeader) {
      const incBuf = Buffer.from(authHeader);
      const expBuf = Buffer.from(cronSecret);
      if (incBuf.length === expBuf.length && timingSafeEqual(incBuf, expBuf)) {
        return true;
      }
    }
    if (querySecret && querySecret === cronSecret) {
      return true;
    }
  }

  // 2. Check Admin Session cookie
  const adminCookie = req.cookies.get("goodlife_admin_session")?.value;
  if (adminCookie && (await verifyAdminSession(adminCookie))) {
    return true;
  }

  // 3. Fallback to ADMIN_PASSWORD match
  const adminPass = process.env.ADMIN_PASSWORD?.trim();
  if (adminPass && querySecret && querySecret === adminPass) {
    return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  // CRON_SECRET bearer authentication check
  if (!(await verifyCronAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await executeDatabaseBackup();
    return NextResponse.json(
      {
        success: true,
        message: "Database backup executed successfully",
        data: result,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[api/cron/db-backup] GET error:", err);
    return NextResponse.json(
      { error: err.message || "Database backup failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
