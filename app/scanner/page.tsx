"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  QrCode, 
  Search, 
  Users, 
  Camera, 
  Flashlight, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  LogOut, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  Tent, 
  Clock, 
  Hash, 
  ChevronRight,
  ShieldCheck,
  Zap,
  ArrowRight,
  Layers,
  ChevronDown
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TicketStamp from "@/components/TicketStamp";
import { fmtDate } from "@/lib/utils";

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

interface ScannerSession {
  role: string;
  stewardName: string;
  gateName: string;
  eventId: number | null;
  eventTitle: string;
}

export default function GateTerminalPage() {
  const router = useRouter();
  const [session, setSession] = useState<ScannerSession | null>(null);
  const [activeTab, setActiveTab] = useState<"camera" | "search" | "log">("camera");

  // Camera states
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Scan HUD state
  const [lastResult, setLastResult] = useState<ScannedResult | null>(null);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [autoDismissCountdown, setAutoDismissCountdown] = useState<number | null>(null);

  // Stats & Log
  const [stats, setStats] = useState<any>({
    total_tickets: 0,
    total_scanned: 0,
    total_expected_guests: 0,
    total_admitted_guests: 0,
    total_camping: 0
  });
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [sessionScanCount, setSessionScanCount] = useState(0);

  // Manual search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Station & Event Switcher Modal State
  const [showStationModal, setShowStationModal] = useState(false);
  const [eventsList, setEventsList] = useState<any[]>([]);
  const [switchEventId, setSwitchEventId] = useState<number | null>(null);
  const [switchGateName, setSwitchGateName] = useState("");
  const [switchStewardName, setSwitchStewardName] = useState("");
  const [updatingStation, setUpdatingStation] = useState(false);

  // Load events list for switcher (exclude closed & archived events)
  useEffect(() => {
    fetch("/api/events")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const openEvents = data.filter(
            (e) => (e.status || "").toLowerCase() !== "closed" && (e.status || "").toLowerCase() !== "archived" && !e.archived_at
          );
          setEventsList(openEvents);
        }
      })
      .catch(console.error);
  }, []);

  const scannerRef = useRef<any>(null);
  const verifyRef = useRef<((id: string, count?: number) => Promise<void>) | null>(null);
  const autoDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load session
  useEffect(() => {
    fetch("/api/scanner/session")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => {
        if (data.authenticated && data.session) {
          setSession(data.session);
          setSwitchEventId(data.session.eventId);
          setSwitchGateName(data.session.gateName);
          setSwitchStewardName(data.session.stewardName);
        } else {
          router.push("/scanner/login");
        }
      })
      .catch(() => {
        router.push("/scanner/login");
      });
  }, [router]);

  const handleSwitchStation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setUpdatingStation(true);
    try {
      const res = await fetch("/api/scanner/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: switchEventId,
          gateName: switchGateName,
          stewardName: switchStewardName
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.session) {
        setSession(data.session);
        setShowStationModal(false);
      }
    } catch (err) {
      console.error("Failed to switch station:", err);
    } finally {
      setUpdatingStation(false);
    }
  };

  // Load stats and recent scans
  const loadStats = useCallback(() => {
    if (!session?.eventId) return;
    fetch(`/api/scanner/stats?eventId=${session.eventId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStats(data.stats || {});
          setRecentScans(data.recent_scans || []);
        }
      })
      .catch(console.error);
  }, [session?.eventId]);

  useEffect(() => {
    if (session?.eventId) {
      loadStats();
    }
  }, [session?.eventId, loadStats]);

  // Search tickets
  useEffect(() => {
    if (!searchQuery.trim() || !session?.eventId) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/scanner/stats?eventId=${session.eventId}&q=${encodeURIComponent(searchQuery.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setSearchResults(data.tickets || []);
        })
        .catch(console.error)
        .finally(() => setSearching(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, session?.eventId]);

  // Audio & Haptic Feedback
  const triggerFeedback = useCallback((success: boolean, alreadyScanned = false) => {
    try {
      if (success) {
        navigator.vibrate?.(50);
      } else if (alreadyScanned) {
        navigator.vibrate?.([80, 50, 80]);
      } else {
        navigator.vibrate?.([150, 60, 150]);
      }
    } catch {}

    if (!soundEnabled) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (success) {
        osc.frequency.setValueAtTime(650, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.14);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      } else if (alreadyScanned) {
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.setValueAtTime(300, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {}
  }, [soundEnabled]);

  // Verify Ticket Core Engine
  const verifyTicket = async (ticketId: string, admitCount: number = 1) => {
    const cleanId = ticketId.trim().toUpperCase();
    if (!cleanId || loadingVerify) return;

    // Clear auto-dismiss timer
    if (autoDismissTimerRef.current) {
      clearInterval(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }

    setLoadingVerify(true);
    const scannerOperator = session 
      ? `${session.stewardName} @ ${session.gateName}`
      : "Gate Steward";

    try {
      const res = await fetch(`/api/admin/scan/${encodeURIComponent(cleanId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanned_by: scannerOperator,
          event_id: session?.eventId,
          admit_count: admitCount
        })
      });

      const data: ScannedResult = await res.json();
      setLastResult(data);
      triggerFeedback(data.success, data.alreadyScanned);

      if (data.success) {
        setSessionScanCount((prev) => prev + admitCount);
        loadStats();

        // Start auto-dismiss countdown (3 seconds) to keep queue moving
        let secondsLeft = 3;
        setAutoDismissCountdown(secondsLeft);
        autoDismissTimerRef.current = setInterval(() => {
          secondsLeft -= 1;
          if (secondsLeft <= 0) {
            clearInterval(autoDismissTimerRef.current!);
            autoDismissTimerRef.current = null;
            setAutoDismissCountdown(null);
            setLastResult(null);
          } else {
            setAutoDismissCountdown(secondsLeft);
          }
        }, 1000);
      } else {
        setAutoDismissCountdown(null);
      }
    } catch (err: any) {
      setLastResult({
        success: false,
        message: "Network/Server Connection Error: " + err.message
      });
      triggerFeedback(false);
    } finally {
      setLoadingVerify(false);
    }
  };

  useEffect(() => {
    verifyRef.current = verifyTicket;
  });

  // Start Camera
  const startCamera = async () => {
    setCameraError("");
    setScannerActive(true);
  };

  // Stop Camera
  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    setScannerActive(false);
    setTorchOn(false);
  };

  // Toggle Torch
  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      const track = (scannerRef.current as any)?._localMediaStream?.getVideoTracks()?.[0];
      if (track && track.applyConstraints) {
        const next = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: next }] });
        setTorchOn(next);
      }
    } catch (e) {
      console.warn("Torch constraint failed:", e);
    }
  };

  // Mount Html5Qrcode when camera is active
  useEffect(() => {
    if (!scannerActive || activeTab !== "camera") return;

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
            // If already showing a pending result, avoid multi-firing
            if (loadingVerify) return;

            let ticketId = decodedText.trim();
            if (decodedText.includes("/admin/scan/")) {
              const parts = decodedText.split("/admin/scan/");
              ticketId = parts[parts.length - 1];
            } else if (decodedText.includes("/admin/scanner?ticket=")) {
              try {
                const u = new URL(decodedText);
                ticketId = u.searchParams.get("ticket") || decodedText;
              } catch {}
            }

            if (verifyRef.current) {
              await verifyRef.current(ticketId);
            }
          },
          () => {}
        );

        // Check torch capabilities
        const track = (scanner as any)?._localMediaStream?.getVideoTracks()?.[0];
        const capabilities = track?.getCapabilities?.();
        if (capabilities && "torch" in capabilities) {
          setHasTorch(true);
        }
      } catch (err: any) {
        console.error("Camera scanner error:", err);
        setCameraError(err.message || "Camera access denied. Please grant permission in browser.");
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
  }, [scannerActive, activeTab]);

  const handleLogout = async () => {
    await stopCamera();
    await fetch("/api/scanner/logout", { method: "POST" });
    router.push("/scanner/login");
  };

  const dismissHUD = () => {
    if (autoDismissTimerRef.current) {
      clearInterval(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    setAutoDismissCountdown(null);
    setLastResult(null);
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center text-brand-accent font-display text-2xl uppercase tracking-widest animate-pulse">
        Initializing Gate Terminal...
      </div>
    );
  }

  const admitPercent = stats.total_expected_guests > 0
    ? Math.round((stats.total_admitted_guests / stats.total_expected_guests) * 100)
    : 0;

  return (
    <div className="h-[100dvh] w-full bg-brand-navy text-brand-off-white font-mono flex flex-col justify-between overflow-hidden select-none">
      
      {/* 1. TOP STATUS BAR (COMPACT & HIGH CONTRAST) */}
      <header className="h-14 bg-brand-navy border-b-3 border-brand-accent px-3 flex items-center justify-between shrink-0 z-20">
        <button
          type="button"
          onClick={() => {
            setSwitchEventId(session.eventId);
            setSwitchGateName(session.gateName);
            setSwitchStewardName(session.stewardName);
            setShowStationModal(true);
          }}
          className="flex items-center gap-2 min-w-0 text-left hover:opacity-90 active:scale-[0.98] transition-all p-1 -m-1 border border-transparent hover:border-brand-accent/50 cursor-pointer"
          title="Tap to switch Event (Goodlife / Park & Chill) or Change Gate"
        >
          <div className="w-8 h-8 bg-brand-accent text-brand-navy border-2 border-brand-navy flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display text-base uppercase tracking-wider truncate">
                {session.gateName}
              </span>
              <span className="text-[9px] font-mono font-black uppercase px-1 py-0.2 bg-brand-accent text-brand-navy border border-brand-navy flex items-center gap-0.5">
                SWITCH <ChevronDown className="w-2.5 h-2.5" />
              </span>
            </div>
            <p className="text-[10px] text-brand-off-white/70 font-bold uppercase truncate">
              {session.stewardName} • #{session.eventId} {session.eventTitle}
            </p>
          </div>
        </button>

        {/* Live Counters & Quick Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Station tally chip */}
          <div className="hidden sm:flex flex-col items-end px-2 py-0.5 bg-brand-accent/20 border border-brand-accent text-right">
            <span className="text-[9px] font-black uppercase text-brand-accent">MY SHIFT</span>
            <span className="text-xs font-black font-mono">{sessionScanCount} IN</span>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 border-2 border-brand-accent/40 bg-brand-navy hover:bg-brand-accent/20 text-brand-accent transition-colors"
            title={soundEnabled ? "Mute audio" : "Enable audio"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-red-400" />}
          </button>

          {/* Torch Toggle if available */}
          {hasTorch && scannerActive && (
            <button
              onClick={toggleTorch}
              className={`p-2 border-2 transition-colors ${
                torchOn 
                  ? "bg-brand-accent text-brand-navy border-brand-navy" 
                  : "bg-brand-navy text-brand-accent border-brand-accent/40"
              }`}
              title="Toggle Flashlight"
            >
              <Flashlight className="w-4 h-4" />
            </button>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="p-2 border-2 border-red-500 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
            title="Log out from terminal"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. SUB-BAR: LIVE CAPACITY + TAB SWITCHER */}
      <div className="bg-brand-navy/90 border-b-2 border-brand-navy-light/30 px-3 py-1.5 flex items-center justify-between shrink-0 gap-2">
        {/* Admitted counter bar */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] font-black uppercase text-brand-accent whitespace-nowrap">
            GATE TALLY:
          </span>
          <div className="flex-1 max-w-[140px] h-2.5 bg-brand-navy-light/40 border border-brand-accent/50 overflow-hidden">
            <div 
              className="h-full bg-brand-accent transition-all duration-500" 
              style={{ width: `${Math.min(100, admitPercent)}%` }} 
            />
          </div>
          <span className="text-[10px] font-bold font-mono text-brand-off-white whitespace-nowrap">
            {stats.total_admitted_guests} / {stats.total_expected_guests} ({admitPercent}%)
          </span>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-2 border-brand-accent shrink-0">
          <button
            onClick={() => setActiveTab("camera")}
            className={`px-2.5 py-1 text-[11px] font-black uppercase transition-colors flex items-center gap-1 ${
              activeTab === "camera"
                ? "bg-brand-accent text-brand-navy"
                : "bg-brand-navy text-brand-off-white hover:bg-brand-accent/20"
            }`}
          >
            <Camera className="w-3 h-3" />
            <span>Scan</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("search");
              stopCamera();
            }}
            className={`px-2.5 py-1 text-[11px] font-black uppercase transition-colors flex items-center gap-1 border-l-2 border-brand-accent ${
              activeTab === "search"
                ? "bg-brand-accent text-brand-navy"
                : "bg-brand-navy text-brand-off-white hover:bg-brand-accent/20"
            }`}
          >
            <Search className="w-3 h-3" />
            <span>Search</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("log");
              stopCamera();
              loadStats();
            }}
            className={`px-2.5 py-1 text-[11px] font-black uppercase transition-colors flex items-center gap-1 border-l-2 border-brand-accent ${
              activeTab === "log"
                ? "bg-brand-accent text-brand-navy"
                : "bg-brand-navy text-brand-off-white hover:bg-brand-accent/20"
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Log ({recentScans.length})</span>
          </button>
        </div>
      </div>

      {/* 3. MAIN TERMINAL WORKSPACE (100% NO VERTICAL SCROLL ON CAMERA) */}
      <main className="flex-1 relative overflow-hidden flex flex-col items-center justify-center p-2 sm:p-4">
        
        {/* TAB A: CAMERA SCANNER */}
        {activeTab === "camera" && (
          <div className="w-full h-full max-w-md flex flex-col justify-between items-center relative">
            
            {/* Camera Viewport Container */}
            <div className="w-full flex-1 max-h-[70vh] aspect-square relative bg-black border-4 border-brand-accent shadow-(--shadow-brut-lg) overflow-hidden flex items-center justify-center">
              
              {scannerActive ? (
                <div className="w-full h-full relative">
                  <div id="gate-scanner-viewport" className="w-full h-full object-cover" />
                  
                  {/* Aiming Reticle Overlays */}
                  <div className="absolute inset-8 border-2 border-dashed border-brand-accent/50 pointer-events-none rounded-lg" />
                  <div className="absolute top-6 left-6 w-8 h-8 border-t-4 border-l-4 border-brand-accent pointer-events-none" />
                  <div className="absolute top-6 right-6 w-8 h-8 border-t-4 border-r-4 border-brand-accent pointer-events-none" />
                  <div className="absolute bottom-6 left-6 w-8 h-8 border-b-4 border-l-4 border-brand-accent pointer-events-none" />
                  <div className="absolute bottom-6 right-6 w-8 h-8 border-b-4 border-r-4 border-brand-accent pointer-events-none" />

                  {/* Active radar scan line animation */}
                  <div className="absolute inset-x-8 top-12 h-1 bg-brand-accent/80 shadow-[0_0_12px_#F5DF4D] animate-bounce pointer-events-none" />
                </div>
              ) : (
                <div className="p-6 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-brand-navy-light/40 border-2 border-brand-accent flex items-center justify-center mx-auto text-brand-accent animate-pulse">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl uppercase tracking-wider text-brand-accent">
                      Gate Camera Ready
                    </h2>
                    <p className="text-xs text-brand-off-white/70 max-w-[240px] mx-auto uppercase mt-1">
                      Tap below to activate lens and verify incoming attendee passes
                    </p>
                  </div>

                  {cameraError && (
                    <div className="p-2 bg-red-950 border border-red-500 text-red-300 text-[11px] font-bold">
                      {cameraError}
                    </div>
                  )}

                  <button
                    onClick={startCamera}
                    className="w-full py-3.5 bg-brand-accent text-brand-navy border-3 border-brand-navy font-display text-lg uppercase tracking-wider hover:bg-white transition-colors shadow-(--shadow-brut-sm) cursor-pointer"
                  >
                    START CAMERA SCANNER
                  </button>
                </div>
              )}

              {/* Quick Stop Button on camera view */}
              {scannerActive && (
                <button
                  onClick={stopCamera}
                  className="absolute top-3 right-3 z-30 bg-red-600/90 hover:bg-red-600 text-white text-[10px] font-black uppercase px-2.5 py-1 border border-white flex items-center gap-1 shadow-md"
                >
                  <X className="w-3 h-3" /> PAUSE
                </button>
              )}
            </div>

            {/* Quick 1-Tap Manual ID Input Bar */}
            <div className="w-full mt-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = (e.currentTarget.elements.namedItem("quickId") as HTMLInputElement)?.value;
                  if (target) {
                    verifyTicket(target);
                    (e.currentTarget.elements.namedItem("quickId") as HTMLInputElement).value = "";
                  }
                }}
                className="flex gap-2"
              >
                <input
                  name="quickId"
                  type="text"
                  placeholder="Enter Ticket GL-XXXX..."
                  className="flex-1 px-3 py-2 bg-brand-off-white text-brand-navy border-3 border-brand-accent font-mono text-xs font-black uppercase focus:outline-none placeholder:text-brand-navy/50"
                />
                <button
                  type="submit"
                  disabled={loadingVerify}
                  className="px-4 py-2 bg-brand-accent text-brand-navy border-3 border-brand-navy font-black text-xs uppercase hover:bg-white transition-colors cursor-pointer"
                >
                  {loadingVerify ? "..." : "CHECK"}
                </button>
              </form>
            </div>

          </div>
        )}

        {/* TAB B: RAPID SEARCH & LOOKUP */}
        {activeTab === "search" && (
          <div className="w-full h-full max-w-lg flex flex-col justify-start space-y-3 p-1">
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                placeholder="Search attendee name, phone, ticket ID, or receipt..."
                className="w-full pl-9 pr-8 py-3 bg-brand-off-white text-brand-navy border-3 border-brand-accent font-mono text-xs font-bold uppercase focus:outline-none placeholder:normal-case"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-navy hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {searching ? (
                <div className="p-8 text-center text-xs font-bold uppercase animate-pulse">Searching ticket database...</div>
              ) : !searchQuery.trim() ? (
                <div className="p-8 text-center text-xs text-brand-off-white/60 uppercase">
                  Type an attendee name, phone number (e.g. 0712...), or ticket ID to pull up ticket immediately.
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-8 text-center text-xs text-brand-off-white/70 uppercase">
                  No tickets found matching &quot;{searchQuery}&quot; for Event #{session.eventId}.
                </div>
              ) : (
                searchResults.map((t) => {
                  const isScanned = t.is_scanned || (t.admitted_count && t.admitted_count >= (t.guest_count || 1));
                  const isPartial = !isScanned && (t.admitted_count || 0) > 0;

                  return (
                    <div
                      key={t.id}
                      className={`p-3 border-3 font-mono flex items-center justify-between gap-3 ${
                        isScanned
                          ? "bg-red-950/40 border-red-500/70 text-red-200"
                          : isPartial
                          ? "bg-amber-950/40 border-amber-400 text-amber-200"
                          : "bg-brand-off-white text-brand-navy border-brand-accent shadow-(--shadow-brut-xs)"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-sm uppercase truncate">
                            {t.buyer_name || "Unknown"}
                          </span>
                          <span className={`text-[9px] font-black px-1.5 py-0.2 border uppercase ${
                            isScanned
                              ? "bg-red-600 text-white border-red-700"
                              : isPartial
                              ? "bg-amber-400 text-brand-navy border-amber-600"
                              : "bg-brand-navy text-white border-brand-navy"
                          }`}>
                            {t.ticket_type}
                          </span>
                        </div>

                        <div className="text-[10px] opacity-70 mt-0.5">
                          ID: <strong className="font-mono">{t.id}</strong> • Tel: {t.phone_number || "—"} • Ref: {t.mpesa_receipt}
                        </div>

                        {t.is_camping && (
                          <div className="text-[10px] text-brand-accent font-black uppercase mt-0.5 flex items-center gap-1">
                            <Tent className="w-3 h-3" /> CAMPING BUNDLE PASS
                          </div>
                        )}

                        {t.guest_count > 1 && (
                          <div className="text-[10px] font-bold text-brand-accent mt-0.5">
                            Admitted: {t.admitted_count || 0} / {t.guest_count} guests
                          </div>
                        )}
                      </div>

                      <div className="shrink-0">
                        {isScanned ? (
                          <span className="text-[10px] font-black uppercase text-red-400 border border-red-500 px-2 py-1">
                            FULL
                          </span>
                        ) : (
                          <button
                            onClick={() => verifyTicket(t.id, 1)}
                            disabled={loadingVerify}
                            className="px-3 py-2 bg-brand-accent text-brand-navy border-2 border-brand-navy font-black text-xs uppercase hover:bg-white transition-colors cursor-pointer"
                          >
                            ADMIT
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB C: GATE LOG & STATION STATS */}
        {activeTab === "log" && (
          <div className="w-full h-full max-w-lg flex flex-col justify-start space-y-4 overflow-y-auto p-1">
            
            {/* Metric KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-brand-off-white text-brand-navy p-2.5 border-3 border-brand-accent">
                <span className="text-[9px] font-black uppercase block text-brand-navy/60">MY GATE SHIFT</span>
                <span className="text-xl font-black font-mono text-brand-navy">{sessionScanCount}</span>
                <span className="text-[9px] block text-brand-navy/60">Scanned by you</span>
              </div>

              <div className="bg-brand-off-white text-brand-navy p-2.5 border-3 border-brand-accent">
                <span className="text-[9px] font-black uppercase block text-brand-navy/60">EVENT ADMITTED</span>
                <span className="text-xl font-black font-mono text-green-700">{stats.total_admitted_guests}</span>
                <span className="text-[9px] block text-brand-navy/60">of {stats.total_expected_guests} total</span>
              </div>

              <div className="bg-brand-off-white text-brand-navy p-2.5 border-3 border-brand-accent">
                <span className="text-[9px] font-black uppercase block text-brand-navy/60">REMAINING OUT</span>
                <span className="text-xl font-black font-mono text-blue-700">
                  {Math.max(0, stats.total_expected_guests - stats.total_admitted_guests)}
                </span>
                <span className="text-[9px] block text-brand-navy/60">Attendees to arrive</span>
              </div>

              <div className="bg-brand-off-white text-brand-navy p-2.5 border-3 border-brand-accent">
                <span className="text-[9px] font-black uppercase block text-brand-navy/60">CAMPING PASSES</span>
                <span className="text-xl font-black font-mono text-purple-700">{stats.total_camping}</span>
                <span className="text-[9px] block text-brand-navy/60">Tents & Dorm beds</span>
              </div>
            </div>

            {/* Recent Scan Stream */}
            <div className="space-y-2">
              <div className="flex justify-between items-center border-b-2 border-brand-accent/40 pb-1">
                <span className="text-xs font-black uppercase text-brand-accent flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> RECENT GATE ADMISSIONS
                </span>
                <button
                  onClick={loadStats}
                  className="text-[10px] font-bold text-brand-off-white/70 hover:text-white uppercase flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {recentScans.length === 0 ? (
                <div className="p-8 text-center text-xs text-brand-off-white/50 uppercase">
                  No scan records yet for this event.
                </div>
              ) : (
                recentScans.map((s, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-brand-off-white/10 border-l-4 border-l-brand-accent border border-brand-accent/30 text-xs flex justify-between items-center"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="font-mono text-brand-accent">{s.id}</strong>
                        <span className="uppercase font-bold">{s.buyer_name}</span>
                      </div>
                      <div className="text-[10px] text-brand-off-white/70 mt-0.5">
                        Tier: {s.ticket_type} • By: {s.scanned_by || "Gate"}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-brand-off-white/60 block">
                        {s.scanned_at ? new Date(s.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        )}

      </main>

      {/* 4. INSTANT FULLSCREEN RESULT HUD OVERLAY */}
      <AnimatePresence>
        {lastResult && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`fixed inset-x-2 sm:inset-x-auto sm:w-[460px] sm:left-1/2 sm:-translate-x-1/2 bottom-3 z-50 p-4 border-4 shadow-(--shadow-brut-lg) font-mono ${
              lastResult.success
                ? "bg-green-50 text-green-950 border-green-600"
                : lastResult.alreadyScanned
                ? "bg-amber-50 text-amber-950 border-amber-600"
                : "bg-red-50 text-red-950 border-red-600"
            }`}
          >
            {/* Auto dismiss countdown progress bar */}
            {autoDismissCountdown !== null && (
              <div className="absolute top-0 inset-x-0 h-1.5 bg-green-200 overflow-hidden">
                <div
                  className="h-full bg-green-600 transition-all duration-1000 ease-linear"
                  style={{ width: `${(autoDismissCountdown / 3) * 100}%` }}
                />
              </div>
            )}

            {/* Header Stamp & Dismiss button */}
            <div className="flex justify-between items-start mb-2 pt-1">
              <TicketStamp
                text={
                  lastResult.success
                    ? "ENTRY CLEARED"
                    : lastResult.alreadyScanned
                    ? "ALREADY USED"
                    : "ENTRY REJECTED"
                }
                variant={
                  lastResult.success ? "success" : lastResult.alreadyScanned ? "used" : "fail"
                }
              />
              <button
                onClick={dismissHUD}
                className="p-1 hover:bg-black/10 rounded-full cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Big readable attendee name & Tier */}
            <div className="space-y-1 mb-3">
              <h2 className="font-sans font-black text-2xl uppercase tracking-tight leading-tight">
                {lastResult.ticket?.buyer_name || (lastResult.success ? "ATTENDEE" : "UNKNOWN PASS")}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-black uppercase px-2 py-0.5 bg-brand-navy text-white">
                  {lastResult.ticket?.ticket_type || "TICKET"}
                </span>
                {lastResult.ticket?.id && (
                  <span className="font-mono text-xs font-bold text-gray-700">
                    ID: {lastResult.ticket.id}
                  </span>
                )}
              </div>
            </div>

            {/* Primary Result Message */}
            <p className="text-xs font-black uppercase mb-3 leading-snug">
              {lastResult.message}
            </p>

            {/* CAMPING BUNDLE WRISTBAND INSTRUCTION */}
            {lastResult.camping_instruction && (
              <div className="p-3 mb-3 bg-brand-navy text-brand-off-white border-2 border-brand-accent shadow-(--shadow-brut-xs) space-y-1">
                <div className="flex items-center gap-1.5 text-brand-accent font-display text-xs uppercase tracking-wider">
                  <Tent className="w-4 h-4 text-brand-accent" />
                  GATE ACTION REQUIRED:
                </div>
                <p className="font-mono text-xs font-black uppercase text-brand-off-white">
                  {lastResult.camping_instruction}
                </p>
              </div>
            )}

            {/* GROUP TICKET CHECK-IN ACTIONS */}
            {lastResult.guest_count && lastResult.guest_count > 1 && (
              <div className="p-3 mb-3 bg-white border-2 border-brand-navy text-brand-navy space-y-2">
                <div className="flex justify-between items-center text-xs font-bold uppercase">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> GROUP PASS:
                  </span>
                  <span>{lastResult.admitted_count || 1} of {lastResult.guest_count} ADMITTED</span>
                </div>

                <div className="w-full h-3 bg-gray-200 border border-brand-navy overflow-hidden">
                  <div
                    className="h-full bg-brand-accent transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (((lastResult.admitted_count || 1) / lastResult.guest_count)) * 100)}%`
                    }}
                  />
                </div>

                {/* Incremental Check-In Buttons */}
                {(lastResult.admitted_count || 0) < lastResult.guest_count && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={loadingVerify}
                      onClick={() => verifyTicket(lastResult.ticket!.id, 1)}
                      className="flex-1 py-2 bg-brand-navy text-white font-mono text-xs font-black uppercase hover:bg-brand-accent hover:text-brand-navy border border-brand-navy transition-colors cursor-pointer"
                    >
                      +1 GUEST NOW
                    </button>
                    <button
                      type="button"
                      disabled={loadingVerify}
                      onClick={() =>
                        verifyTicket(
                          lastResult.ticket!.id,
                          lastResult.guest_count! - (lastResult.admitted_count || 0)
                        )
                      }
                      className="flex-1 py-2 bg-brand-accent text-brand-navy font-mono text-xs font-black uppercase hover:bg-brand-navy hover:text-white border border-brand-navy transition-colors cursor-pointer"
                    >
                      ADMIT ALL REMAINING ({lastResult.guest_count! - (lastResult.admitted_count || 0)})
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* BOTTOM DISMISS / NEXT SCAN BUTTON */}
            <div className="pt-1">
              <button
                onClick={dismissHUD}
                className="w-full py-2.5 bg-brand-navy text-brand-off-white font-mono text-xs font-black uppercase flex items-center justify-center gap-2 hover:bg-brand-accent hover:text-brand-navy border-2 border-brand-navy transition-colors cursor-pointer"
              >
                <span>NEXT TICKET</span>
                {autoDismissCountdown !== null && (
                  <span className="opacity-70">({autoDismissCountdown}s)</span>
                )}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. STATION & EVENT SWITCHER MODAL */}
      {showStationModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 font-mono animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-brand-off-white text-brand-navy border-4 border-brand-accent p-5 shadow-(--shadow-brut-lg) space-y-4">
            
            <div className="flex justify-between items-center border-b-2 border-brand-navy pb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-brand-navy" />
                <h3 className="font-display text-lg uppercase tracking-wider">CHANGE GATE & EVENT</h3>
              </div>
              <button
                onClick={() => setShowStationModal(false)}
                className="p-1 border border-brand-navy hover:bg-red-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSwitchStation} className="space-y-4">
              
              {/* Event selection (Goodlife / Park & Chill) */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-brand-navy block">
                  1. Active Event / Edition:
                </label>
                <div className="space-y-1">
                  {eventsList.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSwitchEventId(e.id)}
                      className={`w-full p-2 text-left border-2 text-xs font-bold uppercase transition-all flex items-center justify-between ${
                        switchEventId === e.id
                          ? "bg-brand-navy text-brand-accent border-brand-navy shadow-(--shadow-brut-xs)"
                          : "bg-white text-brand-navy border-brand-navy hover:bg-brand-accent/20"
                      }`}
                    >
                      <span className="truncate">#{e.id} {e.title}</span>
                      <span className={`text-[9px] px-1 py-0.2 border uppercase ${
                        switchEventId === e.id ? "bg-brand-accent text-brand-navy border-brand-accent" : "bg-gray-100 border-gray-300"
                      }`}>
                        {e.status || "ACTIVE"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Gate presets & custom name */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-brand-navy block">
                  2. Gate Station / Lane:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {["Main Gate", "VIP Gate", "Camping Gate", "Gate 2"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSwitchGateName(preset)}
                      className={`text-[10px] font-black uppercase px-2.5 py-1 border-2 transition-colors ${
                        switchGateName === preset
                          ? "bg-brand-navy text-white border-brand-navy"
                          : "bg-white text-brand-navy border-brand-navy hover:bg-brand-accent/30"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={switchGateName}
                  onChange={(e) => setSwitchGateName(e.target.value)}
                  placeholder="Or custom: e.g. Gate 1 - Lane B"
                  className="w-full py-2 px-3 bg-white border-2 border-brand-navy text-xs font-bold uppercase focus:outline-none mt-1"
                />
              </div>

              {/* Steward Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-brand-navy block">
                  3. Steward / Operator Name:
                </label>
                <input
                  type="text"
                  value={switchStewardName}
                  onChange={(e) => setSwitchStewardName(e.target.value)}
                  placeholder="Your Name (e.g. Alex)"
                  className="w-full py-2 px-3 bg-white border-2 border-brand-navy text-xs font-bold uppercase focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowStationModal(false)}
                  className="flex-1 py-2.5 bg-white border-2 border-brand-navy font-black text-xs uppercase hover:bg-gray-100 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={updatingStation}
                  className="flex-1 py-2.5 bg-brand-navy text-brand-accent hover:bg-brand-accent hover:text-brand-navy border-2 border-brand-navy font-black text-xs uppercase transition-colors shadow-(--shadow-brut-xs)"
                >
                  {updatingStation ? "SWITCHING..." : "APPLY & SWITCH"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
