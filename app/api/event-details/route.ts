import { NextRequest, NextResponse } from "next/server";
import { fetchEventDetails, updateEventDetails } from "@/lib/supabase-db";
import { requireAdmin } from "@/lib/admin-auth";
import { verifyAdminSession } from "@/lib/admin-session";
import { PUBLIC_EVENT_DETAILS_FIELDS } from "@/lib/event-details-public";

export const dynamic = "force-dynamic";

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
