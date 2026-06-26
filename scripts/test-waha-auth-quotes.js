const url = "http://compassionate-optimism-production-8024.up.railway.app";
const apiKey = "bdfc6ea8edb548169ba65ea67be29b27";

async function testAuthQuotes() {
  const variations = [
    { name: "With Double Quotes", headers: { "X-Api-Key": `"${apiKey}"` } },
    { name: "With Single Quotes", headers: { "X-Api-Key": `'${apiKey}'` } },
    { name: "No Key (Check if required)", headers: {} }
  ];

  for (const v of variations) {
    try {
      const res = await fetch(`${url}/api/sessions`, { headers: v.headers });
      const body = await res.json().catch(() => "Non-JSON");
      console.log(`Header: ${v.name} -> Status: ${res.status}`, JSON.stringify(body));
    } catch (err) {
      console.error(`Failed for ${v.name}:`, err.message);
    }
  }
}

testAuthQuotes();
