/**
 * Shared WhatsApp gateway configuration and session resolver.
 * Priority: WAHA_* then WHATSAPP_GATEWAY_* then hardcoded defaults.
 * Defaults session to "default" so all dispatcher and console paths align.
 */
export function getWhatsAppConfig() {
  const url = (
    process.env.WAHA_BASE_URL ||
    process.env.WHATSAPP_GATEWAY_URL ||
    "https://waha.darajadigital.com"
  ).replace(/\/+$/, "");

  const apiKey =
    process.env.WAHA_API_KEY ||
    process.env.WHATSAPP_API_KEY ||
    "goodlife_waha_secret_2026";

  const sessionId =
    process.env.WAHA_SESSION_ID ||
    process.env.WHATSAPP_SESSION_ID ||
    "default";

  return { url, apiKey, sessionId };
}

export async function sendTicketViaWhatsApp(
  ticketId: string,
  phoneNumber: string,
  buyerName?: string
) {
  const { url, apiKey, sessionId } = getWhatsAppConfig();
  const appUrl = process.env.APP_URL || "";

  if (!url) {
    console.warn("WhatsApp gateway URL not configured. Skipping automated delivery dispatcher.");
    return false;
  }

  let eventTitle = "GOODLIFE";
  let eventVenue = "Marara Camp, Thika Landless";
  let eventSubtitle = "";
  let eventRegs = "NO DRINKS FROM OUTSIDE | STRICTLY 18+";
  let eventMapsUrl = "https://www.google.com/maps/search/?api=1&query=Marara+Camp+Ventures+Thika";
  let whatsappTemplate = "";
  try {
    const { fetchEventDetails } = await import("@/lib/supabase-db");
    const ed = await fetchEventDetails();
    if (ed) {
      eventTitle = ed.title || eventTitle;
      eventVenue = ed.venue || eventVenue;
      eventSubtitle = ed.subtitle?.replace("|", "-") || eventSubtitle;
      eventRegs = ed.regulations?.replace(/\n/g, " | ") || eventRegs;
      eventMapsUrl = ed.maps_url || eventMapsUrl;
      whatsappTemplate = ed.whatsapp_message || "";
    }
  } catch (err) {
    console.warn("Failed to load event details for operator notifications:", err);
  }

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
      .replace(/\{\{ticketId\}\}/gi, ticketId)
      .replace(/\{\{phoneNumber\}\}/gi, phoneNumber)
      .replace(/\{\{pdfUrl\}\}/gi, pdfUrl)
      .replace(/\{\{eventTitle\}\}/gi, eventTitle)
      .replace(/\{\{eventSubtitle\}\}/gi, eventSubtitle)
      .replace(/\{\{eventVenue\}\}/gi, eventVenue)
      .replace(/\{\{eventMapsUrl\}\}/gi, eventMapsUrl)
      .replace(/\{\{buyerName\}\}/gi, buyerName || "")
    .replace(/\{\{eventRegulations\}\}/gi, eventRegs);
  } else {
    messageText = `*${eventTitle} TICKET CONFIRMED*\n\nTicket ID: ${ticketId}\nAttendee: ${buyerName || "—"}\nPhone: ${phoneNumber}\nEvent: ${eventTitle} ${eventSubtitle}\nVenue: ${eventVenue}\n📍 Directions: ${eventMapsUrl}\n\nDownload the ticket PDF here: ${pdfUrl}\n\nREGULATIONS:\n${eventRegs}`;
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
      targetUrl = `${baseUrl}/api/sendText`;
      headers["X-Api-Key"] = apiKey || "";

      bodyData = {
        chatId: `${formattedPhone}@c.us`,
        session: sessionId || "default",
        text: messageText,
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
  const { url, apiKey, sessionId } = getWhatsAppConfig();
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

  let eventDetails: any = null;
  try {
    const { fetchEventDetails } = await import("@/lib/supabase-db");
    eventDetails = await fetchEventDetails();
  } catch (err) {
    console.warn("Failed to load event details for operator broadcast check:", err);
  }

  if (eventDetails?.operator_notifications_enabled === false) {
    console.log("Operator notifications are disabled in event settings. Skipping operator broadcast.");
    return;
  }

  const defaultOperatorTemplate = `*NEW TICKET SECURED*\n\nBuyer: {{buyerName}}\nTicket Type: {{ticketType}} (Qty: {{quantity}})\nAmount Paid: KES {{amountPaid}}\nReference/ID: {{reference}}`;
  const operatorTemplate = eventDetails?.whatsapp_operator_template || defaultOperatorTemplate;
  const messageText = operatorTemplate
    .replace(/\{\{buyerName\}\}/gi, buyerName)
    .replace(/\{\{ticketType\}\}/gi, ticketType)
    .replace(/\{\{quantity\}\}/gi, String(quantity))
    .replace(/\{\{amountPaid\}\}/gi, String(amountPaid))
    .replace(/\{\{reference\}\}/gi, reference);

  const isWhapi = url.includes("whapi.cloud");
  const isOpenWA = !isWhapi && apiKey?.startsWith("owa_");
  const isWaha = !isWhapi && !isOpenWA && (process.env.WHATSAPP_GATEWAY_TYPE === "waha" || url.includes("waha") || url.includes("compassionate-optimism"));

  console.log(`Broadcasting alert to ${operators.length} operators...`);

  for (const operatorPhone of operators) {
    try {
      if (isOpenWA) {
        const baseUrl = url.replace(/\/+$/, "");
        const sid = sessionId || "session";
        const targetUrl = `${baseUrl}/api/sessions/${sid}/messages/send-text`;
        const headers = {
          "x-api-key": apiKey || "",
          "Content-Type": "application/json"
        };
        const bodyData = {
          chatId: `${operatorPhone}@c.us`,
          text: messageText
        };
        
        const response = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyData)
        });

        if (!response.ok) {
          console.warn(`Failed to send operator notification to ${operatorPhone}: HTTP ${response.status}`);
        }
      } else if (isWaha) {
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

/**
 * Send a free-form text message to all configured operators (OPERATOR_WHATSAPP_NUMBERS).
 * Used for system alerts (e.g., low PayHero fee float) as well as purchase broadcasts.
 */
export async function sendOperatorText(messageText: string) {
  const { url, apiKey, sessionId } = getWhatsAppConfig();
  const operatorsEnv = process.env.OPERATOR_WHATSAPP_NUMBERS;

  if (!url || !operatorsEnv) return;

  const operators = operatorsEnv
    .split(",")
    .map(n => n.trim().replace(/[^0-9]/g, ""))
    .filter(n => n.length > 0);
  if (operators.length === 0) return;

  const isWhapi = url.includes("whapi.cloud");
  const isOpenWA = !isWhapi && apiKey?.startsWith("owa_");
  const isWaha = !isWhapi && !isOpenWA && (process.env.WHATSAPP_GATEWAY_TYPE === "waha" || url.includes("waha") || url.includes("compassionate-optimism"));

  for (const operatorPhone of operators) {
    try {
      if (isOpenWA) {
        const baseUrl = url.replace(/\/+$/, "");
        const sid = sessionId || "session";
        await fetch(`${baseUrl}/api/sessions/${sid}/messages/send-text`, {
          method: "POST",
          headers: { "x-api-key": apiKey || "", "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: `${operatorPhone}@c.us`, text: messageText }),
        });
      } else if (isWaha) {
        const baseUrl = url.replace(/\/+$/, "");
        await fetch(`${baseUrl}/api/sendText`, {
          method: "POST",
          headers: { "X-Api-Key": apiKey || "", "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: `${operatorPhone}@c.us`, text: messageText, session: sessionId }),
        });
      } else {
        // Evolution API Configuration Fallback
        const baseUrl = url.replace(/\/+$/, "");
        await fetch(`${baseUrl}/message/sendText/${sessionId}`, {
          method: "POST",
          headers: { "apikey": apiKey || "", "Content-Type": "application/json" },
          body: JSON.stringify({ number: operatorPhone, text: messageText }),
        });
      }
    } catch (err: any) {
      console.warn(`Exception sending operator text to ${operatorPhone}:`, err.message);
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
  const { url, apiKey, sessionId } = getWhatsAppConfig();

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

  const defaultScanTemplate = `*GOODLIFE GATE ENTRY VALIDATED*\n\nTicket ID: {{ticketId}}\nAttendee: {{buyerName}}\nTicket Type: {{ticketType}}\nScanned By: {{scannerName}}\nTime: {{scanTime}}`;
  let eventDetails: any = null;
  try {
    const { fetchEventDetails } = await import("@/lib/supabase-db");
    eventDetails = await fetchEventDetails();
  } catch {}
  const scanTemplate = eventDetails?.whatsapp_scan_template || defaultScanTemplate;
  const messageText = scanTemplate
    .replace(/\{\{buyerName\}\}/gi, buyerName)
    .replace(/\{\{ticketType\}\}/gi, ticketType)
    .replace(/\{\{ticketId\}\}/gi, ticketId)
    .replace(/\{\{scannerName\}\}/gi, scannerName)
    .replace(/\{\{scanTime\}\}/gi, new Date().toLocaleTimeString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" }));

  const isWhapi = url.includes("whapi.cloud");
  const isOpenWA = !isWhapi && apiKey?.startsWith("owa_");
  const isWaha = !isWhapi && !isOpenWA && (process.env.WHATSAPP_GATEWAY_TYPE === "waha" || url.includes("waha") || url.includes("compassionate-optimism"));

  try {
    if (isOpenWA) {
      const baseUrl = url.replace(/\/+$/, "");
      const sid = sessionId || "session";
      const targetUrl = `${baseUrl}/api/sessions/${sid}/messages/send-text`;
      const headers = {
        "x-api-key": apiKey || "",
        "Content-Type": "application/json"
      };
      const bodyData = {
        chatId: `${formattedPhone}@c.us`,
        text: messageText
      };
      
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData)
      });

      return response.ok;
    } else if (isWaha) {
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

/**
 * Dispatch a generic text message via the configured WhatsApp gateway
 * (OpenWA, WAHA, Evolution API, Whapi) with Kenyan phone sanitization (254...).
 */
export async function sendTextMessage(
  phoneNumber: string,
  messageText: string
): Promise<boolean> {
  const { url, apiKey, sessionId } = getWhatsAppConfig();

  if (!url) {
    console.warn("WhatsApp gateway URL not configured. Skipping text message dispatcher.");
    return false;
  }

  let formattedPhone = phoneNumber.replace(/[^0-9]/g, "");
  if (formattedPhone.startsWith("0")) {
    formattedPhone = "254" + formattedPhone.slice(1);
  } else if (formattedPhone.startsWith("254")) {
    // International prefix already present
  } else if (formattedPhone.length === 9) {
    formattedPhone = "254" + formattedPhone;
  }

  const isWhapi = url.includes("whapi.cloud");
  const isOpenWA = !isWhapi && apiKey?.startsWith("owa_");
  const isWaha =
    !isWhapi &&
    !isOpenWA &&
    (process.env.WHATSAPP_GATEWAY_TYPE === "waha" ||
      url.includes("waha") ||
      url.includes("compassionate-optimism"));

  try {
    if (isOpenWA) {
      const baseUrl = url.replace(/\/+$/, "");
      const sid = sessionId || "goodlife-tickets";
      const targetUrl = `${baseUrl}/api/sessions/${sid}/messages/send-text`;
      const headers = {
        "x-api-key": apiKey || "",
        "Content-Type": "application/json",
      };
      const bodyData = {
        chatId: `${formattedPhone}@c.us`,
        text: messageText,
      };

      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData),
      });

      return response.ok;
    } else if (isWhapi) {
      const baseUrl = url.split("/messages")[0].replace(/\/+$/, "");
      const targetUrl = `${baseUrl}/messages/text`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      const bodyData = {
        to: formattedPhone,
        body: messageText,
      };

      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData),
      });

      return response.ok;
    } else if (isWaha) {
      const baseUrl = url.replace(/\/+$/, "");
      const targetUrl = `${baseUrl}/api/sendText`;
      const headers = {
        "X-Api-Key": apiKey || "",
        "Content-Type": "application/json",
      };
      const bodyData = {
        chatId: `${formattedPhone}@c.us`,
        text: messageText,
        session: sessionId || "default",
      };

      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData),
      });

      return response.ok;
    } else {
      // Evolution API Configuration Fallback
      const baseUrl = url.replace(/\/+$/, "");
      const instanceName = sessionId || "goodlife-tickets";
      const targetUrl = `${baseUrl}/message/sendText/${instanceName}`;
      const headers = {
        apikey: apiKey || "",
        "Content-Type": "application/json",
      };
      const bodyData = {
        number: formattedPhone,
        text: messageText,
      };

      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyData),
      });

      return response.ok;
    }
  } catch (error: any) {
    console.warn("Exception sending WhatsApp text:", error?.message || error);
    return false;
  }
}

/**
 * Backwards compatibility alias for sendTextMessage
 */
export const sendGenericWhatsAppText = sendTextMessage;

export interface TabReminderInfo {
  customer_name: string;
  customer_phone: string;
  balance: number;
  credit_limit: number;
}

/**
 * Send an itemized festival tab reminder to the customer with remote self-pay URL.
 * Formatted cleanly with emojis/caps per Festival Statement specs.
 */
export async function sendTabReminderWhatsApp(
  tab: TabReminderInfo,
  vendorName: string,
  eventTitle: string,
  payUrl: string
): Promise<boolean> {
  const message = `*GOODLIFE FESTIVAL - TAB STATEMENT*
Vendor: ${vendorName}
Event: ${eventTitle}
Attendee: ${tab.customer_name}
Outstanding Balance: KES ${Number(tab.balance).toLocaleString()} (Limit: KES ${Number(tab.credit_limit).toLocaleString()})

Clear your tab online via M-Pesa STK push:
${payUrl}

Or visit the stall to settle via cash or till. Thank you!`;

  return await sendTextMessage(tab.customer_phone, message);
}

