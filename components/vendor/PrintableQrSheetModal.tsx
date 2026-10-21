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
  vendorName = "Vendor Stall",
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
            width: 320,
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
            <title>QR Menu Tags - ${vendorName}</title>
            <style>
              @page {
                size: A4 portrait;
                margin: 10mm;
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
              }
              .grid-container {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12mm;
                page-break-inside: auto;
              }
              .card {
                border: 3px solid #0a1128;
                padding: 14px;
                text-align: center;
                background: #fff;
                page-break-inside: avoid;
                position: relative;
                box-shadow: 4px 4px 0px #0a1128;
              }
              .badge {
                display: inline-block;
                background: #ffde59;
                color: #0a1128;
                font-weight: 900;
                font-size: 10px;
                padding: 2px 8px;
                border: 1.5px solid #0a1128;
                text-transform: uppercase;
                letter-spacing: 1px;
                margin-bottom: 6px;
              }
              .event {
                font-size: 9px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #555;
              }
              .name {
                font-size: 18px;
                font-weight: 900;
                text-transform: uppercase;
                margin: 4px 0;
                line-height: 1.2;
              }
              .price {
                font-size: 20px;
                font-weight: 900;
                font-family: monospace;
                display: inline-block;
                background: #f4f4f4;
                padding: 2px 10px;
                border: 1.5px solid #0a1128;
                margin-bottom: 8px;
              }
              .qr-box {
                margin: 6px auto;
                display: inline-block;
                border: 2px solid #0a1128;
                padding: 4px;
                background: #fff;
              }
              .qr-box img {
                width: 140px;
                height: 140px;
                display: block;
              }
              .till-box {
                background: #ffde59;
                border: 2px solid #0a1128;
                padding: 6px;
                margin: 8px 0 6px 0;
              }
              .till-label {
                font-size: 9px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 1px;
              }
              .till-num {
                font-size: 24px;
                font-weight: 900;
                font-family: monospace;
                letter-spacing: 1.5px;
              }
              .steps {
                font-size: 9px;
                font-weight: 700;
                color: #333;
                line-height: 1.3;
              }
              .cut-line {
                border-top: 1px dashed #aaa;
                margin-top: 8px;
                padding-top: 4px;
                font-size: 8px;
                color: #777;
                font-family: monospace;
              }
            </style>
          </head>
          <body>
            <div class="grid-container">
              ${qrCards
                .map(
                  ({ item, numPrice, qrDataUrl }) => `
                <div class="card">
                  <div class="badge">Lipa na M-Pesa • Buy Goods</div>
                  <div class="event">${eventName} • ${vendorName}</div>
                  <div class="name">${item.name}</div>
                  ${
                    numPrice > 0
                      ? `<div class="price">KES ${numPrice.toLocaleString("en-KE")}</div>`
                      : ""
                  }
                  
                  <div class="qr-box">
                    <img src="${qrDataUrl}" alt="QR code" />
                  </div>

                  <div class="till-box">
                    <div class="till-label">Buy Goods Till</div>
                    <div class="till-num">${cleanTill}</div>
                  </div>

                  <div class="steps">
                    Scan with any phone camera or M-Pesa to pay directly
                  </div>
                  <div class="cut-line">✂ Cut along border for shelf or table tent</div>
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
      console.error("Print sheet error", err);
      alert("Failed to prepare printable sheet.");
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-brand-navy/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white border-4 border-[var(--brand-navy)] w-full max-w-lg shadow-(--shadow-brut-lg) overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[var(--brand-navy)] text-white p-3.5 flex items-center justify-between border-b-2 border-[var(--brand-navy)]">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-brand-accent" />
            <h3 className="font-black text-xs uppercase tracking-wider">
              Batch Print QR Shelf Tags / Table Tents
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="flex items-center justify-between text-xs font-bold border-b border-gray-200 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-brand-navy/70">Selected:</span>
              <span className="bg-brand-accent px-2 py-0.5 border border-[var(--brand-navy)] font-mono font-black">
                {selectedIds.length} / {items.length} items
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] font-black uppercase text-brand-navy hover:underline"
              >
                Select All
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-[11px] font-black uppercase text-brand-navy/60 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {items.map((item, idx) => {
              const id = item.id ?? idx;
              const isSelected = selectedIds.includes(id);
              const numPrice = Number(item.price) || 0;

              return (
                <div
                  key={id}
                  onClick={() => toggleSelect(id)}
                  className={`p-2.5 border-2 transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? "border-[var(--brand-navy)] bg-brand-accent/15"
                      : "border-gray-200 bg-white opacity-60 hover:opacity-100"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-[var(--brand-navy)] shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <span className="text-xs font-black uppercase text-[var(--brand-navy)]">
                      {item.name}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-[var(--brand-navy)]">
                    KES {numPrice.toLocaleString("en-KE")}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="p-2.5 bg-gray-50 border-2 border-dashed border-[var(--brand-navy)] text-[11px] font-bold text-brand-navy flex items-center justify-between">
            <span>Till Number on Tags:</span>
            <span className="font-mono font-black text-sm bg-brand-accent px-1.5 py-0.5 border border-[var(--brand-navy)]">
              {cleanTill}
            </span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-3 bg-gray-50 border-t-2 border-[var(--brand-navy)] flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 py-2.5 border-2 border-[var(--brand-navy)] font-black text-xs uppercase bg-white hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePrintSheet}
            disabled={isPrinting || selectedIds.length === 0}
            className="w-2/3 py-2.5 bg-brand-accent text-brand-navy border-2 border-[var(--brand-navy)] font-black text-xs uppercase shadow-(--shadow-brut-xs) active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-1.5 hover:bg-brand-accent/90 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? "Generating..." : `Print ${selectedIds.length} Tags (A4)`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
