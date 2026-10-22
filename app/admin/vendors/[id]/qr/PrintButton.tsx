"use client";

import React from "react";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-brand-navy border-2 border-brand-navy font-mono text-xs font-black uppercase transition-transform active:translate-x-0.5 active:translate-y-0.5 cursor-pointer shadow-(--shadow-brut-xs)"
    >
      <Printer className="w-3.5 h-3.5" />
      <span>Print QR Card</span>
    </button>
  );
}
