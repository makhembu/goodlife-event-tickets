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
  try {
    const { fetchEventDetails } = await import("@/lib/supabase-db");
    const ed = await fetchEventDetails();
    if (ed) {
      eventTitle = ed.title || eventTitle;
      eventVenue = ed.venue || eventVenue;
      eventSubtitle = ed.subtitle?.replace("|", "-") || eventSubtitle;
      eventRegs = ed.regulations?.replace(/\n/g, " | ") || eventRegs;
    }
  } catch {}

  const formattedPhone = phoneNumber.replace(/[^0-9]/g, "");
  const pdfUrl = `${appUrl}/api/tickets/${ticketId}/download`;
  const messageText = `*${eventTitle} TICKET SECURED!* 🎫✨\n\nTicket Confirmed for ${eventTitle} ${eventSubtitle}.\n\n📄 *Ticket ID:* ${ticketId}\n📲 *Phone:* ${phoneNumber}\n\n👉 *Download PDF Ticket:* ${pdfUrl}\n\nPresent the PDF QR Code at the entry for digital scanning.\n\n*REGULATIONS:*\n📍 VENUE: ${eventVenue}\n${eventRegs}`;

  try {
    const isWhapi = url.includes("whapi.cloud");
    const isOpenWA = !isWhapi && apiKey?.startsWith("owa_");

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
    } else {
      if (apiKey) {
        headers["X-API-KEY"] = apiKey;
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      bodyData = {
        phone: formattedPhone,
        message: messageText,
        mediaUrl: pdfUrl,
        fileName: `GOODLIFE-TICKET-${ticketId}.pdf`,
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
