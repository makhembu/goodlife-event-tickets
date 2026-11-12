import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getRadioTipsOverview } from "@/lib/radio/ops-service";

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  const { searchParams } = new URL(request.url);
  const presenterId = searchParams.get("presenter_id") ? Number(searchParams.get("presenter_id")) : undefined;
  const slotId = searchParams.get("slot_id") ? Number(searchParams.get("slot_id")) : undefined;
  const status = searchParams.get("status") || undefined;
  const format = searchParams.get("format");

  try {
    const data = await getRadioTipsOverview({
      presenterId,
      slotId,
      status,
      limit: format === "csv" ? 1000 : 100,
    });

    if (format === "csv") {
      const headers = ["ID", "Reference", "Status", "Amount", "Sender Name", "Presenter", "Show", "Created At", "Receipt"];
      const rows = data.tips.map((t) => [
        t.id,
        t.reference,
        t.status,
        t.amount,
        `"${(t.sender_name || "").replace(/"/g, '""')}"`,
        `"${(t.presenter_name || "").replace(/"/g, '""')}"`,
        `"${(t.show_title || "").replace(/"/g, '""')}"`,
        t.created_at,
        t.mpesa_receipt || "",
      ]);
      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="radio-tips-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[Admin Radio Tips] Error:", error);
    return NextResponse.json({ error: "Failed to load tips overview" }, { status: 500 });
  }
}
