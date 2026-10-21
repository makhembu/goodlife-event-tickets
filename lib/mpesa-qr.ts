import QRCode from "qrcode";

export interface MpesaQrOptions {
  tillNumber: string;
  amount?: number;
  merchantName?: string;
  itemName?: string;
  city?: string;
}

export interface UniversalPayOptions {
  baseUrl?: string;
  tillNumber: string;
  amount?: number;
  itemName?: string;
  vendorName?: string;
}

export function formatTag(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/**
 * Standard CRC-16/CCITT-FALSE (Polynomial 0x1021, Initial 0xFFFF, no reflect).
 * Standardized in EMVCo Merchant-Presented Mode specifications (section 4.10).
 */
export function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Build official EMVCo-compliant payload for Safaricom M-Pesa Buy Goods.
 * When scanned inside Safaricom M-Pesa or MySafaricom app, auto-fills Till and Amount.
 */
export function buildMpesaQrString({
  tillNumber,
  amount,
  merchantName = "GOODLIFE",
  itemName,
  city = "Nairobi",
}: MpesaQrOptions): string {
  const cleanTill = (tillNumber || "5761205").replace(/\D/g, "");
  let payload = "";

  // 00: Payload Format Indicator (01)
  payload += formatTag("00", "01");

  // 01: Point of Initiation (12 = dynamic with amount, 11 = static)
  payload += formatTag("01", amount && amount > 0 ? "12" : "11");

  // 28: Merchant Account Information (Safaricom M-Pesa Buy Goods)
  let tag28 = "";
  tag28 += formatTag("00", "com.safaricom");
  tag28 += formatTag("01", cleanTill);
  tag28 += formatTag("02", "BG"); // BG = Buy Goods / Pay Merchant
  payload += formatTag("28", tag28);

  // 52: Merchant Category Code (MCC)
  payload += formatTag("52", "0000");

  // 53: Transaction Currency (404 = KES)
  payload += formatTag("53", "404");

  // 54: Transaction Amount
  if (amount && amount > 0) {
    payload += formatTag("54", Number(amount).toFixed(2));
  }

  // 58: Country Code (KE)
  payload += formatTag("58", "KE");

  // 59: Merchant Name (Up to 25 chars)
  payload += formatTag("59", merchantName.trim().slice(0, 25) || "GOODLIFE");

  // 60: Merchant City (Up to 15 chars)
  payload += formatTag("60", city.trim().slice(0, 15) || "Nairobi");

  // 62: Additional Data (Bill/Item reference)
  if (itemName) {
    const cleanItem = itemName.replace(/[^a-zA-Z0-9 -]/g, "").slice(0, 25);
    if (cleanItem) {
      const tag62 = formatTag("01", cleanItem);
      payload += formatTag("62", tag62);
    }
  }

  // 63: Checksum
  const withTag63 = payload + "6304";
  const checksum = crc16(withTag63);
  return withTag63 + checksum;
}

/**
 * Build universal web scan URL.
 * Works with ANY standard phone camera (iPhone, Samsung, Google Lens).
 */
export function buildUniversalPayUrl({
  baseUrl = "",
  tillNumber,
  amount,
  itemName,
  vendorName,
}: UniversalPayOptions): string {
  const cleanTill = (tillNumber || "5761205").replace(/\D/g, "") || "5761205";
  const params = new URLSearchParams();
  params.set("till", cleanTill);
  if (amount && amount > 0) params.set("amount", Math.round(amount).toString());
  if (itemName) params.set("item", itemName.trim());
  if (vendorName) params.set("vendor", vendorName.trim());

  const prefix = baseUrl ? baseUrl.replace(/\/+$/, "") : "";
  return `${prefix}/pay/till?${params.toString()}`;
}

/**
 * Generate data URL image using the qrcode library
 */
export async function generateQrDataUrl(
  text: string,
  options?: {
    margin?: number;
    width?: number;
    darkColor?: string;
    lightColor?: string;
  }
): Promise<string> {
  return await QRCode.toDataURL(text, {
    margin: options?.margin ?? 2,
    width: options?.width ?? 400,
    color: {
      dark: options?.darkColor || "#000000",
      light: options?.lightColor || "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });
}
