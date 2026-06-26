const { chromium } = require("playwright");
const path = require("path");

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  console.log("Checking if flyer dialog is open and closing it...");
  const closeFlyerBtn = page.locator("button[aria-label='Close flyer preview']");
  if (await closeFlyerBtn.count() > 0 && await closeFlyerBtn.isVisible()) {
    console.log("Closing flyer dialog...");
    await closeFlyerBtn.click();
  }

  console.log("Filling out the checkout form...");
  
  // Fill buyer name
  await page.fill("#buyer-name", "CLI Test Buyer");

  // Select a tier by clicking button containing "ADV 500" or similar
  console.log("Clicking ticket tier button...");
  const tierBtn = page.locator("button:has-text('ADV 500')").first();
  await tierBtn.click();

  // Set M-Pesa number
  await page.fill("#mpesa-number", "0710000000");

  // Click 'Send ticket to a different WhatsApp number'
  console.log("Exposing WhatsApp number field...");
  const diffWhatsAppBtn = page.locator("text=Send ticket to a different WhatsApp number");
  if (await diffWhatsAppBtn.count() > 0) {
    await diffWhatsAppBtn.click();
    await page.waitForSelector("#whatsapp-number");
  }

  // Fill WhatsApp number
  console.log("Filling WhatsApp number...");
  await page.fill("#whatsapp-number", "0799560898");

  // Screenshot form state before click
  await page.screenshot({ path: "checkout-form-filled.png" });
  console.log("Form screenshot saved to checkout-form-filled.png");

  // Click payment submit button
  console.log("Clicking PAY WITH M-PESA...");
  const payBtn = page.locator("button:has-text('PAY WITH M-PESA')");
  await payBtn.click();

  console.log("Waiting for payment update...");
  // Wait up to 25 seconds for the transaction polling to complete
  try {
    const statusLocator = page.locator("role=status");
    await statusLocator.waitFor({ state: "visible", timeout: 25000 });
    console.log("Status visible. Content:");
    console.log(await statusLocator.textContent());
  } catch (err) {
    console.log("Timeout waiting for status block, screenshotting current page...");
  }

  await page.waitForTimeout(5000); // Wait another 5 seconds for webhook to arrive and process
  await page.screenshot({ path: "checkout-status.png" });
  console.log("Final status screenshot saved to checkout-status.png");

  await browser.close();
  console.log("Browser closed.");
})();
