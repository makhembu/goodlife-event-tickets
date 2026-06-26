export async function sendTicketViaWhatsApp(
  ticketId: string,
  phoneNumber: string
) {
  const url = process.env.WHATSAPP_GATEWAY_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  const sessionId = process.env.WHATSAPP_SESSION_ID || "goodlife-tickets";
  const appUrl = process.env.APP_URL || "";

  if (!url) {
    console.warn("WhatsApp gateway URL not configured. Skipping automated delivery dispatcher.");
    return false;
  }

  let eventTitle = "GOODLIFE";
  let eventVenue = "Marara Camp, Thika Landless";
  let eventSubtitle = "";
  let eventRegs = "NO DRINKS FROM OUTSIDE | STRICTLY 18+";
  let whatsappTemplate = "";
  try {
    const { fetchEventDetails } = await import("@/lib/supabase-db");
    const ed = await fetchEventDetails();
    if (ed) {
      eventTitle = ed.title || eventTitle;
      eventVenue = ed.venue || eventVenue;
      eventSubtitle = ed.subtitle?.replace("|", "-") || eventSubtitle;
      eventRegs = ed.regulations?.replace(/\n/g, " | ") || eventRegs;
      whatsappTemplate = ed.whatsapp_message || "";
    }
  } catch {}

  let formattedPhone = phoneNumber.replace(/[^0-9]/g, "");
  if (formattedPhone.startsWith("0")) {
    formattedPhone = "254" + formattedPhone.slice(1);
  } else if (formattedPhone.startsWith("254")) {
    // International prefix already
  } else if (formattedPhone.length === 9) {
    formattedPhone = "254" + formattedPhone;
  }
  const pdfUrl = `${appUrl}/api/tickets/${ticketId}/download`;

  let messageText: string;
  if (whatsappTemplate) {
    messageText = whatsappTemplate
      .replace(/\{\{ticketId\}\}/g, ticketId)
      .replace(/\{\{phoneNumber\}\}/g, phoneNumber)
      .replace(/\{\{pdfUrl\}\}/g, pdfUrl)
      .replace(/\{\{eventTitle\}\}/g, eventTitle)
      .replace(/\{\{eventSubtitle\}\}/g, eventSubtitle)
      .replace(/\{\{eventVenue\}\}/g, eventVenue)
      .replace(/\{\{eventRegulations\}\}/g, eventRegs);
  } else {
    messageText = `*${eventTitle} TICKET SECURED!* 🎫✨\n\nTicket Confirmed for ${eventTitle} ${eventSubtitle}.\n\n📄 *Ticket ID:* ${ticketId}\n📲 *Phone:* ${phoneNumber}\n\n👉 *Download PDF Ticket:* ${pdfUrl}\n\nPresent the PDF QR Code at the entry for digital scanning.\n\n*REGULATIONS:*\n📍 VENUE: ${eventVenue}\n${eventRegs}`;
  }

  try {
    const isWhapi = url.includes("whapi.cloud");
    const isOpenWA = !isWhapi && apiKey?.startsWith("owa_");
    const isWaha = !isWhapi && !isOpenWA && (process.env.WHATSAPP_GATEWAY_TYPE === "waha" || url.includes("waha") || url.includes("compassionate-optimism"));

    let targetUrl = url;
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    let bodyData: any = {};

    if (isOpenWA) {
      headers["x-api-key"] = apiKey!;

      const baseUrl = url.replace(/\/+$/, "");
      const sid = sessionId;
      const chatId = `${formattedPhone}@c.us`;

      const textRes = await fetch(`${baseUrl}/api/sessions/${sid}/messages/send-text`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          chatId,
          text: messageText,
        }),
      });

      if (textRes.ok) {
        console.log("WhatsApp text message sent successfully.");
      } else {
        const err = await textRes.text();
        console.warn(`WhatsApp text message failed [${textRes.status}]: ${err}`);
      }

      targetUrl = `${baseUrl}/api/sessions/${sid}/messages/send-document`;
      bodyData = {
        chatId,
        url: pdfUrl,
        filename: `GOODLIFE-TICKET-${ticketId}.pdf`,
        caption: messageText,
      };
    } else if (isWhapi) {
      if (!url.endsWith("/messages/document")) {
        const baseUrl = url.split("/messages")[0];
        targetUrl = `${baseUrl}/messages/document`;
      }

      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      bodyData = {
        to: formattedPhone,
        media: pdfUrl,
        filename: `GOODLIFE-TICKET-${ticketId}.pdf`,
        caption: messageText,
      };
    } else if (isWaha) {
      const baseUrl = url.replace(/\/+$/, "");
      targetUrl = `${baseUrl}/api/sendFile`;
      headers["X-Api-Key"] = apiKey || "";

      bodyData = {
        chatId: `${formattedPhone}@c.us`,
        session: sessionId || "default",
        file: {
          url: pdfUrl,
          filename: `GOODLIFE-TICKET-${ticketId}.pdf`
        },
        caption: messageText
      };
    } else {
      // Evolution API Configuration
      const baseUrl = url.replace(/\/+$/, "");
      const instanceName = sessionId || "goodlife-tickets";
      
      targetUrl = `${baseUrl}/message/sendMedia/${instanceName}`;
      headers["apikey"] = apiKey || "";
      
      bodyData = {
        number: formattedPhone,
        mediatype: "document",
        mimetype: "application/pdf",
        caption: messageText,
        media: pdfUrl,
        fileName: `GOODLIFE-TICKET-${ticketId}.pdf`
      };
    }

    console.log("Dispatching message payload to WhatsApp Gateway:", targetUrl, bodyData);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`WhatsApp Gateway response error [HTTP ${response.status}]: ${errorText}`);
      return false;
    }

    console.log("WhatsApp message dispatched successfully.");
    return true;
  } catch (error) {
    console.warn("Exceptions while invoking WhatsApp gateway:", error);
    return false;
  }
}

export async function notifyOperators(
  buyerName: string,
  ticketType: string,
  quantity: number,
  amountPaid: number,
  reference: string
) {
  const url = process.env.WHATSAPP_GATEWAY_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  const sessionId = process.env.WHATSAPP_SESSION_ID || "default";
  const operatorsEnv = process.env.OPERATOR_WHATSAPP_NUMBERS;

  if (!url || !operatorsEnv) {
    console.log("WhatsApp gateway or operator numbers not configured. Skipping operator broadcast.");
    return;
  }

  // Format operators list
  const operators = operatorsEnv
    .split(",")
    .map(n => n.trim().replace(/[^0-9]/g, ""))
    .filter(n => n.length > 0);

  if (operators.length === 0) return;

  const messageText = `🔔 *NEW TICKET SECURED!* 🎫\n\n👤 *Buyer:* ${buyerName}\n🎫 *Tier:* ${ticketType} (Qty: ${quantity})\n💵 *Amount Paid:* KES ${amountPaid}\n📄 *Reference/ID:* ${reference}`;

  const isWaha = process.env.WHATSAPP_GATEWAY_TYPE === "waha" || url.includes("waha") || url.includes("compassionate-optimism");

  console.log(`Broadcasting alert to ${operators.length} operators...`);

  for (const operatorPhone of operators) {
    try {
      if (isWaha) {
        const baseUrl = url.replace(/\/+$/, "");
        const targetUrl = `${baseUrl}/api/sendText`;
        const headers = {
          "X-Api-Key": apiKey || "",
          "Content-Type": "application/json"
        };
        const bodyData = {
          chatId: `${operatorPhone}@c.us`,
          text: messageText,
          session: sessionId
        };
        
        const response = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyData)
        });

        if (!response.ok) {
          console.warn(`Failed to send operator notification to ${operatorPhone}: HTTP ${response.status}`);
        }
      } else {
        // Evolution API Configuration Fallback
        const baseUrl = url.replace(/\/+$/, "");
        const targetUrl = `${baseUrl}/message/sendText/${sessionId}`;
        const headers = {
          "apikey": apiKey || "",
          "Content-Type": "application/json"
        };
        const bodyData = {
          number: operatorPhone,
          text: messageText
        };
        
        await fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyData)
        });
      }
    } catch (err: any) {
      console.warn(`Exception sending operator notification to ${operatorPhone}:`, err.message);
    }
  }
}

export async function sendScanNotification(
  ticketId: string,
  phoneNumber: string,
  buyerName: string,
  ticketType: string,
  scannerName: string = "Admin Guard"
) {
  const url = process.env.WHATSAPP_GATEWAY_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  const sessionId = process.env.WHATSAPP_SESSION_ID || "default";

  if (!url) {
    console.warn("WhatsApp gateway not configured. Skipping scan notification.");
    return false;
  }

  let formattedPhone = phoneNumber.replace(/[^0-9]/g, "");
  if (formattedPhone.startsWith("0")) {
    formattedPhone = "254" + formattedPhone.slice(1);
  } else if (formattedPhone.startsWith("254")) {
    // Already has country code
  } else if (formattedPhone.length === 9) {
    formattedPhone = "254" + formattedPhone;
  }

  const messageText = `🎫 *GOODLIFE ENTRY VALIDATED!* ✅\n\nYour ticket has been verified at the gate.\n\n👤 *Attendee:* ${buyerName}\n🎫 *Ticket Type:* ${ticketType}\n📄 *Ticket ID:* ${ticketId}\n💂‍♂️ *Scanned By:* ${scannerName}\n⏰ *Time:* ${new Date().toLocaleTimeString()}\n\nWelcome to GOODLIFE! Enjoy the experience! 🎉`;

  const isWaha = process.env.WHATSAPP_GATEWAY_TYPE === "waha" || url.includes("waha") || url.includes("compassionate-optimism");

  try {
    if (isWaha) {
      const baseUrl = url.replace(/\/+$/, "");
      const targetUrl = `${baseUrl}/api/sendText`;
      const headers = {
        "X-Api-Key": apiKey || "",
        "Content-Type": "application/json"
      };
      const bodyData = {
        chatId: `${formattedPhone}@c.us`,
        text: messageText,
        session: sessionId
      };
      
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData)
      });

      return response.ok;
    } else {
      // Evolution API Configuration Fallback
      const baseUrl = url.replace(/\/+$/, "");
      const targetUrl = `${baseUrl}/message/sendText/${sessionId}`;
      const headers = {
        "apikey": apiKey || "",
        "Content-Type": "application/json"
      };
      const bodyData = {
        number: formattedPhone,
        text: messageText
      };
      
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData)
      });
      return response.ok;
    }
  } catch (err: any) {
    console.warn(`Exception sending scan notification to ${phoneNumber}:`, err.message);
    return false;
  }
}
