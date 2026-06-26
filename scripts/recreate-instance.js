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

async function run() {
  const baseUrl = url.replace(/\/+$/, "");
  
  // 1. Delete instance
  console.log(`Deleting WhatsApp instance: ${sessionId}...`);
  try {
    const res = await fetch(`${baseUrl}/instance/delete/${sessionId}`, {
      method: "DELETE",
      headers
    });
    console.log(`Delete response status: ${res.status}`);
    const data = await res.json().catch(() => ({}));
    console.log("Delete response:", data);
  } catch (err) {
    console.error("Delete failed:", err.message);
  }

  // 2. Create instance
  console.log(`Re-creating WhatsApp instance: ${sessionId}...`);
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
    console.log(`Create response status: ${res.status}`);
    const data = await res.json();
    console.log("Create response keys:", Object.keys(data));
    if (data.qrcode && data.qrcode.base64) {
      console.log("New QR Code generated successfully!");
    } else {
      console.log("Create response body:", JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error("Create failed:", err.message);
  }
}

run();
