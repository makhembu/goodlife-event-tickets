import { NextRequest, NextResponse } from "next/server";
import { fetchPaymentLogs, deletePaymentLog, deleteAllPaymentLogs } from "@/lib/supabase-db";

export async function GET() {
  try {
    const logs = await fetchPaymentLogs();
    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all");

    if (all === "true") {
      const ok = await deleteAllPaymentLogs();
      return NextResponse.json({ success: ok });
    }

    if (!id) {
      return NextResponse.json({ error: "Missing ?id= or ?all=true" }, { status: 400 });
    }

    const ok = await deletePaymentLog(Number(id));
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
