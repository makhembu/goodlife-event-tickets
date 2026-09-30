import { NextRequest, NextResponse } from "next/server";
import { neonQuery, fetchActiveEvent } from "@/lib/supabase-db";
import { sendTextMessage } from "@/lib/whatsapp";

// Helper to ensure gate_pin column exists in event_details
async function ensureGatePinColumn() {
  try {
    await neonQuery(`
      ALTER TABLE event_details 
      ADD COLUMN IF NOT EXISTS gate_pin TEXT DEFAULT '2026';
    `);
  } catch (e) {
    console.warn("Could not alter event_details table for gate_pin:", e);
  }
}

export async function GET(request: NextRequest) {
  const adminSession = request.cookies.get("goodlife_admin_session")?.value;
  if (adminSession !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureGatePinColumn();

  try {
    let pin = "2026";
    const { rows } = await neonQuery("SELECT gate_pin FROM event_details WHERE id = 1 LIMIT 1");
    if (rows.length > 0 && rows[0].gate_pin) {
      pin = rows[0].gate_pin.trim();
    }

    // Fetch active/recent stewards who have scanned passes
    const { rows: stewardRows } = await neonQuery(`
      SELECT 
        scanned_by,
        COUNT(*) as total_scans,
        MAX(scanned_at) as last_active
      FROM tickets 
      WHERE scanned_by IS NOT NULL AND deleted_at IS NULL
      GROUP BY scanned_by
      ORDER BY last_active DESC
      LIMIT 25
    `);

    const activeEvent = await fetchActiveEvent();

    return NextResponse.json({
      success: true,
      pin,
      event: activeEvent ? { id: activeEvent.id, title: activeEvent.title } : null,
      stewards: stewardRows.map((r: any) => ({
        operator: r.scanned_by,
        total_scans: Number(r.total_scans),
        last_active: r.last_active
      }))
    });
  } catch (error: any) {
    console.error("Error fetching gate scanner settings:", error);
    return NextResponse.json({ error: error.message || "Failed to load gate scanner settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminSession = request.cookies.get("goodlife_admin_session")?.value;
  if (adminSession !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureGatePinColumn();

  try {
    const body = await request.json().catch(() => ({}));
    const { newPin, stewardName, stewardPhone, gateName, sendWhatsApp } = body;

    let updatedPin = "2026";

    // If newPin is passed, update it
    if (newPin && typeof newPin === "string") {
      const cleanPin = newPin.trim();
      if (!/^\d{4,8}$/.test(cleanPin)) {
        return NextResponse.json({ error: "Gate PIN must be between 4 and 8 digits" }, { status: 400 });
      }
      await neonQuery("UPDATE event_details SET gate_pin = $1 WHERE id = 1", [cleanPin]);
      updatedPin = cleanPin;
    } else {
      const { rows } = await neonQuery("SELECT gate_pin FROM event_details WHERE id = 1 LIMIT 1");
      if (rows.length > 0 && rows[0].gate_pin) {
        updatedPin = rows[0].gate_pin.trim();
      }
    }

    const appUrl = (process.env.APP_URL || "https://goodlife.smwhr.space").replace(/\/+$/, "");
    const scannerLoginUrl = `${appUrl}/scanner/login`;

    const name = (stewardName || "Gate Steward").trim();
    const gate = (gateName || "Main Gate").trim();

    const inviteMessage = 
`*GOODLIFE FESTIVAL - GATE SCANNER ACCESS*
Steward: ${name}
Gate Station: ${gate}
Gate Access PIN: *${updatedPin}*

📲 Scanner Terminal: ${scannerLoginUrl}

Instructions:
1. Open the terminal link on your phone.
2. Select the event and enter your name (${name}).
3. Enter PIN: *${updatedPin}* to activate the scanner.`;

    let whatsAppSent = false;
    let shareUrl = "";

    // Generate WhatsApp direct link
    if (stewardPhone) {
      let formattedPhone = stewardPhone.replace(/[^0-9]/g, "");
      if (formattedPhone.startsWith("0")) {
        formattedPhone = "254" + formattedPhone.slice(1);
      } else if (formattedPhone.length === 9) {
        formattedPhone = "254" + formattedPhone;
      }
      shareUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(inviteMessage)}`;

      if (sendWhatsApp) {
        try {
          whatsAppSent = await sendTextMessage(stewardPhone, inviteMessage);
        } catch (e) {
          console.warn("WhatsApp gateway dispatch error:", e);
        }
      }
    } else {
      shareUrl = `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`;
    }

    return NextResponse.json({
      success: true,
      pin: updatedPin,
      whatsAppSent,
      shareUrl,
      inviteMessage,
      message: newPin ? "Gate Access PIN updated successfully" : "Gate credentials generated"
    });
  } catch (error: any) {
    console.error("Error updating gate scanner PIN:", error);
    return NextResponse.json({ error: error.message || "Failed to process request" }, { status: 500 });
  }
}
