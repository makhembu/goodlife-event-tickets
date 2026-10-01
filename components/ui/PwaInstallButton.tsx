"use client";

import React, { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X } from "lucide-react";

interface PwaInstallButtonProps {
  appName: string;
  className?: string;
}

export default function PwaInstallButton({ appName, className = "" }: PwaInstallButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(true); // default to true to avoid SSR flash
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // 1. Check if running in standalone mode (already installed)
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) return;

    // 2. Check if iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIos(isIosDevice);

    // 3. Listen for Android/Chrome beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  // If already installed as PWA or in standalone browser frame, hide button
  if (isStandalone) {
    return null;
  }

  // If neither Chrome install prompt is ready nor iOS Safari, hide button
  if (!deferredPrompt && !isIos) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-brand-accent text-brand-navy border-2 border-brand-navy font-mono text-[11px] md:text-xs font-black uppercase tracking-wider shadow-(--shadow-brut-xs) hover:bg-brand-off-white hover:text-brand-navy transition-all cursor-pointer shrink-0 active:scale-95 ${className}`}
        title={`Install ${appName} on your home screen`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install {appName}</span>
      </button>

      {/* iOS Safari Guided Add-to-Home-Screen Modal */}
      {showIosGuide && (
        <div 
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            className="w-full max-w-sm bg-brand-off-white border-4 border-brand-navy p-4 sm:p-5 shadow-(--shadow-brut-xl-accent) text-brand-navy relative font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2 mb-3">
              <span className="font-display text-lg uppercase font-bold">Install {appName}</span>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="p-1 hover:bg-stone-200 border border-brand-navy cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs mb-3 font-bold uppercase text-brand-navy/80">
              Install this web app on your iPhone or iPad for quick standalone access:
            </p>

            <ol className="space-y-2 text-xs font-bold uppercase mb-4">
              <li className="flex items-center gap-2 p-2 bg-white border border-brand-navy">
                <Share className="w-4 h-4 text-brand-navy shrink-0" />
                <span>1. Tap Safari&apos;s <strong>Share</strong> button below</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-white border border-brand-navy">
                <PlusSquare className="w-4 h-4 text-brand-navy shrink-0" />
                <span>2. Scroll and tap <strong>&quot;Add to Home Screen&quot;</strong></span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-white border border-brand-navy">
                <span className="font-display text-sm font-black px-1.5 bg-brand-navy text-white">3</span>
                <span>3. Tap <strong>Add</strong> in the top right</span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2 bg-brand-navy text-white text-xs font-black uppercase hover:bg-brand-accent hover:text-brand-navy transition-colors border-2 border-brand-navy cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
