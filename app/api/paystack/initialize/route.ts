import { NextRequest, NextResponse } from "next/server";
import { createPendingPayment, fetchTicketTiers } from "@/lib/supabase-db";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API = "https://api.paystack.co";

export async function POST(request: NextRequest) {
  try {
    const { email, phone_number, ticket_type, buyer_name, quantity = 1 } = await request.json();

    if (!email || !phone_number || !ticket_type || !buyer_name) {
      return NextResponse.json(
        { error: "Email, phone number, ticket type, and buyer name are required." },
        { status: 400 }
      );
    }

    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Paystack not configured — missing PAYSTACK_SECRET_KEY." },
        { status: 500 }
      );
    }

    const allTiers = await fetchTicketTiers();
    const matchedTier = allTiers.find(t => t.id === ticket_type);
    if (!matchedTier) {
      return NextResponse.json({ error: "Invalid ticket type selected." }, { status: 400 });
    }
    const cost = matchedTier.price * quantity;
    const amountInKobo = Math.round(cost * 100);

    const reference = "GL-" + Math.random().toString(36).substring(2, 12).toUpperCase();

    await createPendingPayment({
      checkout_request_id: reference,
      phone_number,
      ticket_type,
      quantity: Number(quantity),
      buyer_name,
      amount: cost,
    });

    const paystackRes = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountInKobo,
        currency: "KES",
        reference,
        channels: ["mpesa"],
        mobile_money: {
          phone: phone_number,
          provider: "mpesa",
        },
        metadata: {
          ticket_type,
          quantity: Number(quantity),
          buyer_name,
          phone_number,
        },
      }),
    });

    const data = await paystackRes.json();

    if (!data.status) {
      console.error("Paystack initialize error:", data);
      return NextResponse.json(
        { error: data.message || "Paystack STK Push initialization failed." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      reference: data.data.reference,
      amount: cost,
      status: data.data.status,
    });
  } catch (error: any) {
    console.error("Paystack initialize exception:", error);
    return NextResponse.json(
      { error: "Paystack STK Push failed: " + error.message },
      { status: 500 }
    );
  }
}
