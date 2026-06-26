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

async function run() {
  const baseUrl = url.replace(/\/+$/, "");
  
  const endpoints = [
    `/api/sessions/${sessionId}/webhooks`,
    `/api/webhooks`
  ];

  for (const ep of endpoints) {
    try {
      console.log(`Checking GET ${ep}...`);
      const res = await fetch(`${baseUrl}${ep}`, { headers });
      console.log(`Response [${res.status}]:`);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(`Error on ${ep}:`, err.message);
    }
    console.log("-".repeat(40));
  }
}

run();
