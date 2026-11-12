"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, Check, Sparkles, X, Eye, RefreshCw, AlertCircle } from "lucide-react";

interface ModerationItem {
  id: number;
  slot_id?: number | null;
  sender_name: string;
  sender_phone_masked: string;
  message: string;
  request_track?: string | null;
  source: "web" | "whatsapp";
  status: "pending" | "approved" | "read" | "rejected";
  is_featured: boolean;
  created_at: string;
  show_title?: string | null;
}

export default function PresenterShoutoutQueue() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch("/api/presenter/shoutouts");
      if (!res.ok) return;
      const data = await res.json();
      if (data.items) {
        setItems(data.items);
      }
    } catch {
      // Quiet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000); // 5s live polling
    return () => clearInterval(interval);
  }, []);

  const handleModerate = async (id: number, status: string, is_featured?: boolean) => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/presenter/shoutouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, is_featured }),
      });
      if (res.ok) {
        await fetchQueue();
      }
    } catch {
      // Quiet
    } finally {
      setActionLoading(null);
    }
  };

  const filteredItems = items.filter((item) => {
    if (filter === "pending") return item.status === "pending";
    if (filter === "approved") return item.status === "approved" || item.status === "read";
    return true;
  });

  return (
    <div className="border-3 border-brand-navy bg-white p-5 shadow-[4px_4px_0px_#142B4C] space-y-4 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-brand-navy pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-brand-accent" />
          <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy">
            Live Listener Shoutout Queue
          </h2>
          <span className="px-2 py-0.5 bg-neutral-200 text-brand-navy font-bold text-xs rounded">
            {items.filter((i) => i.status === "pending").length} Pending
          </span>
        </div>

        {/* Filter Buttons */}
        <div className="flex border border-brand-navy rounded overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`px-3 py-1 font-bold uppercase transition-colors cursor-pointer ${
              filter === "pending" ? "bg-brand-navy text-white" : "bg-neutral-100 hover:bg-neutral-200"
            }`}
          >
            Pending
          </button>
          <button
            type="button"
            onClick={() => setFilter("approved")}
            className={`px-3 py-1 font-bold uppercase transition-colors cursor-pointer ${
              filter === "approved" ? "bg-brand-navy text-white" : "bg-neutral-100 hover:bg-neutral-200"
            }`}
          >
            Approved
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1 font-bold uppercase transition-colors cursor-pointer ${
              filter === "all" ? "bg-brand-navy text-white" : "bg-neutral-100 hover:bg-neutral-200"
            }`}
          >
            All
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-4 text-center text-xs text-neutral-500 animate-pulse">
          Loading moderation queue...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-6 text-center text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded">
          No shoutouts currently in this queue. Tell your listeners to drop messages on tickets.goodlife.co.ke/radio or WhatsApp!
        </div>
      ) : (
        <div className="divide-y divide-brand-navy/15 max-h-96 overflow-y-auto pr-1">
          {filteredItems.map((item) => (
            <div key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-brand-navy uppercase truncate">
                    {item.sender_name}
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    ({item.sender_phone_masked})
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 bg-neutral-100 border rounded uppercase text-neutral-600">
                    {item.source}
                  </span>
                  {item.is_featured && (
                    <span className="text-[9px] px-1.5 py-0.2 bg-amber-400 font-bold border border-brand-navy rounded uppercase text-brand-navy">
                      Featured
                    </span>
                  )}
                </div>

                <p className="font-sans text-xs text-brand-navy/90 leading-relaxed">
                  "{item.message}"
                </p>

                {item.request_track && (
                  <p className="text-[11px] font-bold text-brand-accent">
                    🎵 Request: {item.request_track}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {item.status !== "approved" && (
                  <button
                    type="button"
                    disabled={actionLoading === item.id}
                    onClick={() => handleModerate(item.id, "approved")}
                    className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold uppercase flex items-center gap-1 cursor-pointer"
                    title="Approve to public ticker"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Approve</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={actionLoading === item.id}
                  onClick={() => handleModerate(item.id, "read", !item.is_featured)}
                  className={`p-1.5 rounded text-xs font-bold uppercase flex items-center gap-1 cursor-pointer border ${
                    item.is_featured
                      ? "bg-amber-400 text-brand-navy border-brand-navy"
                      : "bg-white hover:bg-amber-100 border-neutral-300 text-neutral-800"
                  }`}
                  title="Feature on marquee wall"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{item.is_featured ? "Unfeature" : "Feature"}</span>
                </button>

                {item.status !== "rejected" && (
                  <button
                    type="button"
                    disabled={actionLoading === item.id}
                    onClick={() => handleModerate(item.id, "rejected")}
                    className="p-1.5 bg-neutral-200 hover:bg-red-600 hover:text-white text-neutral-700 rounded text-xs font-bold uppercase cursor-pointer"
                    title="Reject / Hide"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
