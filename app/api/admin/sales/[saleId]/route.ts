import { NextRequest, NextResponse } from "next/server";
import { POST as handleVoidSale } from "./void/route";
import { requireAdmin } from "@/lib/admin-auth";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ saleId: string }> }
) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  return handleVoidSale(request, context);
}
