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

async function fetchRaw() {
  const baseUrl = url.replace(/\/+$/, "");
  try {
    const res = await fetch(`${baseUrl}/instance/connect/${sessionId}`, { headers });
    const data = await res.json();
    console.log("Raw Response Keys:", Object.keys(data));
    console.log("Raw Response body:", JSON.stringify({ ...data, qrcode: data.qrcode ? { ...data.qrcode, base64: "[TRUNCATED]" } : null }, null, 2));
  } catch (err) {
    console.error("Failed:", err.message);
  }
}

fetchRaw();
