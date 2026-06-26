const url = process.env.WHATSAPP_GATEWAY_URL || "https://openwa-api-production-2ef8.up.railway.app";
const apiKey = process.env.WHATSAPP_API_KEY || "owa_k1_07f9edb397f3da46be36feb9f777bb196bf09f0e9ad76ac5d55586fb653196d1";
const sessionId = process.env.WHATSAPP_SESSION_ID || "92334693-ccce-450b-8946-56332f832deb";

const headers = {
  "x-api-key": apiKey,
  "Content-Type": "application/json"
};

async function run() {
  const baseUrl = url.replace(/\/+$/, "");
  
  console.log(`Fetching chats...`);
  try {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/chats`, { headers });
    console.log(`Chats status: ${res.status}`);
    const data = await res.json();
    console.log("Chats:", JSON.stringify(data.slice(0, 5), null, 2));
  } catch (err) {
    console.error("Error fetching chats:", err.message);
  }
}

run();
