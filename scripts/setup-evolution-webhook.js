const fs = require("fs");
const path = require("path");

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

const url = process.env.WHATSAPP_GATEWAY_URL || "https://evolution-api-production-2634f.up.railway.app";
const apiKey = process.env.WHATSAPP_API_KEY;
const sessionId = process.env.WHATSAPP_SESSION_ID || "goodlife-tickets";
const appUrl = process.env.APP_URL || "https://demo-porter-suddenly-organisms.trycloudflare.com";

const headers = {
  "apikey": apiKey,
  "Content-Type": "application/json"
};

async function setupWebhook() {
  const baseUrl = url.replace(/\/+$/, "");
  const webhookUrl = `${appUrl}/api/whatsapp/webhook`;
  
  console.log(`Setting webhook for instance: ${sessionId} to target: ${webhookUrl}...`);
  try {
    const res = await fetch(`${baseUrl}/webhook/set/${sessionId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhook_by_events: false,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "CONNECTION_UPDATE"
          ]
        }
      })
    });
    console.log(`Response status: ${res.status}`);
    const data = await res.json();
    console.log("Response body:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Webhook setup failed:", err.message);
  }
}

setupWebhook();
