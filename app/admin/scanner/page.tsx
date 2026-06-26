"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  QrCode, 
  Flame, 
  Search, 
  ChevronRight, 
  ShieldCheck, 
  AlertTriangle, 
  UserCheck, 
  Camera, 
  PlusCircle, 
  Grid, 
  Hash, 
  HelpCircle,
  XCircle,
  RefreshCw,
  Clock,
  ArrowLeft
} from "lucide-react";
import Link from "next/link";
import { fetchEventDetails, EventDetails } from "@/lib/supabase-db";
import TicketStamp from "@/components/TicketStamp";

interface ScannedResult {
  success: boolean;
  alreadyScanned?: boolean;
  message: string;
  ticket?: {
    id: string;
    ticket_type: string;
    phone_number: string;
    mpesa_receipt: string;
    buyer_name: string;
    is_scanned: boolean;
    scanned_at: string | null;
    scanned_by: string | null;
  };
}

export default function ScannerControlPage() {
  const [manualId, setManualId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [isCameraSupported, setIsCameraSupported] = useState(true);
  const [cameraError, setCameraError] = useState("");

  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const handleVerifyRef = useRef<((id: string) => Promise<void>) | null>(null);

  const handleStartCamera = () => {
    setCameraError("");
    setScannerActive(true);
  };

  const handleStopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    setScannerActive(false);
  };

  // Results states
  const [lastScanResult, setLastScanResult] = useState<ScannedResult | null>(null);
  const [scannerName, setScannerName] = useState("Main Gate");
  const [recentScans, setRecentScans] = useState<ScannedResult[]>([]);
  const [unscannedTicketsList, setUnscannedTicketsList] = useState<any[]>([]);

  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [showSimulators, setShowSimulators] = useState(true);

  useEffect(() => {
    fetchEventDetails().then(setEventDetails).catch(console.error);
  }, []);

  const [dbTickets, setDbTickets] = useState<any[]>([]);

  const loadDbTickets = async () => {
    try {
      const res = await fetch("/api/admin/tickets");
      if (res.ok) {
        const data = await res.json();
        setDbTickets(data);
      }
    } catch {}
  };

  useEffect(() => {
    loadDbTickets();
  }, [lastScanResult]);

  // Execute Ticket scan API query
  const handleVerifyTicket = async (id: string) => {
    const targetId = id.trim().toUpperCase();
    if (!targetId) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/scan/${targetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanned_by: scannerName })
      });

      const data: ScannedResult = await res.json();
      setLastScanResult(data);
      
      // Prepend to history stack
      setRecentScans(prev => [data, ...prev.slice(0, 9)]);

      // Audio feedback if possible
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (data.success) {
          // Double high alert (Success)
          osc.frequency.setValueAtTime(600, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.15);
        } else {
          // Low flat buzz (Already scanned or invalid)
          osc.frequency.setValueAtTime(150, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.35);
        }
      } catch {}

    } catch (err: any) {
      setLastScanResult({
        success: false,
        message: "API routing timeout or server offline: " + err.message
      });
    } finally {
      setLoading(false);
      setManualId("");
    }
  };

  useEffect(() => {
    handleVerifyRef.current = handleVerifyTicket;
  });

  useEffect(() => {
    if (!scannerActive) return;

    let cancelled = false;

    (async () => {
      try {
        const Html5Qrcode = (await import("html5-qrcode")).Html5Qrcode;
        if (cancelled) return;

        const scanner = new Html5Qrcode("gate-scanner-viewport");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          async (decodedText: string) => {
            let ticketId = decodedText;
            if (decodedText.includes("/admin/scan/")) {
              const parts = decodedText.split("/admin/scan/");
              ticketId = parts[parts.length - 1];
            } else if (decodedText.startsWith("GL-")) {
              ticketId = decodedText;
            }

            await scanner.stop().catch(() => {});
            scannerRef.current = null;
            setScannerActive(false);
            if (handleVerifyRef.current) {
              await handleVerifyRef.current(ticketId);
            }
          },
          () => {}
        );
      } catch (err: any) {
        if (cancelled) return;
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setCameraError("Camera permission denied. Allow camera access in your browser settings and try again.");
        } else {
          setCameraError(`Camera unavailable: ${err.message || "No camera found on this device."}`);
          setIsCameraSupported(false);
        }
        scannerRef.current = null;
        setScannerActive(false);
        console.error("Camera error:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [scannerActive]);

  const handleSignOut = async () => {
    window.location.href = "/login";
  };

  const loadTicketsCatalog = () => {
    try {
      const stored = localStorage.getItem("goodlife_tickets");
      if (stored) {
        const parsed = JSON.parse(stored);
        setUnscannedTicketsList(parsed);
      }
    } catch {}
  };

  // Load ticket catalog for rapid developer testing
  useEffect(() => {
    setTimeout(() => {
      loadTicketsCatalog();
    }, 0);
  }, [lastScanResult]);

  const [listTab, setListTab] = useState<"active" | "scanned">("active");

  const activeTickets = unscannedTicketsList.filter(t => !t.is_scanned);
  const scannedTickets = unscannedTicketsList
    .filter(t => t.is_scanned)
    .sort((a, b) => {
      const timeA = a.scanned_at ? new Date(a.scanned_at).getTime() : 0;
      const timeB = b.scanned_at ? new Date(b.scanned_at).getTime() : 0;
      return timeB - timeA;
    });

  const activeCatalog = (listTab === "active" ? activeTickets : scannedTickets).filter(t => 
    !searchQuery || t.id.toLowerCase().includes(searchQuery.toLowerCase()) || t.phone_number.includes(searchQuery)
  );

  return (
    <div className="min-h-screen bg-[var(--brand-off-white)] py-6 px-4 md:px-8 text-[var(--brand-navy)] font-sans">
      
      {/* HEADER BARS */}
      <div className="max-w-md mx-auto flex items-center justify-between border-b-2 border-[var(--brand-navy)] pb-4 mb-6">
        <Link href="/" className="flex items-center gap-1.5 text-xs font-black uppercase text-[var(--brand-navy)]">
          <ArrowLeft className="w-4 h-4" /> Exit
        </Link>
        <span className="font-sans font-black tracking-widest text-xs bg-[var(--brand-navy)] text-[var(--brand-off-white)] px-2 py-0.5 uppercase">
          GATE CHECK-IN
        </span>
        <div className="flex gap-1">
          <Link href="/admin/dashboard" className="text-xs font-bold uppercase border-2 border-[var(--brand-navy)] px-2 py-0.5">
            Metrics
          </Link>
          <button
            onClick={handleSignOut}
            className="text-xs font-bold uppercase border-2 border-red-600 text-red-600 px-2 py-0.5 hover:bg-red-600 hover:text-white transition-colors"
          >
            Out
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto space-y-6">

        {/* SCAN CONFIG BAR */}
        <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-4 relative shadow-[4px_4px_0px_0px_var(--brand-navy)]">
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="scanner-name" className="text-xs font-black tracking-widest uppercase text-[var(--brand-navy)] block">
              1. STAFF NAME
            </label>
            {eventDetails?.simulators_enabled !== false && (
              <button
                type="button"
                onClick={() => setShowSimulators(!showSimulators)}
                className="text-[9px] font-black uppercase border border-[var(--brand-navy)] px-1.5 py-0.5 hover:bg-[var(--brand-navy)] hover:text-white transition-colors cursor-pointer bg-white text-[var(--brand-navy)]"
              >
                Simulators: {showSimulators ? "HIDE" : "SHOW"}
              </button>
            )}
          </div>
          <input
            id="scanner-name"
            name="scannerName"
            type="text"
            value={scannerName}
            onChange={(e) => setScannerName(e.target.value)}
            className="w-full py-1.5 px-3 bg-white border-2 border-[var(--brand-navy)] font-bold text-xs uppercase focus:outline-none"
            placeholder="Enter your name..."
          />
        </div>

        {/* MAIN SCANNING UNIT */}
        <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-5 relative shadow-[6px_6px_0px_0px_var(--brand-navy)]">
          <h2 className="text-lg font-sans font-black tracking-tight uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-4 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[var(--brand-navy)]" />
            QR SCANNER
          </h2>

          {/* VIEWPORT AREA */}
          <div className="relative aspect-square w-full bg-slate-900 border-2 border-[var(--brand-navy)] mb-4 overflow-hidden flex flex-col items-center justify-center text-[var(--brand-off-white)]" aria-label="Camera scanner viewport">
            
            {scannerActive ? (
              <div className="relative w-full h-full">
                <div id="gate-scanner-viewport" className="w-full h-full" />
                <button
                  onClick={handleStopCamera}
                  className="absolute top-2 right-2 z-20 bg-red-600 text-white text-[9px] font-black uppercase px-2 py-1 border border-red-700 hover:bg-red-700 transition-colors flex items-center gap-1"
                >
                  <XCircle className="w-3 h-3" /> STOP
                </button>
              </div>
            ) : (
              <div className="text-center p-6 space-y-3.5 z-10">
                <Camera className="w-12 h-12 text-[var(--brand-navy-light)] mx-auto animate-pulse" />
                <p className="text-xs font-black tracking-wide uppercase max-w-[240px] mx-auto">
                  Camera is offline. Click below to enable scanner.
                </p>
                {cameraError && (
                  <p className="text-[10px] font-bold text-red-500 bg-red-50 px-3 py-2 border border-red-200 -mt-2">
                    {cameraError}
                  </p>
                )}
                <button
                  onClick={handleStartCamera}
                  className="px-5 py-2.5 bg-[var(--brand-off-white)] text-[var(--brand-navy)] font-extrabold text-xs uppercase border-2 border-[var(--brand-navy)] hover:bg-[var(--brand-navy)] hover:text-[var(--brand-off-white)] transition-colors"
                >
                  START SCANNER
                </button>
              </div>
            )}

            {/* Simulated frame overlays */}
            <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-red-500 pointer-events-none" />
            <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-red-500 pointer-events-none" />
            <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-red-500 pointer-events-none" />
            <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-red-500 pointer-events-none" />
          </div>

          {/* MANUAL GATE OVERRIDE AND BYPASS KEYPAD */}
          <div className="border-t-2 border-[var(--brand-navy)] pt-4 space-y-3">
            <label htmlFor="manual-ticket-id" className="text-[10px] tracking-widest font-black uppercase text-[var(--brand-navy)] block">
              2. MANUAL TICKET LOOKUP
            </label>
            
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyTicket(manualId);
              }}
              className="flex gap-2"
            >
              <input
                id="manual-ticket-id"
                name="manualTicketId"
                type="text"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="e.g. GL-OJG3843XYZ"
                className="flex-1 px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs font-bold uppercase focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 bg-[var(--brand-navy)] text-white font-bold text-xs uppercase border-2 border-[var(--brand-navy)] hover:bg-[var(--brand-navy-light)]"
              >
                {loading ? "CHECKING..." : "SUBMIT"}
              </button>
            </form>
          </div>
        </div>

        {/* INTERACTIVE SCAN RESPONSE DISPLAYS */}
        <AnimatePresence mode="wait">
          {lastScanResult && (
            <motion.div
              key={JSON.stringify(lastScanResult)}
              initial={{ opacity: 0, scale: 0.92, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 5 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              role="status"
              aria-live="assertive"
              className={`border-4 p-5 ${
                lastScanResult.success 
                  ? "border-green-600 bg-green-50 text-green-900" 
                  : "border-red-600 bg-red-50 text-red-900"
              } shadow-[4px_4px_0px_0px_currentColor]`}
            >
              <div className="flex items-start gap-4">
                {lastScanResult.success ? (
                  <div className="w-12 h-12 shrink-0 rounded-full bg-green-100 border-2 border-green-500 flex items-center justify-center">
                    <UserCheck className="w-6 h-6 text-green-700" />
                  </div>
                ) : (
                  <div className="w-12 h-12 shrink-0 rounded-full bg-red-100 border-2 border-red-500 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-700" />
                  </div>
                )}
                
                <div className="space-y-2 flex-1">
                  <TicketStamp
                    text={lastScanResult.success ? "ENTRY CLEARED" : lastScanResult.alreadyScanned ? "ALREADY USED" : "STOP"}
                    variant={lastScanResult.success ? "success" : lastScanResult.alreadyScanned ? "used" : "fail"}
                  />
                  
                  <h3 className="font-extrabold text-lg uppercase leading-tight">
                    {lastScanResult.message}
                  </h3>

                  {lastScanResult.ticket && (
                    <div className="text-[13px] space-y-1.5 pt-2 border-t border-current/20 font-bold">
                      <p>ATTENDEE: <strong className="uppercase tracking-wide">{lastScanResult.ticket.buyer_name || "UNKNOWN"}</strong></p>
                      <p>ACCESS TYPE: <strong className="underline decoration-2">{lastScanResult.ticket.ticket_type}</strong></p>
                      <p>PHONE: <span className="font-mono">{lastScanResult.ticket.phone_number}</span></p>
                      <p>RECEIPT: <span className="font-mono">{lastScanResult.ticket.mpesa_receipt}</span></p>
                      {lastScanResult.ticket.scanned_at && (
                        <p className="text-[10px] text-current/60 font-mono">
                          SCANNED {new Date(lastScanResult.ticket.scanned_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!lastScanResult && dbTickets.length === 0 && (
          <div className="border-4 border-[var(--brand-navy)]/20 bg-white p-8 text-center space-y-3">
            <ShieldCheck className="w-10 h-10 mx-auto text-[var(--brand-navy-light)]" />
            <p className="text-xs font-black uppercase text-[var(--brand-navy-light)]">Scan or enter a ticket ID to begin</p>
            <p className="text-[10px] text-slate-400 font-medium">
              Point the camera at a QR code or type a ticket ID manually.
            </p>
          </div>
        )}

        {eventDetails?.simulators_enabled !== false && showSimulators && (
          /* DEV FAST-CLICK SIMULATED DATABASE */
          <div className="border-4 border-dashed border-[var(--brand-navy-light)] bg-[var(--brand-off-white)] p-4 space-y-3">
            <span className="text-[10px] tracking-widest font-black uppercase text-[var(--brand-navy-light)] block border-b border-dashed border-[var(--brand-navy-light)] pb-1">
              STAFF TEST SCANS
            </span>
            <p className="text-[11px] leading-tight font-medium text-[var(--brand-navy-light)]">
              Use saved local tickets to test gate decisions without opening the camera.
            </p>

            {/* Tabs */}
            <div className="flex border-b-2 border-[var(--brand-navy-light)]">
              <button
                onClick={() => setListTab("active")}
                className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest border-b-2 -mb-[2px] transition-colors ${
                  listTab === "active"
                    ? "border-[var(--brand-navy-light)] text-[var(--brand-navy-light)]"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                ACTIVE ({activeTickets.length})
              </button>
              <button
                onClick={() => setListTab("scanned")}
                className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest border-b-2 -mb-[2px] transition-colors ${
                  listTab === "scanned"
                    ? "border-[var(--brand-navy-light)] text-[var(--brand-navy-light)]"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                SCANNED ({scannedTickets.length})
              </button>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {unscannedTicketsList.length === 0 ? (
                <p className="text-[10px] text-center font-bold text-slate-500 py-3">
                  No tickets in local storage. Purchase inside the main portal first.
                </p>
              ) : activeCatalog.length === 0 ? (
                <p className="text-[10px] text-center font-bold text-slate-400 py-3">
                  No {listTab === "active" ? "active" : "scanned"} tickets in this batch.
                </p>
              ) : (
                activeCatalog.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => handleVerifyTicket(ticket.id)}
                    className={`w-full p-2.5 text-left border-2 text-[11px] font-bold flex justify-between items-center transition-all ${
                      ticket.is_scanned 
                        ? "bg-red-50 border-red-300 text-red-900 hover:bg-red-100" 
                        : "bg-green-50 border-green-300 text-green-900 hover:bg-green-100"
                    }`}
                  >
                    <div className="text-left">
                      <span className="font-mono block text-xs font-black">{ticket.id}</span>
                      <span className="text-[9px] uppercase text-slate-600">
                        Tier: {ticket.ticket_type} | Ph: {ticket.phone_number}
                      </span>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className={`text-[8.5px] px-1 py-0.2 font-black uppercase ${
                        ticket.is_scanned ? "bg-red-600 text-white" : "bg-green-600 text-white"
                      }`}>
                        {ticket.is_scanned ? "SCANNED (USED)" : "ACTIVE / UNUSED"}
                      </span>
                      {ticket.is_scanned && (
                        <span className="text-[8px] font-mono mt-0.5 text-red-700 font-bold">
                          {new Date(ticket.scanned_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* ALL SCANNED TICKETS LEDGER (LATEST TO OLDEST) */}
        <div className="border-4 border-[var(--brand-navy)] bg-white p-4 shadow-[4px_4px_0px_0px_var(--brand-navy)] space-y-3">
          <span className="text-[10px] tracking-widest font-black uppercase text-[var(--brand-navy)] block border-b border-[var(--brand-navy)] pb-1">
            SCANNED TICKETS LEDGER
          </span>
          <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
            {dbTickets.filter(t => t.is_scanned).length === 0 ? (
              <p className="text-[10px] text-center font-bold text-slate-500 py-3 uppercase">
                No tickets scanned at the gate yet.
              </p>
            ) : (
              dbTickets
                .filter(t => t.is_scanned)
                .sort((a, b) => new Date(b.scanned_at || 0).getTime() - new Date(a.scanned_at || 0).getTime())
                .map((ticket) => (
                  <div
                    key={ticket.id}
                    className="p-2.5 border-2 border-red-300 bg-red-50 text-red-950 text-[11px] font-bold flex justify-between items-center"
                  >
                    <div className="text-left">
                      <span className="font-mono block text-xs font-black">{ticket.id}</span>
                      <span className="text-[9px] uppercase text-red-800">
                        {ticket.buyer_name || "UNKNOWN"} | Tier: {ticket.ticket_type}
                      </span>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-[8.5px] px-1 py-0.2 font-black uppercase bg-red-600 text-white">
                        SCANNED
                      </span>
                      {ticket.scanned_at && (
                        <span className="text-[8px] font-mono mt-0.5 text-red-700 font-bold">
                          {new Date(ticket.scanned_at).toLocaleTimeString()} by {ticket.scanned_by || "Gate"}
                        </span>
                      )}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* SCAN HISTORY FLOW */}
        {recentScans.length > 0 && (
          <div className="border-4 border-[var(--brand-navy)] bg-white p-4 space-y-2 shadow-[4px_4px_0px_0px_var(--brand-navy)]">
            <div className="flex items-center justify-between border-b-2 border-[var(--brand-navy)] pb-2">
              <span className="text-[10px] tracking-widest font-black uppercase text-[var(--brand-navy)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> SCAN LOG
              </span>
              <span className="text-[9px] font-mono text-slate-500 font-bold">
                Last {recentScans.length} scans
              </span>
            </div>
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {recentScans.map((scan, i) => (
                <div 
                  key={i} 
                  className={`flex items-center justify-between p-2 text-[10px] font-bold border-l-4 ${
                    scan.success 
                      ? "border-l-green-500 bg-green-50 text-green-900" 
                      : "border-l-red-500 bg-red-50 text-red-900"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 shrink-0 rounded-full ${
                      scan.success ? "bg-green-500" : "bg-red-500"
                    }`} />
                    <span className="font-mono uppercase truncate">
                      {scan.ticket?.id || "INVALID"}
                    </span>
                  </div>
                  <span className={`shrink-0 ml-2 text-[8.5px] tracking-widest px-1 ${
                    scan.success ? "bg-green-200" : "bg-red-200"
                  }`}>
                    {scan.success ? "CLEARED" : "DENIED"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

