"use client";

import React, { useState } from "react";
import { Heart } from "lucide-react";
import TipModal from "@/components/radio/TipModal";

interface PresenterTipButtonProps {
  presenterId: number;
  presenterName: string;
}

export default function PresenterTipButton({ presenterId, presenterName }: PresenterTipButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-[#C8A54A] hover:bg-[#d9b65b] text-[#142B4C] font-mono text-xs font-black uppercase tracking-wider rounded border-2 border-[#142B4C] shadow-xs cursor-pointer transition-transform active:scale-95"
      >
        <Heart className="w-4 h-4 fill-[#142B4C]" />
        <span>Cheer DJ {presenterName}</span>
      </button>

      <TipModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        presenterId={presenterId}
        presenterName={presenterName}
      />
    </>
  );
}
