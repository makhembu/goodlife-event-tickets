const dns = require("dns");

const regions = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2",
  "sa-east-1", "ca-central-1", "me-central-1", "af-south-1"
];

async function check() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    try {
      const addresses = await new Promise((resolve, reject) => {
        dns.resolve4(host, (err, addrs) => {
          if (err) reject(err);
          else resolve(addrs);
        });
      });
      console.log(`Found pooler: ${host} -> ${addresses.join(", ")}`);
    } catch (err) {
      // ignore resolution failures
    }
  }
}

check();
