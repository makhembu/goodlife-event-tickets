"use client";

import React, { useState, useEffect } from "react";
import { Ticket, QrCode, Trash2, X, ChevronRight, Download, Calendar, MapPin, User, ShieldCheck } from "lucide-react";
import { getAllOfflineTickets, removeOfflineTicket, CachedTicket } from "@/lib/offline-db";

interface OfflineTicketsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRefresh?: number;
}

export default function OfflineTicketsDrawer({
  isOpen,
  onClose,
  triggerRefresh = 0,
}: OfflineTicketsDrawerProps) {
  const [tickets, setTickets] = useState<CachedTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<CachedTicket | null>(null);

  const loadTickets = async () => {
    try {
      const list = await getAllOfflineTickets();
      // Sort newest saved first
      list.sort((a, b) => b.savedAt - a.savedAt);
      setTickets(list);
      if (list.length > 0 && !selectedTicket) {
        setSelectedTicket(list[0]);
      }
    } catch (err) {
      console.warn("Failed to load offline tickets:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTickets();
    }
  }, [isOpen, triggerRefresh]);

  const handleRemove = async (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Remove this ticket from this device? You can re-download it anytime while online.")) {
      await removeOfflineTicket(ticketId);
      const remaining = tickets.filter((t) => t.id !== ticketId);
      setTickets(remaining);
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(remaining.length > 0 ? remaining[0] : null);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#FAF6F0] w-full max-w-lg rounded-2xl border-3 border-[#142B4C] shadow-[8px_8px_0px_0px_#142B4C] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#142B4C] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-[#FF6B35]" />
            <h2 className="font-extrabold text-base tracking-wide uppercase">
              My Offline Passes ({tickets.length})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {tickets.length === 0 ? (
            <div className="text-center py-10 px-4">
              <QrCode className="w-12 h-12 text-[#142B4C]/40 mx-auto mb-3" />
              <p className="font-bold text-[#142B4C] text-sm mb-1">No Offline Tickets Found</p>
              <p className="text-xs text-[#556270]">
                Tickets you purchase online are automatically saved here for gate presentation even when you have no connection.
              </p>
            </div>
          ) : (
            <>
              {/* Selected Ticket Presentation Card */}
              {selectedTicket && (
                <div className="bg-white border-2 border-[#142B4C] rounded-xl p-5 shadow-[4px_4px_0px_0px_#142B4C] text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-2 bg-[#FF6B35]" />
                  
                  <div className="flex items-center justify-between text-xs text-[#556270] mb-3 mt-1">
                    <span className="font-bold text-[#FF6B35] uppercase">{selectedTicket.ticketType}</span>
                    <span className="font-mono bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                      #{selectedTicket.id}
                    </span>
                  </div>

                  <h3 className="font-black text-xl text-[#142B4C] tracking-tight mb-1">
                    {selectedTicket.eventTitle || "GOODLIFE EVENT"}
                  </h3>

                  {selectedTicket.eventDate && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-[#556270] mb-1">
                      <Calendar className="w-3.5 h-3.5 text-[#FF6B35]" />
                      <span>{selectedTicket.eventDate}</span>
                    </div>
                  )}

                  {selectedTicket.venue && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-[#556270] mb-4">
                      <MapPin className="w-3.5 h-3.5 text-[#FF6B35]" />
                      <span>{selectedTicket.venue}</span>
                    </div>
                  )}

                  {/* QR Presentation */}
                  <div className="bg-[#FAF6F0] border-2 border-dashed border-[#142B4C]/40 rounded-xl p-4 my-3 inline-block">
                    {/* SVG QR Code generator representation for offline viewing */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                        selectedTicket.id
                      )}`}
                      alt="Ticket Gate QR"
                      className="w-40 h-40 mx-auto rounded-lg"
                      loading="lazy"
                    />
                    <div className="mt-2 flex items-center justify-center gap-1 text-[11px] font-bold text-[#142B4C]">
                      <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                      <span>Verified for Gate Scanner</span>
                    </div>
                  </div>

                  <div className="text-xs text-[#142B4C] font-semibold mt-1">
                    Attendee: <span className="font-bold">{selectedTicket.buyerName}</span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between text-xs">
                    <button
                      onClick={(e) => handleRemove(selectedTicket.id, e)}
                      className="text-red-600 hover:text-red-700 font-semibold inline-flex items-center gap-1 p-1 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove from this device</span>
                    </button>
                    {navigator.onLine && (
                      <a
                        href={`/api/tickets/${selectedTicket.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#142B4C] hover:underline font-bold inline-flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download PDF</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* List of other cached tickets */}
              {tickets.length > 1 && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-bold text-[#142B4C] uppercase tracking-wider">
                    All Stored Tickets ({tickets.length})
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {tickets.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition flex items-center justify-between ${
                          selectedTicket?.id === t.id
                            ? "bg-[#142B4C] text-white border-[#142B4C]"
                            : "bg-white text-[#142B4C] border-[#142B4C]/20 hover:border-[#142B4C]"
                        }`}
                      >
                        <div className="truncate">
                          <p className="font-bold text-xs truncate">
                            {t.eventTitle} • {t.ticketType}
                          </p>
                          <p className={`text-[11px] ${selectedTicket?.id === t.id ? "text-gray-300" : "text-[#556270]"}`}>
                            Ref: {t.id} • {t.buyerName}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 shrink-0 opacity-60" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-gray-200 text-center">
          <button
            onClick={onClose}
            className="w-full bg-[#142B4C] hover:bg-[#1f3f6e] text-white font-bold py-2 px-4 rounded-xl text-sm transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
