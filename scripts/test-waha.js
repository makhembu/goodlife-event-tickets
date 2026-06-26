const fs = require("fs");
const path = require("path");

const url = "https://compassionate-optimism-production-8024.up.railway.app";
const apiKey = "e7ababf294c34c66a5c171df5b2db5e0";
const sessionName = "default";

const headers = {
  "X-Api-Key": apiKey,
  "Content-Type": "application/json"
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log("1. Creating session 'default'...");
  try {
    const resCreate = await fetch(`${url}/api/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: sessionName
      })
    });
    console.log(`Create response: ${resCreate.status}`);
    const createData = await resCreate.json().catch(() => ({}));
    console.log("Create Data:", JSON.stringify(createData, null, 2));
  } catch (err) {
    console.log("Create failed (might already exist):", err.message);
  }

  console.log("2. Starting session 'default'...");
  try {
    const resStart = await fetch(`${url}/api/sessions/${sessionName}/start`, {
      method: "POST",
      headers
    });
    console.log(`Start response: ${resStart.status}`);
    const startData = await resStart.json().catch(() => ({}));
    console.log("Start Data:", JSON.stringify(startData, null, 2));
  } catch (err) {
    console.log("Start failed:", err.message);
  }

  console.log("Waiting 8 seconds for engine to boot up and generate QR code...");
  await sleep(8000);

  console.log("3. Fetching session status...");
  try {
    const resStatus = await fetch(`${url}/api/sessions/${sessionName}`, { headers });
    const statusData = await resStatus.json();
    console.log("Session Status:", JSON.stringify(statusData, null, 2));
  } catch (err) {
    console.log("Status check failed:", err.message);
  }

  console.log("4. Fetching QR code from WAHA...");
  try {
    const resQR = await fetch(`${url}/api/${sessionName}/auth/qr`, {
      headers: {
        "X-Api-Key": apiKey
      }
    });

    if (resQR.status === 200) {
      const buffer = await resQR.arrayBuffer();
      const outputPath = path.join(__dirname, "..", "qr-code-waha.png");
      fs.writeFileSync(outputPath, Buffer.from(buffer));
      console.log(`\nSUCCESS! QR Code saved to ${outputPath}`);
      console.log("Please view/scan this QR code with WhatsApp Linked Devices.");
    } else {
      console.log(`Failed to fetch QR code: status ${resQR.status}`);
      const text = await resQR.text().catch(() => "");
      console.log("QR response body:", text);
    }
  } catch (err) {
    console.error("Failed to retrieve QR code:", err.message);
  }
}

run();
