import { getVendorById, fetchEventDetails } from "@/lib/supabase-db";
import { buildMpesaQrString, generateQrDataUrl } from "@/lib/mpesa-qr";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { PrintButton } from "./PrintButton";

export default async function VendorQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) notFound();

  const vendor = await getVendorById(vendorId);
  if (!vendor) notFound();

  const eventDetails = await fetchEventDetails();
  const tillNumber = eventDetails?.till_number || "5761205";

  const qrPayload = buildMpesaQrString({
    tillNumber,
    merchantName: vendor.name.slice(0, 20),
  });

  const qrDataUrl = await generateQrDataUrl(qrPayload, {
    width: 320,
    margin: 2,
  });

  return (
    <div className="min-h-screen bg-brand-off-white text-brand-navy flex flex-col items-center justify-center p-4 print:p-0 print:bg-white">
      {/* Top action bar (hidden when printing) */}
      <div className="w-full max-w-sm flex items-center justify-between mb-4 print:hidden">
        <Link
          href="/admin/dashboard"
          className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Link>
        <PrintButton />
      </div>

      {/* Printable Stall Tent Card */}
      <div className="w-full max-w-sm bg-white border-4 border-brand-navy shadow-(--shadow-brut) p-6 flex flex-col items-center text-center print:border-4 print:shadow-none print:max-w-none print:w-[360px] print:mx-auto">
        {/* Stall Header */}
        <div className="w-full pb-3 border-b-2 border-brand-navy mb-4">
          <p className="text-[10px] font-mono font-black tracking-widest text-brand-navy/60 uppercase">
            Goodlife Festival • Stall Payment
          </p>
          <h1 className="font-display text-2xl uppercase tracking-wider mt-1 text-brand-navy">
            {vendor.name}
          </h1>
          {vendor.category && (
            <span className="inline-block px-2 py-0.5 bg-yellow-400 border border-brand-navy font-mono text-[9px] font-black uppercase mt-1">
              {vendor.category}
            </span>
          )}
        </div>

        {/* QR Code Section */}
        <div className="p-3 bg-white border-2 border-brand-navy my-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`M-Pesa QR for ${vendor.name}`}
            className="w-56 h-56 mx-auto object-contain"
          />
        </div>

        {/* Payment instructions */}
        <div className="mt-3 space-y-1">
          <p className="font-mono text-xs font-black uppercase tracking-wider text-brand-navy">
            Scan to Pay via M-Pesa
          </p>
          <p className="font-mono text-[11px] text-brand-navy/70">
            Open camera or Safaricom M-Pesa App
          </p>
        </div>

        {/* Till Number highlight */}
        <div className="w-full bg-brand-navy text-white py-2.5 px-4 mt-4 border-2 border-brand-navy">
          <p className="text-[10px] font-mono tracking-widest uppercase opacity-75">
            Buy Goods Till Number
          </p>
          <p className="font-mono text-xl font-black tracking-widest mt-0.5">
            {tillNumber}
          </p>
        </div>

        {/* Ref / Footnote */}
        <div className="w-full mt-4 pt-3 border-t border-brand-navy/20 flex items-center justify-between font-mono text-[10px] text-brand-navy/60">
          <span>REF: {vendor.pay_ref_prefix || `VND${vendor.id}`}</span>
          <span>OR ASK CASHIER FOR STK PUSH</span>
        </div>
      </div>
    </div>
  );
}
