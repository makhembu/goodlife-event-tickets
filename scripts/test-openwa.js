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

const url = process.env.WHATSAPP_GATEWAY_URL || "https://openwa-api-production-2ef8.up.railway.app";
const apiKey = process.env.WHATSAPP_API_KEY || "owa_k1_07f9edb397f3da46be36feb9f777bb196bf09f0e9ad76ac5d55586fb653196d1";
const sessionId = process.env.WHATSAPP_SESSION_ID;
const appUrl = process.env.APP_URL || "https://demo-porter-suddenly-organisms.trycloudflare.com";

const headers = {
  "x-api-key": apiKey,
  "Content-Type": "application/json"
};

async function run() {
  const baseUrl = url.replace(/\/+$/, "");
  const webhookUrl = `${appUrl}/api/whatsapp/webhook`;
  
  console.log(`OpenWA Session: ${sessionId}`);
  console.log(`Webhook URL target: ${webhookUrl}`);

  // 1. Check session state
  try {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`, { headers });
    console.log(`Session status response [${res.status}]:`);
    const statusData = await res.json();
    console.log(JSON.stringify(statusData, null, 2));
  } catch (err) {
    console.error("Error fetching session state:", err);
  }

  // 2. Register/set webhooks
  try {
    console.log(`Setting/registering webhook on OpenWA gateway...`);
    const regRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/webhooks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: webhookUrl,
        events: ["message.received", "message.sent", "message.ack", "message.failed"]
      })
    });
    console.log(`Register webhook response [${regRes.status}]:`);
    const regData = await regRes.json();
    console.log(JSON.stringify(regData, null, 2));
  } catch (err) {
    console.error("Error registering webhook:", err);
  }
}

run();
