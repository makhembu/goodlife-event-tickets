"use client";

import React, { useState, useEffect } from "react";
import {
  buildMpesaQrString,
  buildUniversalPayUrl,
  generateQrDataUrl,
} from "@/lib/mpesa-qr";
import { HapticFeedback } from "@/components/ui/haptic-feedback";
import {
  QrCode,
  Printer,
  Download,
  Copy,
  CheckCircle2,
  X,
  Store,
  ExternalLink,
  Smartphone,
  Sparkles,
} from "lucide-react";

export interface QrItem {
  id?: number;
  name: string;
  price: number | string;
  category?: string | null;
}

interface ProductQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: QrItem | null;
  tillNumber: string;
  vendorName?: string;
  eventName?: string;
}

export function ProductQrModal({
  isOpen,
  onClose,
  item,
  tillNumber,
  vendorName = "Vendor Stall",
  eventName = "GOODLIFE FESTIVAL",
}: ProductQrModalProps) {
  const [qrType, setQrType] = useState<"universal" | "emvco">("universal");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const cleanTill = (tillNumber || "5761205").replace(/\D/g, "") || "5761205";
  const numPrice = item ? Number(item.price) : 0;

  useEffect(() => {
    if (!isOpen || !item) return;

    let isMounted = true;
    setGenerating(true);

    const generate = async () => {
      try {
        let payload = "";
        if (qrType === "emvco") {
          payload = buildMpesaQrString({
            tillNumber: cleanTill,
            amount: numPrice > 0 ? numPrice : undefined,
            itemName: item.name,
            merchantName: eventName.slice(0, 25),
          });
        } else {
          // Universal web pay link
          const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
          payload = buildUniversalPayUrl({
            baseUrl,
            tillNumber: cleanTill,
            amount: numPrice > 0 ? numPrice : undefined,
            itemName: item.name,
            vendorName,
          });
        }

        const dataUrl = await generateQrDataUrl(payload, {
          width: 450,
          margin: 2,
        });

        if (isMounted) {
          setQrDataUrl(dataUrl);
        }
      } catch (err) {
        console.error("Failed to generate QR code", err);
      } finally {
        if (isMounted) setGenerating(false);
      }
    };

    generate();

    return () => {
      isMounted = false;
    };
  }, [isOpen, item, tillNumber, qrType, vendorName, eventName, cleanTill, numPrice]);

  if (!isOpen || !item) return null;

  const universalUrl =
    typeof window !== "undefined"
      ? buildUniversalPayUrl({
          baseUrl: window.location.origin,
          tillNumber: cleanTill,
          amount: numPrice > 0 ? numPrice : undefined,
          itemName: item.name,
          vendorName,
        })
      : "";

  const handleCopyLink = () => {
    HapticFeedback.trigger("confirmation");
    navigator.clipboard.writeText(universalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownload = () => {
    HapticFeedback.trigger("confirmation");
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `qr-${item.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-till-${cleanTill}.png`;
    link.click();
  };

  const handlePrintTableTent = () => {
    HapticFeedback.trigger("confirmation");
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) {
      alert("Please allow popups to print table tent.");
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Table Tent - ${item.name}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            * {
              box-sizing: border-box;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            body {
              margin: 0;
              padding: 0;
              background: #fff;
              color: #000;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            .tent-card {
              width: 140mm;
              border: 4px solid #0a1128;
              padding: 24px;
              text-align: center;
              background: #fff;
              box-shadow: 6px 6px 0px #0a1128;
              page-break-inside: avoid;
            }
            .header-badge {
              display: inline-block;
              background: #ffde59;
              color: #0a1128;
              font-weight: 900;
              font-size: 13px;
              padding: 4px 12px;
              border: 2px solid #0a1128;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 12px;
            }
            .event-title {
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #555;
              margin-bottom: 4px;
            }
            .item-name {
              font-size: 26px;
              font-weight: 900;
              text-transform: uppercase;
              margin: 0 0 6px 0;
              line-height: 1.1;
            }
            .price-tag {
              font-size: 28px;
              font-weight: 900;
              font-family: monospace;
              color: #0a1128;
              background: #f4f4f4;
              display: inline-block;
              padding: 4px 16px;
              border: 2px solid #0a1128;
              margin-bottom: 16px;
            }
            .qr-wrapper {
              margin: 12px auto;
              padding: 8px;
              border: 3px solid #0a1128;
              display: inline-block;
              background: #fff;
            }
            .qr-wrapper img {
              width: 220px;
              height: 220px;
              display: block;
            }
            .till-box {
              background: #ffde59;
              border: 3px solid #0a1128;
              padding: 12px;
              margin: 16px 0 12px 0;
            }
            .till-label {
              font-size: 11px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              margin-bottom: 2px;
            }
            .till-number {
              font-size: 38px;
              font-weight: 900;
              font-family: monospace;
              letter-spacing: 2px;
            }
            .instructions {
              font-size: 11px;
              font-weight: 700;
              line-height: 1.4;
              color: #333;
              margin-top: 12px;
              border-top: 2px solid #eee;
              padding-top: 10px;
            }
            .cutting-guide {
              font-size: 9px;
              font-family: monospace;
              color: #888;
              margin-top: 12px;
              border-top: 1px dashed #ccc;
              padding-top: 6px;
            }
          </style>
        </head>
        <body>
          <div class="tent-card">
            <div class="header-badge">Lipa na M-Pesa • Buy Goods</div>
            <div class="event-title">${eventName} • ${vendorName}</div>
            <h1 class="item-name">${item.name}</h1>
            ${numPrice > 0 ? `<div class="price-tag">KES ${numPrice.toLocaleString("en-KE")}</div>` : ""}
            
            <div class="qr-wrapper">
              <img src="${qrDataUrl}" alt="Scan to Pay" />
            </div>

            <div class="till-box">
              <div class="till-label">Buy Goods Till Number</div>
              <div class="till-number">${cleanTill}</div>
            </div>

            <div class="instructions">
              1. Open M-Pesa $\\rightarrow$ Lipa na M-Pesa $\\rightarrow$ <strong>Buy Goods</strong><br/>
              2. Enter Till: <strong>${cleanTill}</strong> ${numPrice > 0 ? `• Amount: <strong>KES ${numPrice.toLocaleString("en-KE")}</strong>` : ""}<br/>
              3. Enter M-Pesa PIN and show receipt to cashier
            </div>

            <div class="cutting-guide">
              ✂ Fold along center to stand as table-tent or stick at bar counter
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div
      className="fixed inset-0 bg-brand-navy/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white border-4 border-[var(--brand-navy)] w-full max-w-md shadow-(--shadow-brut-lg) overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[var(--brand-navy)] text-white p-3.5 flex items-center justify-between border-b-2 border-[var(--brand-navy)]">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-brand-accent" />
            <h3 className="font-black text-xs uppercase tracking-wider">
              Product QR & Table Tent
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Item details banner */}
          <div className="bg-brand-accent/15 border-2 border-[var(--brand-navy)] p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase text-brand-navy/60 block">
                {item.category || "Item"}
              </span>
              <h4 className="text-base font-black uppercase text-[var(--brand-navy)]">
                {item.name}
              </h4>
            </div>
            {numPrice > 0 && (
              <div className="text-right">
                <span className="text-[10px] font-black uppercase text-brand-navy/60 block">Price</span>
                <span className="text-lg font-black font-mono text-[var(--brand-navy)]">
                  KES {numPrice.toLocaleString("en-KE")}
                </span>
              </div>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 border-2 border-[var(--brand-navy)]">
            <button
              type="button"
              onClick={() => setQrType("universal")}
              className={`py-2 px-3 text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 ${
                qrType === "universal"
                  ? "bg-white text-[var(--brand-navy)] shadow-(--shadow-brut-xs) border-2 border-[var(--brand-navy)]"
                  : "text-brand-navy/60 hover:text-[var(--brand-navy)]"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Any Camera (Web)</span>
            </button>
            <button
              type="button"
              onClick={() => setQrType("emvco")}
              className={`py-2 px-3 text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 ${
                qrType === "emvco"
                  ? "bg-white text-[var(--brand-navy)] shadow-(--shadow-brut-xs) border-2 border-[var(--brand-navy)]"
                  : "text-brand-navy/60 hover:text-[var(--brand-navy)]"
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>M-Pesa App (Native)</span>
            </button>
          </div>

          {/* QR Display Card */}
          <div className="border-4 border-[var(--brand-navy)] p-4 bg-white text-center flex flex-col items-center justify-center shadow-(--shadow-brut-sm)">
            {generating ? (
              <div className="w-56 h-56 flex items-center justify-center text-xs font-mono font-bold">
                Generating QR...
              </div>
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${item.name}`}
                className="w-56 h-56 object-contain border-2 border-[var(--brand-navy)] p-1 bg-white"
              />
            ) : null}

            <div className="mt-3 w-full bg-brand-accent/25 border-2 border-[var(--brand-navy)] p-2">
              <span className="text-[10px] font-black uppercase text-brand-navy/70 block">
                Buy Goods Till Number (From Database)
              </span>
              <span className="text-2xl font-black font-mono tracking-wider text-[var(--brand-navy)]">
                {cleanTill}
              </span>
            </div>
            
            <p className="text-[10px] font-mono text-brand-navy/70 mt-2">
              {qrType === "universal"
                ? "Scans with any iPhone/Android camera to open 1-tap Buy Goods payment card."
                : "Scans directly with Safaricom M-Pesa App to prefill Till & Amount."}
            </p>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handlePrintTableTent}
              className="py-2.5 px-3 bg-brand-accent text-brand-navy border-2 border-[var(--brand-navy)] font-black text-xs uppercase shadow-(--shadow-brut-xs) active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-1.5 hover:bg-brand-accent/90 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Table Tent</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="py-2.5 px-3 bg-white text-brand-navy border-2 border-[var(--brand-navy)] font-black text-xs uppercase shadow-(--shadow-brut-xs) active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download PNG</span>
            </button>
          </div>

          {/* Copy Universal Link */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full py-2 px-3 bg-gray-50 border-2 border-dashed border-[var(--brand-navy)] text-brand-navy font-bold text-xs uppercase flex items-center justify-center gap-1.5 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            {copiedLink ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-700" />
                <span>Copied Universal Pay Link!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Customer Web Pay Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
