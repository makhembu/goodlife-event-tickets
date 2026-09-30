import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getVendorById, fetchOperatorsForVendor, updateOperator, createOperator } from "@/lib/supabase-db";
import { sendTextMessage } from "@/lib/whatsapp";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminSession = request.cookies.get("goodlife_admin_session")?.value;
  if (adminSession !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) {
    return NextResponse.json({ error: "Invalid vendor ID" }, { status: 400 });
  }

  try {
    const operators = await fetchOperatorsForVendor(vendorId);
    return NextResponse.json({
      success: true,
      vendorId,
      operators: operators.map(op => ({
        id: op.id,
        name: op.name,
        role: op.role,
        pin: op.pin,
        is_active: op.is_active
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch PINs" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handlePinReset(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handlePinReset(request, context);
}

async function handlePinReset(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // 1. Authenticate admin session
  const adminSession = request.cookies.get("goodlife_admin_session")?.value;
  if (adminSession !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Resolve params.id (vendorId)
  const { id } = await context.params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) {
    return NextResponse.json({ error: "Invalid vendor ID" }, { status: 400 });
  }

  try {
    const vendor = await getVendorById(vendorId);
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    let { operatorId, newPin, sendWhatsApp = true } = body;

    // 3. If newPin is not provided, generate a cryptographically random 4-digit PIN (1000-9999)
    if (!newPin || typeof newPin !== "string" || !/^\d{4}$/.test(newPin.trim())) {
      newPin = String(1000 + randomInt(9000));
    } else {
      newPin = newPin.trim();
    }

    // 4. Resolve operator to update
    let targetOperator: any = null;
    const operators = await fetchOperatorsForVendor(vendorId);

    if (operatorId) {
      const parsedOpId = Number(operatorId);
      targetOperator = operators.find((op) => op.id === parsedOpId);
      if (!targetOperator) {
        // Operator might be inactive or not found
        return NextResponse.json({ error: "Operator not found for this vendor" }, { status: 404 });
      }
      await updateOperator(targetOperator.id, { pin: newPin });
      targetOperator.pin = newPin;
    } else if (operators.length > 0) {
      // Update primary operator
      targetOperator = operators[0];
      await updateOperator(targetOperator.id, { pin: newPin });
      targetOperator.pin = newPin;
    } else {
      // If no operators exist yet, create a default primary operator for the vendor
      targetOperator = await createOperator({
        vendor_id: vendorId,
        name: vendor.contact_name || vendor.name,
        pin: newPin,
        role: "cashier"
      });
    }

    // 5. If sendWhatsApp is true, dispatch WhatsApp message
    let whatsAppSent = false;
    if (sendWhatsApp && vendor.contact_phone) {
      const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
      const loginUrl = appUrl ? `${appUrl}/vendor/login` : "/vendor/login";
      const messageText = `*GOODLIFE FESTIVAL - VENDOR CREDENTIAL NOTICE*\n` +
        `Vendor: ${vendor.name}\n` +
        `Operator: ${targetOperator.name}\n` +
        `New POS PIN: ${newPin}\n\n` +
        `Keep this PIN secure. Enter this PIN at the Vendor Terminal (${loginUrl}) to access your POS stall.`;

      whatsAppSent = await sendTextMessage(vendor.contact_phone, messageText);
    }

    return NextResponse.json({
      success: true,
      pin: newPin,
      operatorId: targetOperator.id,
      operatorName: targetOperator.name,
      whatsAppSent,
      message: "PIN reset successfully"
    });
  } catch (error: any) {
    console.error("Error resetting vendor PIN:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reset PIN" },
      { status: 500 }
    );
  }
}
