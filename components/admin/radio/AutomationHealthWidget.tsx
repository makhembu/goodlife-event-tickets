"use client";

import React, { useState, useEffect } from "react";
import { Server, Activity, AlertTriangle, CheckCircle, WifiOff } from "lucide-react";

interface HealthData {
  success: boolean;
  worker_health: "ONLINE" | "IDLE" | "PROCESSING" | "DEGRADED" | "OFFLINE";
  worker?: {
    id: string;
    hostname: string;
    heartbeat_age_sec: number;
    last_successful_drop: string | null;
  } | null;
  active_listeners: number;
  latest_drop?: {
    id: number;
    title: string;
    status: string;
    created_at: string;
  } | null;
  failed_jobs_24h: number;
}

export function AutomationHealthWidget() {
  const [data, setData] = useState<HealthData | null>(null);

  useEffect(() => {
    let isMounted = true;
    const pollHealth = async () => {
      try {
        const res = await fetch("/api/admin/radio/automation-health");
        if (res.ok) {
          const json: HealthData = await res.json();
          if (isMounted) setData(json);
        }
      } catch {}
    };

    pollHealth();
    const interval = setInterval(pollHealth, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const health = data?.worker_health || "OFFLINE";

  const statusConfig = {
    IDLE: {
      color: "text-emerald-400 bg-emerald-950/60 border-emerald-800",
      dot: "bg-emerald-400",
      label: "HOME SERVER STANDBY",
      icon: CheckCircle,
    },
    ONLINE: {
      color: "text-emerald-400 bg-emerald-950/60 border-emerald-800",
      dot: "bg-emerald-400",
      label: "DAEMON ONLINE",
      icon: CheckCircle,
    },
    PROCESSING: {
      color: "text-[#DFBB7D] bg-amber-950/60 border-[#DFBB7D]/60 animate-pulse",
      dot: "bg-[#DFBB7D]",
      label: "SYNTHESIZING DROP",
      icon: Activity,
    },
    DEGRADED: {
      color: "text-amber-400 bg-amber-950/60 border-amber-800",
      dot: "bg-amber-400",
      label: "DAEMON DEGRADED",
      icon: AlertTriangle,
    },
    OFFLINE: {
      color: "text-neutral-400 bg-neutral-900 border-neutral-800",
      dot: "bg-neutral-600",
      label: "DAEMON OFFLINE",
      icon: WifiOff,
    },
  }[health];

  const Icon = statusConfig.icon;

  return (
    <div className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs font-mono backdrop-blur-md transition-colors ${statusConfig.color}`}>
      <div className="flex items-center gap-2">
        <Server className="h-3.5 w-3.5 opacity-80" />
        <span className="font-bold tracking-wider">{statusConfig.label}</span>
      </div>

      <div className="flex items-center gap-3">
        {data?.worker?.heartbeat_age_sec !== undefined && (
          <span className="text-[10px] text-neutral-400">
            ping: {data.worker.heartbeat_age_sec}s ago
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${statusConfig.dot}`} />
          <Icon className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}
export default AutomationHealthWidget;
