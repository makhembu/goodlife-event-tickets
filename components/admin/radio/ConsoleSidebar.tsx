"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Disc3,
  Sparkles,
  ListMusic,
  RadioTower,
  Activity,
  Sliders,
  ArrowLeft,
  Layers,
  MoreHorizontal,
  X,
  ChevronRight,
  Calendar,
} from "lucide-react";

export type ConsoleTab = "studio" | "drops" | "library" | "playlists" | "live" | "schedule" | "telemetry" | "overrides";

export interface ConsoleSidebarProps {
  activeTab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
  bridgeOnline?: boolean | null;
}

export default function ConsoleSidebar({
  activeTab,
  onTabChange,
  bridgeOnline = null,
}: ConsoleSidebarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  // Full roster for desktop left rail
  const navItems: { id: ConsoleTab; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: "studio",
      label: "Studio Cockpit",
      icon: <Disc3 className="w-5 h-5" />,
      desc: "Cartwall, DIY voice mic & quick drops",
    },
    {
      id: "drops",
      label: "Drops Vault",
      icon: <Sparkles className="w-5 h-5" />,
      desc: "AI radio drops catalogue & prompt studio",
    },
    {
      id: "library",
      label: "Music Library",
      icon: <ListMusic className="w-5 h-5" />,
      desc: "Direct R2 uploads & station tracks",
    },
    {
      id: "playlists",
      label: "Playlists & Sets",
      icon: <Layers className="w-5 h-5" />,
      desc: "Curated broadcast rotation & Camelot key sequencing",
    },
    {
      id: "live",
      label: "Live DJ Decks",
      icon: <RadioTower className="w-5 h-5" />,
      desc: "Stream connection & DJ hardware credentials",
    },
    {
      id: "schedule",
      label: "Timetable & Roster",
      icon: <Calendar className="w-5 h-5" />,
      desc: "Weekly shows, presenter roster & slot editor",
    },
    {
      id: "telemetry",
      label: "Telemetry & Logs",
      icon: <Activity className="w-5 h-5" />,
      desc: "Real-time playhead timeline & listener logs",
    },
    {
      id: "overrides",
      label: "Configuration",
      icon: <Sliders className="w-5 h-5" />,
      desc: "Event airwave rules & lineup overrides",
    },
  ];

  // 4 Primary Mobile Tabs for thumb reachability
  const primaryMobileTabs: { id: ConsoleTab; shortLabel: string; icon: React.ReactNode }[] = [
    { id: "studio", shortLabel: "Studio", icon: <Disc3 className="w-5 h-5" /> },
    { id: "drops", shortLabel: "Drops", icon: <Sparkles className="w-5 h-5" /> },
    { id: "library", shortLabel: "Library", icon: <ListMusic className="w-5 h-5" /> },
    { id: "playlists", shortLabel: "Sets", icon: <Layers className="w-5 h-5" /> },
  ];

  // Secondary tabs accessed through "More" bottom sheet
  const secondaryTabs: { id: ConsoleTab; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: "live",
      label: "Live DJ Decks",
      icon: <RadioTower className="w-5 h-5 text-emerald-400" />,
      desc: "Live broadcast mounts, credentials & hardware stream links",
    },
    {
      id: "telemetry",
      label: "Telemetry & Logs",
      icon: <Activity className="w-5 h-5 text-sky-400" />,
      desc: "24/7 on-air playhead timeline, listener counts & drop history",
    },
    {
      id: "overrides",
      label: "Station Configuration",
      icon: <Sliders className="w-5 h-5 text-amber-400" />,
      desc: "Event airplay priority, gates countdowns & confirmed acts",
    },
  ];

  const isSecondaryActive = ["live", "telemetry", "overrides"].includes(activeTab);

  return (
    <>
      {/* 1. Mobile Bottom Docked Navigation Bar (< lg / tablets & phones) */}
      <nav
        aria-label="Mobile Cockpit Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 h-14 bg-[#16181D] border-t-2 border-[#16181D] z-40 flex items-center justify-around px-1 select-none shadow-[0_-4px_16px_rgba(0,0,0,0.6)]"
      >
        {primaryMobileTabs.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setMoreOpen(false);
                onTabChange(item.id);
              }}
              className={`flex flex-col items-center justify-center py-1 px-3 min-w-[56px] h-full relative transition-colors cursor-pointer ${
                isActive
                  ? "text-[#DFBB7D] font-bold"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {isActive && (
                <div className="absolute top-0 left-2 right-2 h-1 bg-[#F5C842] rounded-full shadow-[0_0_8px_#F5C842]" />
              )}
              <div className="shrink-0">{item.icon}</div>
              <span className="text-[10px] font-mono mt-0.5 tracking-tight uppercase truncate">
                {item.shortLabel}
              </span>
            </button>
          );
        })}

        {/* 5th Button: More Sheet Trigger */}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          aria-label="More Cockpit Views"
          className={`flex flex-col items-center justify-center py-1 px-3 min-w-[56px] h-full relative transition-colors cursor-pointer ${
            isSecondaryActive || moreOpen
              ? "text-[#DFBB7D] font-bold"
              : "text-white/60 hover:text-white"
          }`}
        >
          {isSecondaryActive && (
            <div className="absolute top-0 left-2 right-2 h-1 bg-[#F5C842] rounded-full shadow-[0_0_8px_#F5C842]" />
          )}
          <div className="shrink-0">
            <MoreHorizontal className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-mono mt-0.5 tracking-tight uppercase">
            {isSecondaryActive ? activeTab : "More"}
          </span>
        </button>
      </nav>

      {/* 2. Slide-up "More" Bottom Sheet for Mobile (< lg) */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setMoreOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/80 backdrop-blur-xs z-50 animate-in fade-in duration-150"
          />

          {/* Drawer Panel */}
          <div className="lg:hidden fixed bottom-14 left-0 right-0 z-50 bg-[#16181D] border-t-2 border-[#DFBB7D] rounded-t-2xl p-4 shadow-[0_-12px_32px_rgba(0,0,0,0.9)] animate-in slide-in-from-bottom-6 duration-200 space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#DFBB7D]">
                MORE COCKPIT CONTROLS
              </span>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1 text-white/60 hover:text-white rounded hover:bg-white/10"
                aria-label="Close controls drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Secondary Views List */}
            <div className="space-y-1.5">
              {secondaryTabs.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      setMoreOpen(false);
                    }}
                    className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-left transition-all ${
                      isActive
                        ? "bg-[#DFBB7D] text-[#16181D] border-[#F5C842] shadow-[2px_2px_0px_#16181D]"
                        : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`p-1.5 rounded-lg shrink-0 ${isActive ? "bg-[#16181D] text-[#DFBB7D]" : "bg-black/40"}`}>
                        {item.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-bold uppercase truncate">
                          {item.label}
                        </div>
                        <div className={`text-[10px] truncate ${isActive ? "text-[#16181D]/80" : "text-white/60"}`}>
                          {item.desc}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 shrink-0 ${isActive ? "text-[#16181D]" : "text-white/40"}`} />
                  </button>
                );
              })}
            </div>

            <div className="border-t border-white/10 pt-2">
              <Link
                href="/admin"
                onClick={() => setMoreOpen(false)}
                className="w-full p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 flex items-center justify-between font-mono text-xs uppercase font-bold transition-colors"
              >
                <div className="flex items-center space-x-2.5">
                  <ArrowLeft className="w-4 h-4" />
                  <span>Exit to Admin Dashboard</span>
                </div>
                <span className="text-[10px] text-red-400/80">/admin</span>
              </Link>
            </div>
          </div>
        </>
      )}

      {/* 3. Desktop Left Rail Navigation (>= lg screens) */}
      <aside className="hidden lg:flex fixed top-14 left-0 bottom-0 w-16 hover:w-56 bg-[#1A1D24] border-r-2 border-[#16181D] z-40 transition-all duration-200 group flex-col justify-between py-3 select-none overflow-hidden">
        {/* Top Nav Items */}
        <div className="flex flex-col space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                title={item.label}
                className={`flex items-center h-11 px-4 transition-colors relative text-left ${
                  isActive
                    ? "bg-[#DFBB7D] text-[#16181D] font-bold"
                    : "text-[#FBF9F6]/70 hover:text-white hover:bg-white/5"
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#F5C842]" />
                )}
                <div className="shrink-0 flex items-center justify-center">
                  {item.icon}
                </div>
                <span className="ml-4 font-mono text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 uppercase tracking-wider">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bottom Back to Admin Link */}
        <div className="flex flex-col space-y-2 px-2 border-t border-white/10 pt-3">
          <Link
            href="/admin"
            className="flex items-center h-10 px-2 text-white/50 hover:text-white hover:bg-white/5 transition-colors font-mono text-xs rounded"
            title="Back to Admin Dashboard"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="ml-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 uppercase tracking-wider truncate">
              Admin Exit
            </span>
          </Link>
        </div>
      </aside>
    </>
  );
}
