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
  console.log(`Checking connection state for Evolution instance: ${sessionId}...`);
  try {
    const res = await fetch(`${baseUrl}/instance/connectionState/${sessionId}`, {
      method: "GET",
      headers
    });
    console.log(`Response status: ${res.status}`);
    const data = await res.json();
    console.log("Connection State Body:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to fetch connection state:", err.message);
  }
}

run();
