import { NextRequest, NextResponse } from "next/server";
import { createPendingPayment, fetchEventDetails, fetchTicketTiers } from "@/lib/supabase-db";

export async function POST(request: NextRequest) {
  try {
    const { phone_number, ticket_type, buyer_name, quantity = 1, simulate = false } = await request.json();

    if (!phone_number || !ticket_type || !buyer_name) {
      return NextResponse.json(
        { error: "Phone number (254XXXXXXXX), Ticket Type, and Buyer Name are required." },
        { status: 400 }
      );
    }

    // Standard phone formatting: e.g. 0712345678 -> 254712345678 or +254... -> 254...
    let cleanPhone = phone_number.replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "254" + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith("7") || cleanPhone.startsWith("1") || cleanPhone.startsWith("8")) {
      cleanPhone = "254" + cleanPhone;
    }

    if (cleanPhone.length !== 12 || !cleanPhone.startsWith("254")) {
      return NextResponse.json(
        { error: "Invalid Kenyan phone number format. Must start with 254 or 07/01/08." },
        { status: 400 }
      );
    }

    // Look up price from DB ticket tiers
    const allTiers = await fetchTicketTiers();
    const matchedTier = allTiers.find(t => t.id === ticket_type);
    if (!matchedTier) {
      return NextResponse.json({ error: "Invalid ticket type selected." }, { status: 400 });
    }
    const singleCost = matchedTier.price;

    const cost = singleCost * quantity;

    // Grab credentials — fail loudly if missing, no sandbox fallbacks
    const consumerKey = process.env.DARAJA_CONSUMER_KEY;
    const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
    const shortcode = process.env.DARAJA_SHORTCODE;
    const passkey = process.env.DARAJA_PASSKEY;
    const darajaEnv = process.env.DARAJA_ENVIRONMENT || "sandbox";
    const baseUrl = darajaEnv === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
    const callbackUrl = process.env.DARAJA_CALLBACK_URL;

    // Fetch event settings to see if developer simulators are allowed
    const eventDetails = await fetchEventDetails();

    // Detection for placeholder settings
    const isMockCredentials = 
      !consumerKey || 
      consumerKey.includes("your_key") || 
      consumerSecret?.includes("your_secret") || 
      simulate;

    if (isMockCredentials) {
      if (eventDetails && eventDetails.simulators_enabled === false) {
        return NextResponse.json(
          { error: "Developer Sandbox Simulation Mode is disabled by Admin." },
          { status: 400 }
        );
      }

      // In simulation mode, return mock Daraja outcome
      const mockCheckoutID = "ws_CO_" + Math.random().toString(36).substring(2, 12).toUpperCase() + "_SIM";
      
      // Store in pending payments
      await createPendingPayment({
        checkout_request_id: mockCheckoutID,
        phone_number: cleanPhone,
        ticket_type: ticket_type,
        quantity: Number(quantity),
        buyer_name: buyer_name,
        amount: cost
      });

      return NextResponse.json({
        success: true,
        simulation: true,
        MerchantRequestID: "SIM-" + Math.floor(Math.random() * 100000),
        CheckoutRequestID: mockCheckoutID,
        ResponseCode: "0",
        ResponseDescription: "Success. Request accepted for processing in SIMULATION mode.",
        amount: cost,
        phoneNumber: cleanPhone,
        ticketType: ticket_type
      });
    }

    if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
      return NextResponse.json(
        { error: "Daraja API not configured — missing DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_SHORTCODE, or DARAJA_PASSKEY." },
        { status: 500 }
      );
    }

    // 1. Fetch Daraja Access Token
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    const tokenResponse = await fetch(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${auth}`
        }
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(`Failed to retrieve Daraja token: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. Build STK Push parameters
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14); // YYYYMMDDHHMMSS
    
    // Safaricom Sandbox/Production Password
    const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");

    const stkPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline", // Sandbox STK prefers CustomerPayBillOnline
      Amount: cost,
      PartyA: cleanPhone,
      PartyB: shortcode,
      PhoneNumber: cleanPhone,
      CallBackURL: callbackUrl,
      AccountReference: "GOODLIFE",
      TransactionDesc: `GOODLIFE ${ticket_type} Purchase`
    };

    console.log("Dispatching real Daraja STK Push Request...", stkPayload);

    const stkResponse = await fetch(
      `${baseUrl}/mpesa/stkpush/v1/processrequest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(stkPayload)
      }
    );

    const resData = await stkResponse.json();
    console.log("Daraja Response:", resData);

    if (resData.ResponseCode === "0") {
      // Store in pending payments
      await createPendingPayment({
        checkout_request_id: resData.CheckoutRequestID,
        phone_number: cleanPhone,
        ticket_type: ticket_type,
        quantity: Number(quantity),
        buyer_name: buyer_name,
        amount: cost
      });

      return NextResponse.json({
        success: true,
        simulation: false,
        MerchantRequestID: resData.MerchantRequestID,
        CheckoutRequestID: resData.CheckoutRequestID,
        ResponseCode: resData.ResponseCode,
        ResponseDescription: resData.ResponseDescription,
        amount: cost,
        phoneNumber: cleanPhone,
        ticketType: ticket_type
      });
    } else {
      return NextResponse.json({
        success: false,
        error: resData.ResponseDescription || "Daraja STK push request failed.",
        raw: resData
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error("Daraja exception:", error);
    return NextResponse.json(
      { error: "STK Push Dispatch Failed: " + error.message },
      { status: 500 }
    );
  }
}
