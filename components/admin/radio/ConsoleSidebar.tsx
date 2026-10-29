"use client";

import React from "react";
import Link from "next/link";
import {
  Disc3,
  Sparkles,
  ListMusic,
  RadioTower,
  Activity,
  Sliders,
  ArrowLeft,
} from "lucide-react";

export type ConsoleTab = "studio" | "drops" | "library" | "live" | "telemetry" | "overrides";

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
  const navItems: { id: ConsoleTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: "studio",
      label: "Studio Cockpit",
      icon: <Disc3 className="w-5 h-5" />,
    },
    {
      id: "drops",
      label: "Drops Vault",
      icon: <Sparkles className="w-5 h-5" />,
    },
    {
      id: "library",
      label: "Music Library",
      icon: <ListMusic className="w-5 h-5" />,
    },
    {
      id: "live",
      label: "Live DJ Decks",
      icon: <RadioTower className="w-5 h-5" />,
    },
    {
      id: "telemetry",
      label: "Telemetry & Logs",
      icon: <Activity className="w-5 h-5" />,
    },
    {
      id: "overrides",
      label: "Configuration",
      icon: <Sliders className="w-5 h-5" />,
    },
  ];

  return (
    <aside className="fixed top-14 left-0 bottom-0 w-16 hover:w-56 bg-[#1A1D24] border-r-2 border-[#16181D] z-40 transition-all duration-200 group flex flex-col justify-between py-3 select-none overflow-hidden">
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
              {/* Active left indicator */}
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
  );
}
