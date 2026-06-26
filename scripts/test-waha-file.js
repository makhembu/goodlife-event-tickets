const url = "https://compassionate-optimism-production-8024.up.railway.app";
const apiKey = "e7ababf294c34c66a5c171df5b2db5e0";
const sessionName = "default";
const recipientNumber = "254799560898";

const headers = {
  "X-Api-Key": apiKey,
  "Content-Type": "application/json"
};

async function run() {
  console.log("Sending test PDF document via WAHA from a public URL...");
  try {
    const res = await fetch(`${url}/api/sendFile`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        chatId: `${recipientNumber}@c.us`,
        session: sessionName,
        file: {
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          filename: "GOODLIFE-TEST-TICKET.pdf"
        },
        caption: "Test ticket attachment from public URL!"
      })
    });

    console.log(`Send file response status: ${res.status}`);
    const data = await res.json();
    console.log("Send file response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to send file:", err.message);
  }
}

run();
