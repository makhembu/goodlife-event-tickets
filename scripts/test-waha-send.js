const url = "https://compassionate-optimism-production-8024.up.railway.app";
const apiKey = "e7ababf294c34c66a5c171df5b2db5e0";
const sessionName = "default";
const recipientNumber = "254799560898"; // 0799560898 with 254 prefix, no plus

const headers = {
  "X-Api-Key": apiKey,
  "Content-Type": "application/json"
};

async function run() {
  console.log("Checking WAHA session status...");
  try {
    const resStatus = await fetch(`${url}/api/sessions/${sessionName}`, { headers });
    const statusData = await resStatus.json();
    console.log("Session Status:", JSON.stringify(statusData, null, 2));

    if (statusData.status === "WORKING") {
      console.log(`Sending test text message to ${recipientNumber}...`);
      const resSend = await fetch(`${url}/api/sendText`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          chatId: `${recipientNumber}@c.us`,
          text: "Hello! This is a test message from your new WAHA (NOWEB) WhatsApp gateway on Railway. Your ticket system is now connected!",
          session: sessionName
        })
      });

      console.log(`Send message response status: ${resSend.status}`);
      const sendResult = await resSend.json();
      console.log("Send Result:", JSON.stringify(sendResult, null, 2));
    } else {
      console.log("Session is not in WORKING status yet. Please wait or check pairing.");
    }
  } catch (err) {
    console.error("Communication failed:", err.message);
  }
}

run();
