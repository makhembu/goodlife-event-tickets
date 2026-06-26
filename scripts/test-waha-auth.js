const url = "http://compassionate-optimism-production-8024.up.railway.app";
const apiKey = "bdfc6ea8edb548169ba65ea67be29b27";

async function testAuth() {
  const variations = [
    { name: "X-Api-Key", headers: { "X-Api-Key": apiKey } },
    { name: "x-api-key", headers: { "x-api-key": apiKey } },
    { name: "Authorization Bearer", headers: { "Authorization": `Bearer ${apiKey}` } },
    { name: "X-API-KEY", headers: { "X-API-KEY": apiKey } }
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

testAuth();
