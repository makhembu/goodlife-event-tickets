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

const headers = {
  "x-api-key": apiKey,
  "Content-Type": "application/json"
};

async function checkNumber(phone) {
  const baseUrl = url.replace(/\/+$/, "");
  console.log(`Checking number existence on WhatsApp: ${phone}...`);
  try {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/contacts/${phone}`, { headers });
    console.log(`getContact status: ${res.status}`);
    const data = await res.json();
    console.log("getContact body:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("getContact failed:", err.message);
  }
}

async function run() {
  await checkNumber("254737492562@c.us");
}

run();
