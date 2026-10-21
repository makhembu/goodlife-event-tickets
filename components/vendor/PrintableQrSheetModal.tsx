"use client";

import React, { useState, useEffect } from "react";
import {
  buildUniversalPayUrl,
  generateQrDataUrl,
} from "@/lib/mpesa-qr";
import { HapticFeedback } from "@/components/ui/haptic-feedback";
import { Printer, X, CheckSquare, Square, QrCode } from "lucide-react";
import { QrItem } from "./ProductQrModal";

interface PrintableQrSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: QrItem[];
  tillNumber: string;
  vendorName?: string;
  eventName?: string;
}

export function PrintableQrSheetModal({
  isOpen,
  onClose,
  items,
  tillNumber,
  vendorName = "THE CRAFT VAULT",
  eventName = "GOODLIFE FESTIVAL",
}: PrintableQrSheetModalProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);

  const cleanTill = (tillNumber || "5761205").replace(/\D/g, "") || "5761205";

  useEffect(() => {
    if (isOpen && items.length > 0) {
      // Default: all items selected
      setSelectedIds(items.map((it, idx) => it.id ?? idx));
    }
  }, [isOpen, items]);

  if (!isOpen) return null;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedIds(items.map((it, idx) => it.id ?? idx));
  };

  const deselectAll = () => {
    setSelectedIds([]);
  };

  const handlePrintSheet = async () => {
    if (selectedIds.length === 0) {
      alert("Please select at least one item to print.");
      return;
    }

    HapticFeedback.trigger("confirmation");
    setIsPrinting(true);

    try {
      const selectedItems = items.filter((it, idx) =>
        selectedIds.includes(it.id ?? idx)
      );

      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      // Generate QR codes in parallel
      const qrCards = await Promise.all(
        selectedItems.map(async (item) => {
          const numPrice = Number(item.price) || 0;
          const url = buildUniversalPayUrl({
            baseUrl,
            tillNumber: cleanTill,
            amount: numPrice > 0 ? numPrice : undefined,
            itemName: item.name,
            vendorName,
          });

          const dataUrl = await generateQrDataUrl(url, {
            width: 360,
            margin: 1,
          });

          return {
            item,
            numPrice,
            qrDataUrl: dataUrl,
          };
        })
      );

      const printWindow = window.open("", "_blank", "width=900,height=1000");
      if (!printWindow) {
        alert("Please allow popups to print QR sheets.");
        setIsPrinting(false);
        return;
      }

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>GOODLIFE FESTIVAL - QR Menu Tags - ${vendorName}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@700;900&family=JetBrains+Mono:wght@700;800;900&display=swap');

              @page {
                size: A4 portrait;
                margin: 8mm;
              }

              * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }

              body {
                background: #fff;
                color: #0a1128;
                font-family: 'Space Grotesk', -apple-system, sans-serif;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              .grid-container {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8mm;
                page-break-inside: auto;
              }

              .poster-card {
                border: 4px solid #0a1128;
                padding: 14px;
                text-align: center;
                background: #fdfbf7;
                page-break-inside: avoid;
                position: relative;
                box-shadow: 4px 4px 0px #ffde59, 6px 6px 0px #0a1128;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
              }

              .card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 2px solid #0a1128;
                padding-bottom: 6px;
                margin-bottom: 8px;
              }

              .brand-badge {
                background: #0a1128;
                color: #ffde59;
                font-family: 'Bebas Neue', sans-serif;
                font-size: 18px;
                padding: 2px 8px;
                letter-spacing: 1px;
                border: 2px solid #0a1128;
              }

              .vendor-tag {
                font-size: 9px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #ff6b35;
              }

              .item-name {
                font-family: 'Bebas Neue', sans-serif;
                font-size: 26px;
                line-height: 1;
                text-transform: uppercase;
                margin: 2px 0 6px 0;
                color: #0a1128;
              }

              .price-pill {
                font-family: 'JetBrains Mono', monospace;
                font-size: 20px;
                font-weight: 900;
                background: #ffde59;
                color: #0a1128;
                padding: 3px 14px;
                border: 2px solid #0a1128;
                display: inline-block;
                margin: 0 auto 6px auto;
                box-shadow: 3px 3px 0px #0a1128;
              }

              .qr-box {
                margin: 4px auto;
                display: inline-block;
                border: 3px solid #0a1128;
                padding: 6px;
                background: #fff;
                box-shadow: 3px 3px 0px #0a1128;
              }

              .qr-box img {
                width: 140px;
                height: 140px;
                display: block;
              }

              .till-box {
                background: #0a1128;
                color: #fff;
                border: 2px solid #0a1128;
                padding: 6px;
                margin: 8px 0 6px 0;
              }

              .till-label {
                font-size: 9px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #ffde59;
              }

              .till-num {
                font-family: 'JetBrains Mono', monospace;
                font-size: 26px;
                font-weight: 900;
                letter-spacing: 2px;
                color: #fff;
              }

              .card-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-top: 1px dashed #0a1128;
                padding-top: 6px;
                margin-top: 6px;
                font-size: 9px;
                font-weight: 800;
                text-transform: uppercase;
              }

              @media print {
                body {
                  background: #fff;
                  padding: 0;
                }
                .poster-card {
                  box-shadow: none !important;
                }
              }
            </style>
          </head>
          <body>
            <div class="grid-container">
              ${qrCards
                .map(
                  ({ item, numPrice, qrDataUrl }) => `
                <div class="poster-card">
                  <div class="card-header">
                    <div class="brand-badge">GOODLIFE</div>
                    <div class="vendor-tag">${vendorName}</div>
                  </div>

                  <div class="item-name">${item.name}</div>
                  ${
                    numPrice > 0
                      ? `<div class="price-pill">KES ${numPrice.toLocaleString("en-KE")}</div>`
                      : ""
                  }
                  
                  <div style="text-align: center;">
                    <div class="qr-box">
                      <img src="${qrDataUrl}" alt="${item.name} QR" />
                    </div>
                  </div>

                  <div class="till-box">
                    <div class="till-label">LIPA NA M-PESA TILL</div>
                    <div class="till-num">${cleanTill}</div>
                  </div>

                  <div class="card-footer">
                    <span>⚡ SCAN TO PAY</span>
                    <span>goodlife.smwhr.space</span>
                  </div>
                </div>
              `
                )
                .join("")}
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
    } catch (err) {
      console.error("Batch print failed", err);
      alert("Failed to render QR sheets. Try again.");
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-brand-navy/85 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-brand-off-white border-4 border-brand-navy w-full max-w-xl my-auto max-h-[92vh] flex flex-col shadow-(--shadow-brut-xl-accent) overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-brand-navy text-white p-4 flex items-center justify-between border-b-4 border-brand-navy shrink-0">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-brand-accent" />
            <h3 className="font-display text-lg uppercase tracking-wider text-brand-accent">
              Printable Goodlife Poster Sheet (A4)
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
          <div className="bg-white border-2 border-brand-navy p-3 text-xs">
            <p className="font-bold uppercase text-brand-navy">
              Stall: <strong>{vendorName}</strong> • Till: <strong>{cleanTill}</strong>
            </p>
            <p className="text-stone-500 text-[11px] mt-0.5">
              Generates high-contrast, poster-styled QR tags laid out 2x2 for clean cutting and display on stall counters.
            </p>
          </div>

          {/* Selection controls */}
          <div className="flex justify-between items-center text-xs font-mono">
            <div className="space-x-2">
              <button
                type="button"
                onClick={selectAll}
                className="underline font-bold text-brand-navy hover:text-brand-accent cursor-pointer"
              >
                Select All ({items.length})
              </button>
              <span className="text-stone-400">|</span>
              <button
                type="button"
                onClick={deselectAll}
                className="underline font-bold text-brand-navy hover:text-brand-accent cursor-pointer"
              >
                Clear
              </button>
            </div>
            <div className="font-bold text-stone-700">
              {selectedIds.length} of {items.length} selected
            </div>
          </div>

          {/* Item grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto border-2 border-brand-navy p-2 bg-white">
            {items.map((it, idx) => {
              const id = it.id ?? idx;
              const isSelected = selectedIds.includes(id);
              const numPrice = Number(it.price) || 0;

              return (
                <div
                  key={id}
                  onClick={() => toggleSelect(id)}
                  className={`p-2.5 border-2 flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? "bg-brand-accent/25 border-brand-navy font-bold shadow-(--shadow-brut-xs)"
                      : "bg-stone-50 border-stone-300 opacity-60 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-brand-navy shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-stone-400 shrink-0" />
                    )}
                    <span className="text-xs uppercase truncate">{it.name}</span>
                  </div>
                  <span className="text-xs font-mono font-black ml-2 shrink-0">
                    KES {numPrice.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Print button */}
          <div className="pt-2">
            <button
              type="button"
              disabled={isPrinting || selectedIds.length === 0}
              onClick={handlePrintSheet}
              className="w-full py-3.5 bg-brand-accent text-brand-navy border-2 border-brand-navy font-display text-lg uppercase shadow-(--shadow-brut-sm) active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2 hover:bg-brand-navy hover:text-brand-accent transition-all disabled:opacity-40 cursor-pointer"
            >
              <Printer className="w-5 h-5" />
              <span>
                {isPrinting
                  ? "Generating High-Res Sheets..."
                  : `Print ${selectedIds.length} Goodlife Poster Tags`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
