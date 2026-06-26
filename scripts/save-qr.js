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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAndSaveQR() {
  const baseUrl = url.replace(/\/+$/, "");
  console.log(`Polling QR code for instance: ${sessionId}...`);
  
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/instance/connect/${sessionId}`, { headers });
      const data = await res.json();

      if (data.qrcode && data.qrcode.base64) {
        const base64Data = data.qrcode.base64.replace(/^data:image\/png;base64,/, "");
        const outputPath = path.join(__dirname, "..", "qr-code.png");
        fs.writeFileSync(outputPath, base64Data, "base64");
        console.log(`\nSUCCESS: QR code image saved to: ${outputPath}`);
        return true;
      } else if (data.status === "connected") {
        console.log("WhatsApp instance is already CONNECTED.");
        return true;
      } else {
        console.log(`Attempt ${attempt}/15: Instance status is "${data.status || "connecting"}", waiting for QR code...`);
      }
    } catch (err) {
      console.error(`Attempt ${attempt}/15 failed:`, err.message);
    }
    await sleep(3000);
  }
  
  console.log("Failed to retrieve QR code after 15 attempts. Please run the script again.");
  return false;
}

fetchAndSaveQR();
