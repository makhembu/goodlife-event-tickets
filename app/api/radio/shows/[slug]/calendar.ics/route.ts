import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;

    const showRes = await neonQuery(
      `SELECT s.id, s.title, s.slug, s.description, s.genre, s.recurrence_pattern, s.recurrence_days,
              s.default_duration_min, p.dj_name
       FROM shows s
       JOIN presenters p ON p.id = s.primary_presenter_id
       WHERE s.slug = $1 LIMIT 1;`,
      [slug]
    );

    if (!showRes.rows || showRes.rows.length === 0) {
      return new NextResponse("Show not found", { status: 404 });
    }

    const show = showRes.rows[0];

    // Find next upcoming slot
    const slotRes = await neonQuery(
      `SELECT starts_at, ends_at
       FROM show_slots
       WHERE show_id = $1 AND ends_at > NOW() AND status != 'cancelled'
       ORDER BY starts_at ASC
       LIMIT 1;`,
      [show.id]
    );

    let startUtc: Date;
    let endUtc: Date;

    if (slotRes.rows && slotRes.rows.length > 0) {
      startUtc = new Date(slotRes.rows[0].starts_at);
      endUtc = new Date(slotRes.rows[0].ends_at);
    } else {
      // Default to today or tomorrow
      startUtc = new Date(Date.now() + 3600 * 1000);
      endUtc = new Date(startUtc.getTime() + (Number(show.default_duration_min) || 120) * 60 * 1000);
    }

    const nowStr = formatIcsDateTime(new Date());
    const startStr = formatIcsDateTime(startUtc);
    const endStr = formatIcsDateTime(endUtc);
    const cleanTitle = (show.title || "GOODLIFE Show").replace(/[\\;,]/g, "");
    const cleanDj = (show.dj_name || "Resident DJ").replace(/[\\;,]/g, "");
    const cleanDesc = (show.description || "Tune in live to GOODLIFE Radio 254.").replace(/[\r\n]+/g, "\\n");

    let rruleLine = "";
    if (show.recurrence_pattern === "weekly") {
      rruleLine = "RRULE:FREQ=WEEKLY\r\n";
    } else if (show.recurrence_pattern === "daily") {
      rruleLine = "RRULE:FREQ=DAILY\r\n";
    }

    const host = req.headers.get("host") || "tickets.goodlife";
    const appUrl = (process.env.APP_URL || `https://${host}`).replace(/\/$/, "");
    const domain = host.split(":")[0] || "radio.local";

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//GOODLIFE Radio 254//Nairobi//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:show-${show.id}-${startStr}@${domain}`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      rruleLine.trim(),
      `SUMMARY:${cleanTitle} with ${cleanDj}`,
      `DESCRIPTION:${cleanDesc}\\n\\nListen live at ${appUrl}/radio`,
      "LOCATION:GOODLIFE Radio 254 (Online)",
      `URL:${appUrl}/radio/shows/${show.slug}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n");

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${show.slug}.ics"`,
        "Cache-Control": "public, s-maxage=3600",
      },
    });
  } catch (err: any) {
    return new NextResponse("Server Error", { status: 500 });
  }
}
