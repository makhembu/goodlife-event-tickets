/**
 * Verification test for M-Pesa QR generation (`lib/mpesa-qr.ts`).
 *
 * Locks down:
 *  - CRC-16/CCITT-FALSE standard vector
 *  - EMVCo Tag-Length-Value formatting
 *  - Static & Dynamic Safaricom Buy Goods QR payloads
 *  - Universal Web Quick-Pay URL formation
 *  - QR code PNG Data URL emission
 */

import {
  crc16,
  formatTag,
  buildMpesaQrString,
  buildUniversalPayUrl,
  generateQrDataUrl,
} from "../lib/mpesa-qr";

let pass = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    pass++;
  } else {
    failures.push(`  ${name}\n    expected: ${String(expected)}\n    actual:   ${String(actual)}`);
  }
}

async function run() {
  // 1. Check CRC-16 against known international test vector '123456789' -> 0x29B1
  check("CRC16 test vector '123456789'", crc16("123456789"), "29B1");

  // 2. formatTag tests
  check("formatTag simple", formatTag("00", "01"), "000201");
  check("formatTag long string", formatTag("28", "com.safaricom"), "2813com.safaricom");

  // 3. Static Buy Goods QR (no amount)
  const staticQr = buildMpesaQrString({
    tillNumber: "5761205",
    merchantName: "GOODLIFE",
  });
  check("Static QR starts with EMVCo header", staticQr.startsWith("000201"), true);
  check("Static QR has initiation method 11 (static)", staticQr.includes("010211"), true);
  check("Static QR contains till number 5761205", staticQr.includes("5761205"), true);
  check("Static QR has BG (Buy Goods)", staticQr.includes("0202BG"), true);
  check("Static QR includes Tag 63 with 4-char CRC", /6304[0-9A-F]{4}$/.test(staticQr), true);

  // 4. Dynamic Buy Goods QR (with amount & item)
  const dynamicQr = buildMpesaQrString({
    tillNumber: "5761205",
    amount: 350,
    itemName: "Cocktail",
    merchantName: "GOODLIFE",
  });
  check("Dynamic QR has initiation method 12 (dynamic)", dynamicQr.includes("010212"), true);
  check("Dynamic QR contains amount 350.00", dynamicQr.includes("5406350.00"), true);
  check("Dynamic QR contains item Cocktail", dynamicQr.includes("Cocktail"), true);
  check("Dynamic QR ends with valid CRC checksum", /6304[0-9A-F]{4}$/.test(dynamicQr), true);

  // 5. Universal Pay URL
  const webUrl = buildUniversalPayUrl({
    baseUrl: "https://goodlife.co.ke",
    tillNumber: "5761205",
    amount: 450,
    itemName: "Craft Beer",
  });
  check(
    "Universal Pay URL structure",
    webUrl,
    "https://goodlife.co.ke/pay/till?till=5761205&amount=450&item=Craft+Beer"
  );

  // 6. QR Data URL Generation
  const dataUrl = await generateQrDataUrl("0002010102116304AD0A");
  check("Data URL prefix", dataUrl.startsWith("data:image/png;base64,"), true);
  check("Data URL has valid length", dataUrl.length > 100, true);

  if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} checks failed`);
    failures.forEach((f) => console.error(f));
    process.exit(1);
  } else {
    console.log(`PASS: All ${pass} checks passed`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
