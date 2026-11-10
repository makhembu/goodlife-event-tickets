import { NextRequest, NextResponse } from "next/server";
import { POST as handleVendorVoidSale } from "./void/route";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ saleId: string }> }
) {
  return handleVendorVoidSale(request, context);
}
