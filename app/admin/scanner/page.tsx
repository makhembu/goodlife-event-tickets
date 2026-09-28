"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { fmtDate, fmtTime } from "@/lib/utils";
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
  ArrowLeft,
  Tent,
  Layers,
  Users,
  BedSingle
} from "lucide-react";
import Link from "next/link";
import { fetchEventDetails, EventDetails, Event } from "@/lib/supabase-db";
import TicketStamp from "@/components/TicketStamp";

interface ScannedResult {
  success: boolean;
  alreadyScanned?: boolean;
  message: string;
  camping_instruction?: string;
  admitted_count?: number;
  guest_count?: number;
  ticket?: {
    id: string;
    ticket_type: string;
    phone_number: string;
    mpesa_receipt: string;
    buyer_name: string;
    is_scanned: boolean;
    scanned_at: string | null;
    scanned_by: string | null;
    guest_count?: number;
    admitted_count?: number;
    is_camping?: boolean;
    camping_type?: string;
    event_id?: number | null;
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
  const handleVerifyRef = useRef<((id: string, admitCount?: number) => Promise<void>) | null>(null);

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

  // Multi-event gate selection states
  const [eventsList, setEventsList] = useState<Event[]>([]);
  const [selectedGateEventId, setSelectedGateEventId] = useState<number | null>(null);

  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [showSimulators, setShowSimulators] = useState(false);
  const [listTab, setListTab] = useState<"active" | "scanned">("active");

  useEffect(() => {
    fetchEventDetails().then(setEventDetails).catch(console.error);

    fetch("/api/events")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEventsList(data);
          const active = data.find((e: Event) => e.is_active) || data[0];
          if (active) setSelectedGateEventId(active.id);
        }
      })
      .catch(console.error);
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
  const handleVerifyTicket = async (id: string, admitCount: number = 1) => {
    const targetId = id.trim().toUpperCase();
    if (!targetId) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/scan/${targetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          scanned_by: scannerName,
          event_id: selectedGateEventId,
          admit_count: admitCount
        })
      });

      const data: ScannedResult = res.ok ? await res.json() : {
        success: false,
        message: `Server error (${res.status}). Try again or contact admin.`
      };
      setLastScanResult(data);

      // Prepend to history stack
      setRecentScans(prev => [data, ...prev.slice(0, 9)]);

      // Haptic + audio feedback
      try {
        if (data.success) {
          navigator.vibrate?.(50);
        } else if (data.alreadyScanned) {
          navigator.vibrate?.([80, 40, 80]);
        } else {
          navigator.vibrate?.([100, 50, 100]);
        }
      } catch {}
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (data.success) {
          osc.frequency.setValueAtTime(600, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.15);
        } else {
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
            } else if (decodedText.includes("/admin/scanner?ticket=")) {
              const u = new URL(decodedText);
              ticketId = u.searchParams.get("ticket") || decodedText;
            } else {
              setLastScanResult({
                success: false,
                message: "INVALID QR: This code is not a GOODLIFE event ticket."
              });
              return;
            }

            if (handleVerifyRef.current) {
              await handleVerifyRef.current(ticketId);
            }
          },
          () => {}
        );
      } catch (err: any) {
        console.error("Camera scanner error:", err);
        setCameraError(err.message || "Failed to start camera. Check permissions.");
        setScannerActive(false);
      }
    })();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        try {
          scannerRef.current.stop();
        } catch {}
        scannerRef.current = null;
      }
    };
  }, [scannerActive]);

  const activeTickets = dbTickets.filter(t => !t.is_scanned && (!selectedGateEventId || t.event_id === selectedGateEventId));
  const scannedTickets = dbTickets.filter(t => t.is_scanned && (!selectedGateEventId || t.event_id === selectedGateEventId));
  const activeCatalog = listTab === "active" ? activeTickets : scannedTickets;

  const currentGateEvent = eventsList.find(e => e.id === selectedGateEventId);

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] py-6 px-4 md:px-8 text-[var(--brand-navy)] font-mono selection:bg-[var(--brand-accent)] selection:text-white">
      <div className="max-w-xl mx-auto space-y-4">
        
        {/* TOP BRANDING & NAVIGATION HEADER */}
        <header className="flex items-center justify-between border-b-4 border-[var(--brand-navy)] pb-3">
          <div className="flex items-center gap-2">
            <Link 
              href="/admin/dashboard" 
              className="p-1.5 border-2 border-[var(--brand-navy)] bg-brand-off-white hover:bg-[var(--brand-accent)] hover:text-white transition-colors"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-[var(--brand-navy)]" />
              <h1 className="font-sans font-black tracking-tighter text-xl uppercase">GATE SCANNER</h1>
            </div>
          </div>
          <span className="text-[11px] px-2 py-0.5 font-bold uppercase bg-[var(--brand-navy)] text-white border border-[var(--brand-navy)]">
            LIVE VERIFY
          </span>
        </header>

        {/* GATE EVENT SELECTOR (Scenario S1 Defense) */}
        <div className="border-4 border-[var(--brand-navy)] bg-brand-accent/10 p-3 shadow-(--shadow-brut-xs) space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="gate-event-select" className="text-[11px] font-black uppercase text-[var(--brand-navy)] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[var(--brand-navy)]" />
              ACTIVE GATE EVENT (VALIDATION BOUNDARY)
            </label>
            {currentGateEvent && (
              <span className={`text-[10px] font-bold px-1.5 py-0.2 uppercase border ${
                currentGateEvent.category === 'mini' ? 'bg-green-100 text-green-900 border-green-600' : 'bg-brand-accent text-brand-navy border-brand-navy'
              }`}>
                {currentGateEvent.category === 'mini' ? 'MINI' : 'FLAGSHIP'}
              </span>
            )}
          </div>

          <select
            id="gate-event-select"
            value={selectedGateEventId || ""}
            onChange={(e) => setSelectedGateEventId(Number(e.target.value))}
            className="w-full py-2 px-3 bg-brand-off-white border-2 border-[var(--brand-navy)] font-bold text-xs uppercase focus:outline-none"
          >
            {eventsList.map(e => (
              <option key={e.id} value={e.id}>
                #{e.id} — {e.title} ({e.venue || "VENUE TBA"}) [{e.status?.toUpperCase()}]
              </option>
            ))}
          </select>
          <p className="text-[10px] text-brand-navy/70 leading-tight">
            Scanner will reject tickets issued for other editions (Cross-Event defense).
          </p>
        </div>

        {/* STAFF OPERATOR IDENTIFIER CARD */}
        <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-4 relative shadow-(--shadow-brut-md)">
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="scanner-name" className="text-xs font-black tracking-widest uppercase text-[var(--brand-navy)] block">
              1. GATE STEWARD / OPERATOR
            </label>
            {eventDetails?.simulators_enabled !== false && (
              <button
                type="button"
                onClick={() => setShowSimulators(!showSimulators)}
                className="text-[11px] font-black uppercase border border-[var(--brand-navy)] px-1.5 py-0.5 hover:bg-[var(--brand-navy)] hover:text-brand-off-white transition-colors cursor-pointer bg-brand-off-white text-[var(--brand-navy)]"
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
            className="w-full py-1.5 px-3 bg-brand-off-white border-2 border-[var(--brand-navy)] font-bold text-xs uppercase focus:outline-none"
            placeholder="Gate Steward Name (e.g. John - Gate A)"
          />
        </div>

        {/* MAIN SCANNING UNIT */}
        <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-5 relative shadow-(--shadow-brut-lg)">
          <h2 className="text-lg font-sans font-black tracking-tight uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-4 flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[var(--brand-navy)]" />
            CAMERA SCANNER
          </h2>

          {/* VIEWPORT AREA */}
          <div role="region" aria-label="Camera scanner viewport" className="relative aspect-square w-full bg-[var(--brand-navy)] border-2 border-[var(--brand-navy)] mb-4 overflow-hidden flex flex-col items-center justify-center text-[var(--brand-off-white)]">
            
            {scannerActive ? (
              <div className="relative w-full h-full">
                <div id="gate-scanner-viewport" className="w-full h-full" />
                <button
                  onClick={handleStopCamera}
                  className="absolute top-2 right-2 z-20 bg-red-600 text-white text-[11px] font-black uppercase px-2 py-1 border border-red-700 hover:bg-red-700 transition-colors flex items-center gap-1 cursor-pointer"
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
                  <p className="text-[11px] font-bold text-red-500 bg-red-50 px-3 py-2 border border-red-200 -mt-2">
                    {cameraError}
                  </p>
                )}
                <button
                  onClick={handleStartCamera}
                  className="px-5 py-2.5 bg-[var(--brand-off-white)] text-[var(--brand-navy)] font-extrabold text-xs uppercase border-2 border-[var(--brand-navy)] hover:bg-[var(--brand-navy)] hover:text-[var(--brand-off-white)] transition-colors cursor-pointer"
                >
                  START SCANNER
                </button>
              </div>
            )}

            {/* Frame overlays */}
            <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-red-500 pointer-events-none" />
            <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-red-500 pointer-events-none" />
            <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-red-500 pointer-events-none" />
            <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-red-500 pointer-events-none" />
          </div>

          {/* MANUAL TICKET LOOKUP */}
          <div className="border-t-2 border-[var(--brand-navy)] pt-4 space-y-3">
            <label htmlFor="manual-ticket-id" className="text-[11px] tracking-widest font-black uppercase text-[var(--brand-navy)] block">
              2. MANUAL PASS LOOKUP / OVERRIDE
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
                placeholder="e.g. GL-7X9AB"
                className="flex-1 px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs font-bold uppercase focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 bg-[var(--brand-navy)] text-[var(--brand-off-white)] font-black text-xs uppercase border-2 border-[var(--brand-navy)] hover:bg-[var(--brand-navy-light)] transition-colors cursor-pointer"
              >
                {loading ? "CHECKING..." : "VERIFY"}
              </button>
            </form>
          </div>
        </div>

        {/* SCAN RESULT DISPLAY */}
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
                  ? "border-green-600 bg-green-50 text-green-950"
                  : "border-red-600 bg-red-50 text-red-950"
              } shadow-(--shadow-brut-md)`}
            >
              <div className="flex items-start gap-3">
                {lastScanResult.success ? (
                  <div className="w-12 h-12 shrink-0 rounded-full bg-green-100 border-2 border-green-500 flex items-center justify-center">
                    <UserCheck className="w-6 h-6 text-green-700" />
                  </div>
                ) : (
                  <div className="w-12 h-12 shrink-0 rounded-full bg-red-100 border-2 border-red-500 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-700" />
                  </div>
                )}
                
                <div className="space-y-3 flex-1 min-w-0">
                  <TicketStamp
                    text={lastScanResult.success ? "ENTRY CLEARED" : lastScanResult.alreadyScanned ? "ALREADY USED" : "STOP"}
                    variant={lastScanResult.success ? "success" : lastScanResult.alreadyScanned ? "used" : "fail"}
                  />
                  
                  <h3 className="font-extrabold text-base md:text-lg uppercase leading-tight">
                    {lastScanResult.message}
                  </h3>

                  {/* CAMPING PASS INSTRUCTION (OPTION B DORM vs PRIVATE) */}
                  {lastScanResult.camping_instruction && (
                    <div className="p-3 bg-brand-navy text-brand-off-white border-2 border-brand-accent shadow-(--shadow-brut-xs) space-y-1">
                      <div className="flex items-center gap-1.5 text-brand-accent font-display text-xs uppercase">
                        <Tent className="w-4 h-4 text-brand-accent" />
                        ACCOMMODATION STEWARD ACTION:
                      </div>
                      <p className="font-mono text-xs font-black uppercase text-brand-off-white">
                        {lastScanResult.camping_instruction}
                      </p>
                    </div>
                  )}

                  {/* GROUP ADMISSION PROGRESS & ACTIONS */}
                  {lastScanResult.guest_count && lastScanResult.guest_count > 1 && (
                    <div className="p-3 bg-white border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold uppercase">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" /> GROUP ADMISSION:
                        </span>
                        <span>{lastScanResult.admitted_count || 1} / {lastScanResult.guest_count} CHECKED IN</span>
                      </div>
                      
                      {/* Bar */}
                      <div className="w-full h-3 bg-gray-200 border border-[var(--brand-navy)] overflow-hidden">
                        <div 
                          className="h-full bg-brand-accent transition-all duration-300"
                          style={{ width: `${Math.min(100, (((lastScanResult.admitted_count || 1) / lastScanResult.guest_count)) * 100)}%` }}
                        />
                      </div>

                      {/* Incremental check-in buttons if guests remaining */}
                      {(lastScanResult.admitted_count || 0) < lastScanResult.guest_count && (
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleVerifyTicket(lastScanResult.ticket!.id, 1)}
                            className="flex-1 py-1.5 px-2 bg-[var(--brand-navy)] text-white font-mono text-xs font-bold uppercase hover:bg-[var(--brand-accent)] hover:text-[var(--brand-navy)] transition-colors border border-[var(--brand-navy)] cursor-pointer"
                          >
                            +1 GUEST NOW
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleVerifyTicket(lastScanResult.ticket!.id, lastScanResult.guest_count! - (lastScanResult.admitted_count || 0))}
                            className="flex-1 py-1.5 px-2 bg-[var(--brand-accent)] text-[var(--brand-navy)] font-mono text-xs font-bold uppercase hover:bg-[var(--brand-navy)] hover:text-white transition-colors border border-[var(--brand-navy)] cursor-pointer"
                          >
                            ALL REMAINING ({lastScanResult.guest_count! - (lastScanResult.admitted_count || 0)})
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {lastScanResult.ticket && (
                    <div className="text-[11px] space-y-1 pt-2 border-t border-current/20 font-bold">
                      <p>ATTENDEE: <strong className="uppercase">{lastScanResult.ticket.buyer_name || "UNKNOWN"}</strong></p>
                      <p>PASS TIER: <strong className="underline decoration-2">{lastScanResult.ticket.ticket_type}</strong></p>
                      <p>PHONE: <span className="font-mono">{lastScanResult.ticket.phone_number}</span></p>
                      <p>RECEIPT: <span className="font-mono">{lastScanResult.ticket.mpesa_receipt}</span></p>
                      {lastScanResult.ticket.scanned_at && (
                        <p className="text-[10px] opacity-70 font-mono">
                          LAST CHECK-IN: {fmtDate(lastScanResult.ticket.scanned_at)} by {lastScanResult.ticket.scanned_by || "Gate"}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SIMULATOR DATABASE */}
        {eventDetails?.simulators_enabled !== false && showSimulators && (
          <div className="border-4 border-dashed border-[var(--brand-navy-light)] bg-[var(--brand-off-white)] p-4 space-y-3">
            <span className="text-[11px] tracking-widest font-black uppercase text-[var(--brand-navy-light)] block border-b border-dashed border-[var(--brand-navy-light)] pb-1">
              STAFF TEST SCANS
            </span>
            <div className="flex border-b-2 border-[var(--brand-navy-light)]">
              <button
                onClick={() => setListTab("active")}
                className={`flex-1 py-1.5 text-[11px] font-black uppercase tracking-widest border-b-2 -mb-[2px] transition-colors cursor-pointer ${
                  listTab === "active"
                    ? "border-[var(--brand-navy-light)] text-[var(--brand-navy-light)]"
                    : "border-transparent text-[var(--brand-navy)]/40 hover:text-[var(--brand-navy)]/60"
                }`}
              >
                ACTIVE ({activeTickets.length})
              </button>
              <button
                onClick={() => setListTab("scanned")}
                className={`flex-1 py-1.5 text-[11px] font-black uppercase tracking-widest border-b-2 -mb-[2px] transition-colors cursor-pointer ${
                  listTab === "scanned"
                    ? "border-[var(--brand-navy-light)] text-[var(--brand-navy-light)]"
                    : "border-transparent text-[var(--brand-navy)]/40 hover:text-[var(--brand-navy)]/60"
                }`}
              >
                SCANNED ({scannedTickets.length})
              </button>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {activeCatalog.length === 0 ? (
                <p className="text-[11px] text-center font-bold text-[var(--brand-navy)]/40 py-3">
                  No {listTab === "active" ? "active" : "scanned"} tickets for event #{selectedGateEventId}.
                </p>
              ) : (
                activeCatalog.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => handleVerifyTicket(ticket.id)}
                    className={`w-full p-2.5 text-left border-2 text-[11px] font-bold flex justify-between items-center transition-all cursor-pointer ${
                      ticket.is_scanned 
                        ? "bg-red-50 border-red-300 text-red-900 hover:bg-red-100" 
                        : "bg-green-50 border-green-300 text-green-900 hover:bg-green-100"
                    }`}
                  >
                    <div className="text-left">
                      <span className="font-mono block text-xs font-black">{ticket.id}</span>
                      <span className="text-[10px] uppercase text-[var(--brand-navy)]/60">
                        {ticket.ticket_type} | {ticket.buyer_name}
                      </span>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className={`text-[10px] px-1 py-0.2 font-black uppercase ${
                        ticket.is_scanned ? "bg-red-600 text-white" : "bg-green-600 text-white"
                      }`}>
                        {ticket.is_scanned ? "SCANNED" : "READY"}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* SCAN LOG FLOW */}
        {recentScans.length > 0 && (
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-3 space-y-2 shadow-(--shadow-brut-md)">
            <div className="flex items-center justify-between border-b-2 border-[var(--brand-navy)] pb-1.5">
              <span className="text-[11px] tracking-widest font-black uppercase text-[var(--brand-navy)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> RECENT SCANS
              </span>
              <span className="text-[10px] font-mono text-[var(--brand-navy-light)] font-bold">
                Last {recentScans.length}
              </span>
            </div>
            <div className="space-y-1 max-h-[160px] overflow-y-auto">
              {recentScans.map((scan, i) => (
                <div 
                  key={i} 
                  className={`flex items-center justify-between p-1.5 text-[11px] font-bold border-l-4 ${
                    scan.success 
                      ? "border-l-green-500 bg-green-50 text-green-900" 
                      : "border-l-red-500 bg-red-50 text-red-900"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 shrink-0 rounded-full ${
                      scan.success ? "bg-green-500" : "bg-red-500"
                    }`} />
                    <span className="font-mono uppercase truncate text-[11px]">
                      {scan.ticket?.id || "INVALID"}
                    </span>
                  </div>
                  <span className={`shrink-0 ml-2 text-[10px] tracking-widest px-1 ${
                    scan.success ? "bg-green-200" : "bg-red-200"
                  }`}>
                    {scan.success ? "CLEARED" : "REJECTED"}
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
