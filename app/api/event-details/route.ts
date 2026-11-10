import { NextRequest, NextResponse } from "next/server";
import { fetchEventDetails, updateEventDetails } from "@/lib/supabase-db";
import { requireAdmin } from "@/lib/admin-auth";
import { verifyAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

const PUBLIC_EVENT_DETAILS_FIELDS = [
  "id",
  "title",
  "subtitle",
  "tag",
  "venue",
  "till_number",
  "flyer_url",
  "regulations",
  "ticker_text",
  "logo_url",
  "event_date",
  "maps_url",
  "footer_title",
  "footer_legal",
  "payment_contact",
  "event_id",
  "whatsapp_message",
  "status",
  "is_active",
  "category",
  "recurrence_pattern",
  "recurrence_day",
  "recurrence_time",
  "custom_schedule_text",
  "sales_open_date",
  "sales_close_date",
  "next_event_title",
  "recap_video_url",
  "video_url",
  "story_media",
  "max_tent_inventory",
  "max_shared_beds",
] as const;

export async function GET(request: NextRequest) {
  try {
    const details = await fetchEventDetails();
    if (!details || typeof details !== "object") {
      return NextResponse.json(details, {
        headers: { "Cache-Control": "private, no-cache" }
      });
    }

    // If request carries a valid admin session, return full details (including gate_pin & budget)
    const adminCookie = request.cookies.get("goodlife_admin_session")?.value;
    if (adminCookie && (await verifyAdminSession(adminCookie))) {
      return NextResponse.json(details, {
        headers: {
          "Cache-Control": "private, no-store, must-revalidate",
          "Vary": "Cookie"
        }
      });
    }

    // Public response: strictly project onto the public allowlist
    const publicDetails: Record<string, any> = {};
    for (const key of PUBLIC_EVENT_DETAILS_FIELDS) {
      if (key in details) {
        publicDetails[key] = (details as any)[key];
      }
    }

    return NextResponse.json(publicDetails, {
      headers: {
        "Cache-Control": "public, s-maxage=10, must-revalidate",
        "Vary": "Cookie"
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  try {
    const body = await request.json();
    const updated = await updateEventDetails(body);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
