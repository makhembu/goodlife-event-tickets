const url = process.env.WHATSAPP_GATEWAY_URL || "https://openwa-api-production-2ef8.up.railway.app";
const apiKey = process.env.WHATSAPP_API_KEY || "owa_k1_07f9edb397f3da46be36feb9f777bb196bf09f0e9ad76ac5d55586fb653196d1";
const sessionId = process.env.WHATSAPP_SESSION_ID || "92334693-ccce-450b-8946-56332f832deb";

const headers = {
  "x-api-key": apiKey,
  "Content-Type": "application/json"
};

async function testLogout() {
  const baseUrl = url.replace(/\/+$/, "");
  console.log(`Attempting POST /api/sessions/${sessionId}/logout...`);
  try {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/logout`, { method: "POST", headers });
    console.log(`Logout response status: ${res.status}`);
    const data = await res.json();
    console.log("Logout response:", JSON.stringify(data, null, 2));
    return;
  } catch (err) {
    console.error("Logout failed:", err.message);
  }
}

async function testDelete() {
  const baseUrl = url.replace(/\/+$/, "");
  console.log(`Attempting DELETE /api/sessions/${sessionId}...`);
  try {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`, { method: "DELETE", headers });
    console.log(`Delete response status: ${res.status}`);
    const data = await res.json();
    console.log("Delete response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Delete failed:", err.message);
  }
}

async function run() {
  await testLogout();
  await testDelete();
}

run();
