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

const headers = {
  "apikey": apiKey,
  "Content-Type": "application/json"
};

async function createInstance() {
  const baseUrl = url.replace(/\/+$/, "");
  console.log(`Creating WhatsApp instance: ${sessionId} on ${baseUrl}...`);
  try {
    const res = await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        instanceName: sessionId,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS"
      })
    });
    console.log(`Response status: ${res.status}`);
    const data = await res.json();
    console.log("Response body:", JSON.stringify(data, null, 2));

    if (data.qrcode && data.qrcode.base64) {
      console.log("\n==================================================");
      console.log("QR CODE GENERATED SUCCESSFULY!");
      console.log("Please scan the QR code via your WhatsApp Linked Devices.");
      console.log("Base64 string is available in the payload.");
      console.log("==================================================\n");
    }
  } catch (err) {
    console.error("Instance creation failed:", err.message);
  }
}

createInstance();
