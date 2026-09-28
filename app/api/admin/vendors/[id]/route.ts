import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getVendorById, updateVendor, fetchOperatorsForVendor, updateOperator, createOperator } from "@/lib/supabase-db";
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

  const vendor = await getVendorById(vendorId);
  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  const operators = await fetchOperatorsForVendor(vendorId);
  return NextResponse.json({ ...vendor, vendor_operators: operators });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleVendorUpdate(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleVendorUpdate(request, context);
}

async function handleVendorUpdate(
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
    const existingVendor = await getVendorById(vendorId);
    if (!existingVendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      name,
      contact_phone,
      contact_name,
      logo_url,
      status,
      rotatePinOnPhoneChange = false,
    } = body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (contact_name !== undefined) updates.contact_name = contact_name;
    if (contact_phone !== undefined) updates.contact_phone = contact_phone;
    if (logo_url !== undefined) updates.logo_url = logo_url;
    if (status !== undefined) updates.status = status;

    const oldPhone = (existingVendor.contact_phone || "").trim();
    const newPhone = (contact_phone !== undefined ? contact_phone : oldPhone).trim();
    const phoneChanged = oldPhone !== newPhone && newPhone.length > 0;

    const updatedVendor = await updateVendor(vendorId, updates);

    let pinRotated = false;
    let newPin: string | undefined = undefined;
    let whatsAppSent = false;

    // Check GAP 24: If contact_phone is changed AND rotatePinOnPhoneChange is true
    if (phoneChanged && rotatePinOnPhoneChange) {
      newPin = String(1000 + randomInt(9000));
      const operators = await fetchOperatorsForVendor(vendorId);

      let targetOperator: any = null;
      if (operators.length > 0) {
        targetOperator = operators[0];
        await updateOperator(targetOperator.id, { pin: newPin });
        targetOperator.pin = newPin;
      } else {
        targetOperator = await createOperator({
          vendor_id: vendorId,
          name: updatedVendor?.contact_name || updatedVendor?.name || "Operator",
          pin: newPin,
          role: "cashier",
        });
      }

      pinRotated = true;

      // Dispatch WhatsApp to new phone
      if (newPhone) {
        const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
        const loginUrl = appUrl ? `${appUrl}/vendor/login` : "/vendor/login";
        const messageText = `*GOODLIFE FESTIVAL - VENDOR CREDENTIAL NOTICE*\n` +
          `Vendor: ${updatedVendor?.name || existingVendor.name}\n` +
          `Operator: ${targetOperator.name}\n` +
          `New POS PIN: ${newPin}\n\n` +
          `Your contact phone was updated. A new PIN has been assigned to your POS terminal. Enter this PIN at (${loginUrl}) to access your stall.`;

        whatsAppSent = await sendTextMessage(newPhone, messageText);
      }
    }

    return NextResponse.json({
      success: true,
      vendor: updatedVendor,
      pinRotated,
      newPin,
      whatsAppSent,
      message: pinRotated
        ? "Vendor updated and POS credentials rotated"
        : "Vendor updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating vendor:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update vendor" },
      { status: 500 }
    );
  }
}
