import { NextRequest, NextResponse } from "next/server";
import {
  fetchTicketTiers,
  fetchDeletedTicketTiers,
  createTicketTier,
} from "@/lib/supabase-db";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET stays PUBLIC on purpose.
 *
 * `CheckoutClientPage` calls `fetchTicketTiers` from the browser to power the
 * editions switcher, so this endpoint has to be reachable without a session.
 * That was only safe once `fetchTicketTiers` stopped INSERTing — it used to
 * seed eight invented tiers here on an unauthenticated request.
 *
 * It is now a pure read, so the exposure is limited to price lists, which are
 * published on the checkout page anyway.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Trashed tiers are admin-only and were previously reachable by anyone.
    if (searchParams.get("deleted") === "true") {
      const unauthorized = await requireAdmin();
      if (unauthorized) return unauthorized;
      const tiers = await fetchDeletedTicketTiers();
      return NextResponse.json(tiers);
    }

    const eventIdParam = searchParams.get("eventId");
    const parsed = eventIdParam ? Number.parseInt(eventIdParam, 10) : NaN;
    const eventId = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;

    const tiers = await fetchTicketTiers(eventId);
    // An empty array is the honest answer for an event with no tiers. Callers
    // (`app/page.tsx`, the admin tiers tab) already handle it.
    return NextResponse.json(tiers, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * `middleware.ts` already rejects non-GET on this path without a session, but
 * per AGENTS.md the matcher is an explicit allowlist and handlers must not rely
 * on it alone. Belt and braces.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const tier = await createTicketTier(body);
    return NextResponse.json(tier, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}