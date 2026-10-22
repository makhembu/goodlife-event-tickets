import { getVendorById, fetchEventDetails } from "@/lib/supabase-db";
import { buildMpesaQrString, buildUniversalPayUrl, generateQrDataUrl } from "@/lib/mpesa-qr";
import { notFound } from "next/navigation";
import { VendorQrClient } from "./VendorQrClient";

export default async function VendorQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) notFound();

  const vendor = await getVendorById(vendorId);
  if (!vendor) notFound();

  const eventDetails = await fetchEventDetails();
  const tillNumber = eventDetails?.till_number || "5761205";
  const baseUrl = process.env.APP_URL || "https://goodlife.smwhr.space";

  // 1. Universal Web Camera QR (Opens /pay/till on phone browser, prompts STK push)
  const webUrl = buildUniversalPayUrl({
    baseUrl,
    tillNumber,
    vendorName: vendor.name,
  });
  const universalQr = await generateQrDataUrl(webUrl, {
    width: 320,
    margin: 2,
  });

  // 2. Safaricom In-App Direct EMVCo QR
  const safaricomPayload = buildMpesaQrString({
    tillNumber,
    merchantName: vendor.name.slice(0, 20),
  });
  const safaricomQr = await generateQrDataUrl(safaricomPayload, {
    width: 320,
    margin: 2,
  });

  return (
    <VendorQrClient
      vendor={vendor}
      tillNumber={tillNumber}
      universalQr={universalQr}
      safaricomQr={safaricomQr}
      webUrl={webUrl}
    />
  );
}
