import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log("=== WHATSAPP WEBHOOK EVENT ===");
    console.log(JSON.stringify(payload, null, 2));

    // Log to a file in the workspace so we can inspect it
    const logPath = path.join(process.cwd(), "webhook-logs.txt");
    const logEntry = `${new Date().toISOString()} - ${JSON.stringify(payload)}\n`;
    fs.appendFileSync(logPath, logEntry, "utf8");

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("WhatsApp webhook error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

