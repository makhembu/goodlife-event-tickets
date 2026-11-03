"use client";

import React from "react";
import TransportBar from "./TransportBar";
import ConsoleSidebar, { ConsoleTab } from "./ConsoleSidebar";

export interface RadioConsoleLayoutProps {
  children: React.ReactNode;
  activeTab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
  streamUrl?: string;
  isDucking?: boolean;
  bridgeOnline?: boolean | null;
  onSkip?: () => Promise<void>;
  onMasterFade?: (gain: number) => void;
}

export default function RadioConsoleLayout({
  children,
  activeTab,
  onTabChange,
  streamUrl = "",
  isDucking = false,
  bridgeOnline = null,
  onSkip,
  onMasterFade,
}: RadioConsoleLayoutProps) {
  return (
    <div className="min-h-screen bg-[#F3ECE1] text-[#16181D] font-sans antialiased flex flex-col">
      {/* 1. Persistent Top Transport Bar */}
      <TransportBar
        streamUrl={streamUrl}
        isDucking={isDucking}
        bridgeOnline={bridgeOnline}
        onSkip={onSkip}
        onMasterFade={onMasterFade}
      />

      {/* 2. Left Icon Sidebar Navigation */}
      <ConsoleSidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        bridgeOnline={bridgeOnline}
      />

      {/* 3. Main Operational Content Workspace */}
      <main className="ml-0 lg:ml-16 mt-14 mb-0 pb-36 lg:pb-6 p-3 sm:p-4 lg:p-6 flex-1 max-w-[1920px] w-full lg:w-[calc(100%-4rem)] transition-all overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
