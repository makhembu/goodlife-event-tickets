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
  image_url?: string | null;
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
  vendorName = "THE CRAFT VAULT",
  eventName = "GOODLIFE FESTIVAL",
}: ProductQrModalProps) {
  const [qrType, setQrType] = useState<"universal" | "emvco">("universal");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [printLayout, setPrintLayout] = useState<"poster-a4" | "table-tent">("poster-a4");

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
          width: 500,
          margin: 1,
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
    link.download = `goodlife-qr-${item.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-till-${cleanTill}.png`;
    link.click();
  };

  const handlePrint = (mode: "poster-a4" | "table-tent") => {
    HapticFeedback.trigger("confirmation");
    const printWindow = window.open("", "_blank", "width=900,height=1000");
    if (!printWindow) {
      alert("Please allow popups to print poster.");
      return;
    }

    const itemImageHtml = item.image_url
      ? `<div class="product-photo-container">
           <img src="${item.image_url}" alt="${item.name}" class="product-photo" />
         </div>`
      : "";

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GOODLIFE FESTIVAL POSTER - ${item.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@700;900&family=JetBrains+Mono:wght@700;800;900&display=swap');

            @page {
              size: A4 portrait;
              margin: ${mode === "poster-a4" ? "8mm" : "12mm"};
            }

            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }

            body {
              background: #0a1128;
              color: #0a1128;
              font-family: 'Space Grotesk', -apple-system, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            /* A4 POSTER FRAME */
            .poster {
              width: 100%;
              max-width: ${mode === "poster-a4" ? "190mm" : "145mm"};
              height: ${mode === "poster-a4" ? "275mm" : "auto"};
              background: #fdfbf7;
              border: 8px solid #0a1128;
              box-shadow: 10px 10px 0px #ffde59, 16px 16px 0px #0a1128;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              padding: 22px;
              position: relative;
              overflow: hidden;
            }

            /* Subtle geometric festival watermark pattern */
            .poster::before {
              content: "";
              position: absolute;
              top: 0; left: 0; right: 0; height: 12px;
              background: repeating-linear-gradient(
                45deg,
                #ffde59,
                #ffde59 12px,
                #0a1128 12px,
                #0a1128 24px
              );
              z-index: 2;
            }

            /* FESTIVAL BRAND HEADER */
            .festival-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 4px solid #0a1128;
              padding-top: 8px;
              padding-bottom: 12px;
              margin-bottom: 14px;
            }

            .festival-logo-group {
              display: flex;
              align-items: center;
              gap: 12px;
            }

            .festival-badge {
              background: #0a1128;
              color: #ffde59;
              font-family: 'Bebas Neue', sans-serif;
              font-size: 32px;
              line-height: 1;
              padding: 6px 14px 4px 14px;
              letter-spacing: 2px;
              border: 3px solid #0a1128;
              box-shadow: 4px 4px 0px #ffde59;
            }

            .festival-sub {
              font-size: 11px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #0a1128;
              line-height: 1.2;
            }

            .category-tag {
              background: #ffde59;
              color: #0a1128;
              font-size: 12px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              padding: 5px 12px;
              border: 3px solid #0a1128;
              box-shadow: 3px 3px 0px #0a1128;
            }

            /* HERO PRODUCT DISPLAY */
            .product-hero {
              text-align: center;
              margin-bottom: 12px;
            }

            .vendor-line {
              font-size: 13px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 3px;
              color: #ff6b35;
              margin-bottom: 4px;
            }

            .product-title {
              font-family: 'Bebas Neue', sans-serif;
              font-size: ${item.name.length > 20 ? "46px" : "56px"};
              line-height: 0.95;
              text-transform: uppercase;
              color: #0a1128;
              letter-spacing: 1.5px;
              margin: 4px 0 10px 0;
            }

            .product-photo-container {
              width: 140px;
              height: 140px;
              margin: 0 auto 10px auto;
              border: 4px solid #0a1128;
              box-shadow: 5px 5px 0px #0a1128;
              overflow: hidden;
              background: #fff;
            }

            .product-photo {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }

            .price-pill {
              display: inline-block;
              background: #ffde59;
              color: #0a1128;
              border: 4px solid #0a1128;
              padding: 6px 24px;
              font-family: 'JetBrains Mono', monospace;
              font-weight: 900;
              font-size: 34px;
              letter-spacing: 1px;
              box-shadow: 6px 6px 0px #0a1128;
              margin-bottom: 8px;
            }

            /* QR CODE CENTERPIECE */
            .qr-centerpiece {
              background: #fff;
              border: 6px solid #0a1128;
              padding: 16px;
              margin: 0 auto 12px auto;
              display: inline-block;
              box-shadow: 8px 8px 0px #0a1128;
              position: relative;
            }

            .qr-centerpiece img {
              width: ${mode === "poster-a4" ? "240px" : "190px"};
              height: ${mode === "poster-a4" ? "240px" : "190px"};
              display: block;
            }

            .scan-callout {
              position: absolute;
              top: -14px;
              left: 50%;
              transform: translateX(-50%);
              background: #25D366;
              color: #fff;
              border: 2px solid #0a1128;
              font-size: 10px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              padding: 3px 12px;
              white-space: nowrap;
              box-shadow: 2px 2px 0px #0a1128;
            }

            /* TILL NUMBER HERO BOX */
            .till-hero {
              background: #0a1128;
              color: #fff;
              border: 4px solid #0a1128;
              padding: 12px 16px;
              text-align: center;
              box-shadow: 6px 6px 0px #ffde59;
              margin: 6px 0 12px 0;
            }

            .till-label-row {
              display: flex;
              justify-content: center;
              align-items: center;
              gap: 8px;
              font-size: 11px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 2px;
              color: #ffde59;
              margin-bottom: 2px;
            }

            .till-number-display {
              font-family: 'JetBrains Mono', monospace;
              font-size: 44px;
              font-weight: 900;
              letter-spacing: 4px;
              color: #fff;
              line-height: 1.1;
            }

            /* FOOTER GUIDE */
            .poster-footer {
              border-top: 3px dashed #0a1128;
              padding-top: 10px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
            }

            .step-pills {
              display: flex;
              gap: 6px;
            }

            .step-pill {
              background: #fff;
              border: 2px solid #0a1128;
              padding: 3px 8px;
              font-size: 10px;
              font-weight: 900;
            }

            .footer-url {
              font-family: 'JetBrains Mono', monospace;
              font-size: 10px;
              font-weight: 900;
              color: #ff6b35;
            }

            @media print {
              body {
                background: #fff;
                padding: 0;
              }
              .poster {
                box-shadow: none !important;
                border: 6px solid #0a1128 !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="poster">
            <!-- HEADER -->
            <div class="festival-header">
              <div class="festival-logo-group">
                <div class="festival-badge">GOODLIFE</div>
                <div class="festival-sub">
                  ${eventName}<br/>
                  <span style="color: #666; font-size: 10px;">OFFICIAL MERCH & STALL POS</span>
                </div>
              </div>
              <div class="category-tag">${item.category || "FAST TENDER"}</div>
            </div>

            <!-- PRODUCT DISPLAY -->
            <div class="product-hero">
              <div class="vendor-line">★ ${vendorName} ★</div>
              <h1 class="product-title">${item.name}</h1>
              ${itemImageHtml}
              ${numPrice > 0 ? `<div class="price-pill">KES ${numPrice.toLocaleString("en-KE")}</div>` : ""}
            </div>

            <!-- QR CODE -->
            <div style="text-align: center;">
              <div class="qr-centerpiece">
                <div class="scan-callout">⚡ SCAN WITH CAMERA OR M-PESA</div>
                <img src="${qrDataUrl}" alt="Scan QR code for ${item.name}" />
              </div>
            </div>

            <!-- TILL NUMBER HERO -->
            <div class="till-hero">
              <div class="till-label-row">
                <span>LIPA NA M-PESA</span>
                <span>•</span>
                <span>BUY GOODS TILL NUMBER</span>
              </div>
              <div class="till-number-display">${cleanTill}</div>
            </div>

            <!-- FOOTER -->
            <div class="poster-footer">
              <div class="step-pills">
                <span class="step-pill">1. SCAN QR</span>
                <span class="step-pill">2. ENTER PIN</span>
                <span class="step-pill">3. PICK UP DRINK</span>
              </div>
              <div class="footer-url">goodlife.smwhr.space</div>
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
      className="fixed inset-0 bg-brand-navy/85 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-brand-off-white border-4 border-brand-navy w-full max-w-md my-auto max-h-[92vh] flex flex-col shadow-(--shadow-brut-xl-accent) overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-brand-navy text-white p-4 flex items-center justify-between border-b-4 border-brand-navy shrink-0">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-brand-accent" />
            <h3 className="font-display text-lg uppercase tracking-wider text-brand-accent">
              Product QR & Festival Poster
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-brand-accent p-1 border border-white/30 hover:border-brand-accent transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Item details banner */}
          <div className="bg-white border-3 border-brand-navy p-3 flex items-center justify-between shadow-(--shadow-brut-xs)">
            <div className="flex items-center gap-3">
              {item.image_url && (
                <div className="w-12 h-12 border-2 border-brand-navy overflow-hidden bg-brand-navy/5 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div>
                <span className="text-[10px] font-mono font-black uppercase text-brand-navy/60 block">
                  {item.category || "Item"} • {vendorName}
                </span>
                <h4 className="text-base font-black uppercase text-brand-navy leading-tight">
                  {item.name}
                </h4>
              </div>
            </div>
            {numPrice > 0 && (
              <div className="text-right shrink-0 pl-2">
                <span className="text-[10px] font-mono font-black uppercase text-brand-navy/60 block">Price</span>
                <span className="text-lg font-black font-mono text-emerald-800 bg-yellow-300 px-2 py-0.5 border border-brand-navy inline-block">
                  KES {numPrice.toLocaleString("en-KE")}
                </span>
              </div>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-white border-2 border-brand-navy shadow-(--shadow-brut-xs)">
            <button
              type="button"
              onClick={() => setQrType("universal")}
              className={`py-2 px-3 text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                qrType === "universal"
                  ? "bg-brand-navy text-brand-accent border-2 border-brand-navy shadow-(--shadow-brut-xs)"
                  : "text-brand-navy/70 hover:text-brand-navy"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Any Camera (Web)</span>
            </button>
            <button
              type="button"
              onClick={() => setQrType("emvco")}
              className={`py-2 px-3 text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                qrType === "emvco"
                  ? "bg-brand-navy text-brand-accent border-2 border-brand-navy shadow-(--shadow-brut-xs)"
                  : "text-brand-navy/70 hover:text-brand-navy"
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>M-Pesa App (Native)</span>
            </button>
          </div>

          {/* QR Display Card */}
          <div className="border-4 border-brand-navy p-4 bg-white text-center flex flex-col items-center justify-center shadow-(--shadow-brut-md)">
            <span className="text-[10px] font-mono font-black uppercase bg-brand-navy text-brand-accent px-2 py-0.5 border border-brand-navy mb-3">
              ★ GOODLIFE BRANDED TENDER CODE ★
            </span>

            {generating ? (
              <div className="w-52 h-52 flex items-center justify-center text-xs font-mono font-bold animate-pulse">
                Generating High-Res QR...
              </div>
            ) : qrDataUrl ? (
              <div className="p-2 border-3 border-brand-navy bg-white shadow-(--shadow-brut-xs)">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`QR code for ${item.name}`}
                  className="w-52 h-52 object-contain"
                />
              </div>
            ) : null}

            <div className="mt-3 w-full bg-brand-navy text-white border-2 border-brand-navy p-2.5">
              <span className="text-[10px] font-mono font-black uppercase text-brand-accent block">
                BUY GOODS TILL NUMBER
              </span>
              <span className="text-3xl font-black font-mono tracking-widest text-white">
                {cleanTill}
              </span>
            </div>
            
            <p className="text-[10px] font-mono text-brand-navy/70 mt-2">
              {qrType === "universal"
                ? "Scans with any phone camera (iPhone/Android) to open 1-tap Buy Goods payment card."
                : "Scans directly in Safaricom M-Pesa App to prefill Till & Amount."}
            </p>
          </div>

          {/* Print Layout Options */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-black uppercase text-brand-navy block">
              PRINT DESIGN FORMAT:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPrintLayout("poster-a4")}
                className={`p-2 border-2 border-brand-navy text-left cursor-pointer transition-all ${
                  printLayout === "poster-a4"
                    ? "bg-brand-accent text-brand-navy font-black shadow-(--shadow-brut-xs)"
                    : "bg-white text-stone-600 hover:bg-stone-100"
                }`}
              >
                <div className="text-xs font-black uppercase">Full A4 Poster</div>
                <div className="text-[9px] font-mono opacity-80">Wall / Stall Board / Bar Front</div>
              </button>
              <button
                type="button"
                onClick={() => setPrintLayout("table-tent")}
                className={`p-2 border-2 border-brand-navy text-left cursor-pointer transition-all ${
                  printLayout === "table-tent"
                    ? "bg-brand-accent text-brand-navy font-black shadow-(--shadow-brut-xs)"
                    : "bg-white text-stone-600 hover:bg-stone-100"
                }`}
              >
                <div className="text-xs font-black uppercase">Compact Tent</div>
                <div className="text-[9px] font-mono opacity-80">Table Tent / Countertop Stand</div>
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => handlePrint(printLayout)}
              className="py-3 px-3 bg-brand-accent text-brand-navy border-2 border-brand-navy font-display text-base uppercase shadow-(--shadow-brut-sm) active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-1.5 hover:bg-white transition-all cursor-pointer"
            >
              <Printer className="w-5 h-5" />
              <span>Print {printLayout === "poster-a4" ? "A4 Poster" : "Tent"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="py-3 px-3 bg-white text-brand-navy border-2 border-brand-navy font-display text-base uppercase shadow-(--shadow-brut-sm) active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-1.5 hover:bg-brand-navy hover:text-white transition-all cursor-pointer"
            >
              <Download className="w-5 h-5" />
              <span>Save PNG</span>
            </button>
          </div>

          {/* Copy Universal Link */}
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full py-2.5 px-3 bg-white border-2 border-dashed border-brand-navy text-brand-navy font-bold text-xs uppercase flex items-center justify-center gap-1.5 hover:bg-brand-accent/20 transition-colors cursor-pointer"
          >
            {copiedLink ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span className="text-emerald-800">Copied Universal Pay Link!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Customer Web Pay Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
