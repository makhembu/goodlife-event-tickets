"use client";

import React, { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

/**
 * Service Worker Update Prompt.
 * Listens for new service worker installation and provides a clean non-intrusive banner.
 *
 * SAFETY INVARIANT:
 * Checks window.__GOODLIFE_PAYMENT_ACTIVE__ before applying update.
 * If payment is in PROMPT_SENT or POLLING states, it suppresses automatic reloads
 * to prevent interrupting an in-flight M-Pesa STK push.
 */
export default function PwaUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleControllerChange = () => {
      // Check if active payment is in progress
      const isPaymentActive = Boolean((window as any).__GOODLIFE_PAYMENT_ACTIVE__);
      if (!isPaymentActive) {
        window.location.reload();
      } else {
        console.warn("[PWA] Update received but deferred because an active payment is in flight.");
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setShowPrompt(true);
      }

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShowPrompt(true);
          }
        });
      });
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const handleUpdate = () => {
    // Check if active payment is in flight
    const isPaymentActive = Boolean((window as any).__GOODLIFE_PAYMENT_ACTIVE__);
    if (isPaymentActive) {
      alert("Payment in progress. Please complete your M-Pesa payment before updating.");
      return;
    }

    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      setShowPrompt(false);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 bg-[#142B4C] text-white p-4 rounded-xl shadow-2xl border-2 border-[#FF6B35] flex items-center justify-between gap-3 animate-slide-up">
      <div className="flex items-center gap-3">
        <RefreshCw className="w-5 h-5 text-[#FF6B35] animate-spin-slow shrink-0" />
        <div className="text-xs">
          <p className="font-bold text-white text-sm">New version available</p>
          <p className="text-gray-300">Update now for the latest offline features.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleUpdate}
          className="bg-[#FF6B35] hover:bg-[#e85a26] text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow transition"
        >
          Update
        </button>
        <button
          onClick={() => setShowPrompt(false)}
          className="text-gray-400 hover:text-white p-1"
          aria-label="Dismiss update"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
