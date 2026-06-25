import { NextRequest, NextResponse } from "next/server";
import { createTicket, fetchPendingPayment, insertPaymentLog } from "@/lib/supabase-db";
import { sendTicketViaWhatsApp } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    console.log("M-Pesa Callback Webhook invoked with body:", JSON.stringify(rawBody));

    let mpesa_receipt = "";
    let phone_number = "";
    let amount_paid = 0;
    let ticket_type = "ADV 500"; 
    let buyer_name = "Guest";
    let quantity = 1;
    let checkoutRequestId = "";

    // Decode the Safaricom standard Daraja STK callback payload
    const callbackObj = rawBody.Body?.stkCallback;
    if (!callbackObj) {
      return NextResponse.json({ error: "Invalid Daraja payload structural schema" }, { status: 400 });
    }

    checkoutRequestId = callbackObj.CheckoutRequestID;

    if (callbackObj.ResultCode !== 0) {
      console.warn(`Safaricom STK payment was cancelled or failed with ResultCode ${callbackObj.ResultCode}: ${callbackObj.ResultDesc}`);
      await insertPaymentLog({
        checkout_request_id: checkoutRequestId,
        status: "failed",
        result_desc: callbackObj.ResultDesc || `ResultCode ${callbackObj.ResultCode}`,
        raw_payload: rawBody
      });
      try {
        const { Pool } = require("pg");
        const _pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false }
        });
        await _pool.query("UPDATE pending_payments SET status = 'failed' WHERE checkout_request_id = $1", [checkoutRequestId]);
        await _pool.end();
      } catch (e) {
        console.error("Failed to mark pending_payment as failed:", e);
      }
      return NextResponse.json({ message: "STK Push failed transaction recorded." });
    }

    // Extract details from CallbackMetadata array
    const items = callbackObj.CallbackMetadata?.Item || [];
    items.forEach((item: any) => {
      if (item.Name === "Amount") {
        amount_paid = Number(item.Value);
      } else if (item.Name === "MpesaReceiptNumber") {
        mpesa_receipt = String(item.Value).trim().toUpperCase();
      } else if (item.Name === "PhoneNumber") {
        phone_number = String(item.Value).trim();
      }
    });

    // Query pending payments to fetch quantity and buyer name
    if (checkoutRequestId) {
      const pending = await fetchPendingPayment(checkoutRequestId);
      if (pending) {
        quantity = pending.quantity;
        buyer_name = pending.buyer_name;
        ticket_type = pending.ticket_type;
      }
    }

    // Fallback ticket resolver if no pending payment found
    if (buyer_name === "Guest" && quantity === 1) {
      if (amount_paid === 2500) {
        ticket_type = "2PX CAMPING";
      } else if (amount_paid === 2400) {
        ticket_type = "4PX CAMPING";
      } else if (amount_paid === 3000) {
        ticket_type = "6PX 3000";
      } else {
        ticket_type = "ADV 500";
      }
    }

    // Log the successful payment to DB
    await insertPaymentLog({
      checkout_request_id: checkoutRequestId || undefined,
      mpesa_receipt: mpesa_receipt,
      phone_number: phone_number,
      amount: amount_paid,
      status: "success",
      result_desc: "M-Pesa STK Callback Success",
      raw_payload: rawBody
    });

    if (!mpesa_receipt) {
      console.warn("Could not retrieve MpesaReceiptNumber from the transaction callback.");
      return NextResponse.json({ error: "Missing receipt number" }, { status: 400 });
    }

    const createdTickets = [];
    const perTicketAmount = amount_paid / quantity;

    // Create the confirmed tickets in Supabase (or local storage fallback)
    for (let i = 1; i <= quantity; i++) {
      const ticketId = quantity === 1 ? `GL-${mpesa_receipt}` : `GL-${mpesa_receipt}-${i}`;
      
      const confirmedTicket = await createTicket({
        id: ticketId,
        mpesa_receipt: mpesa_receipt,
        phone_number: phone_number,
        ticket_type: ticket_type,
        amount_paid: perTicketAmount,
        buyer_name: buyer_name
      });
      createdTickets.push(confirmedTicket);
    }

    // Update pending_payments so the frontend polling can see it completed
    if (checkoutRequestId) {
      if (typeof window === "undefined") {
        try {
          const { Pool } = require("pg");
          const _pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          });
          await _pool.query("UPDATE pending_payments SET status = 'completed', ticket_id = $1 WHERE checkout_request_id = $2", [createdTickets[0].id, checkoutRequestId]);
          await _pool.end();
        } catch (e) {
          console.error("Failed to update pending_payments status:", e);
        }
      }
    }

    console.log(`Successfully verified and saved ${createdTickets.length} GOODLIFE tickets:`, createdTickets);

    // Call WhatsApp Dispatcher Service asynchronously for each ticket
    for (const ticket of createdTickets) {
      try {
        await sendTicketViaWhatsApp(ticket.id, phone_number);
      } catch (wsErr) {
        console.error(`WhatsApp delivery failed for ticket ${ticket.id}:`, wsErr);
      }
    }

    return NextResponse.json({
      success: true,
      tickets: createdTickets,
      ticket: createdTickets[0], // Return the first ticket for UI download compatibility
      message: `${quantity} webhooks processed, receipt stored, and WhatsApp dispatch initiated.`
    }, { status: 200 });

  } catch (error: any) {
    console.error("M-Pesa callback handler error:", error);
    return NextResponse.json({ error: "Internal processing error: " + error.message }, { status: 500 });
  }
}
