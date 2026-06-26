"use client";

import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  fetchDashboardMetrics, 
  processTicketScan, 
  Ticket,
  EventDetails,
  fetchEventDetails,
  updateEventDetails,
  updateTicket,
  deleteTicket,
  createTicket,
  fetchTicketTiers,
  createTicketTier,
  updateTicketTier,
  deleteTicketTier,
  permanentlyDeleteTicket,
  permanentlyDeleteTicketTier,
  emptyTrash,
  TicketTier
} from "@/lib/supabase-db";
import {
  Sparkles,
  Grid,
  RefreshCw,
  Activity,
  CheckCircle,
  AlertTriangle,
  Clock,
  Lock,
  X,
  ArrowLeft,
  Edit,
  Trash2,
  Plus,
  Save,
  Download,
  Eye,
  EyeOff,
  BarChart3,
  Wallet,
  ListChecks
} from "lucide-react";
import Link from "next/link";
import BoxOfficeMetrics from "@/components/admin/BoxOfficeMetrics";
import TierSalesBreakdown from "@/components/admin/TierSalesBreakdown";

interface MetricsState {
  totalCashCollected: number;
  totalTicketsSold: number;
  scanCount: number;
  campingTiers: Record<string, { sold: number; revenue: number; cap?: number }>;
  recentSalesAmount: number;
  tickets: Ticket[];
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<MetricsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"ledger" | "tiers" | "payments" | "trash" | "paystack">("ledger");
  const [ledgerTab, setLedgerTab] = useState<"all" | "active" | "scanned">("all");

  // Event details editing states
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [eventFormState, setEventFormState] = useState<Partial<EventDetails>>({});

  // Ticket editing states
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [ticketFormState, setTicketFormState] = useState<Partial<Ticket>>({});
  const [sendWhatsApp, setSendWhatsApp] = useState(false);

  // Ticket Tier editing states
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([]);
  const [editingTier, setEditingTier] = useState<TicketTier | null>(null);
  const [isCreatingTier, setIsCreatingTier] = useState(false);
  const [tierFormState, setTierFormState] = useState<Partial<TicketTier>>({});

  // Payment Logs states
  const [paymentLogs, setPaymentLogs] = useState<any[]>([]);

  // Tickets CSV export filter states
  const [exportTicketTypeFilter, setExportTicketTypeFilter] = useState("");
  const [exportTicketStatusFilter, setExportTicketStatusFilter] = useState<"all" | "active" | "scanned">("all");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  
  // Pending Payments (orphaned) states
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [resolvingPayment, setResolvingPayment] = useState<any>(null);
  const [resolveReceipt, setResolveReceipt] = useState("");
  const [resolveAmount, setResolveAmount] = useState(0);
  const [resolveMessage, setResolveMessage] = useState("");

  // Selections for bulk actions
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [selectedTierIds, setSelectedTierIds] = useState<string[]>([]);
  const [selectedPaymentLogIds, setSelectedPaymentLogIds] = useState<number[]>([]);
  const [selectedTrashTicketIds, setSelectedTrashTicketIds] = useState<string[]>([]);
  const [selectedTrashTierIds, setSelectedTrashTierIds] = useState<string[]>([]);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);
  const [trashPassword, setTrashPassword] = useState("");
  const [showTrashPasswordModal, setShowTrashPasswordModal] = useState(false);
  const [trashActionType, setTrashActionType] = useState<"clear_all" | "delete_selected" | "">("");

  // Resend WhatsApp modal
  const [resendTicket, setResendTicket] = useState<{ id: string; phone: string } | null>(null);
  const [resendPhone, setResendPhone] = useState("");

  // Trash / restore states
  const [deletedTickets, setDeletedTickets] = useState<Ticket[]>([]);

  const getDefaultWhatsAppTemplate = () => `*{{eventTitle}} TICKET CONFIRMED*\n\nTicket ID: {{ticketId}}\nAttendee: {{buyerName}}\nPhone: {{phoneNumber}}\nEvent: {{eventTitle}} {{eventSubtitle}}\nVenue: {{eventVenue}}\n\nDownload the ticket PDF here: {{pdfUrl}}\n\nREGULATIONS:\n{{eventRegulations}}`;
  const getDefaultOperatorTemplate = () => "🔔 *NEW TICKET SECURED!* 🎫\n\n👤 *Buyer:* {{buyerName}}\n🎫 *Tier:* {{ticketType}} (Qty: {{quantity}})\n💵 *Amount Paid:* KES {{amountPaid}}\n📄 *Reference/ID:* {{reference}}";
  const getDefaultScanTemplate = () => "🎫 *GOODLIFE ENTRY VALIDATED!* ✅\n\nYour ticket has been verified at the gate.\n\n👤 *Attendee:* {{buyerName}}\n🎫 *Ticket Type:* {{ticketType}}\n📄 *Ticket ID:* {{ticketId}}\n💂‍♂️ *Scanned By:* {{scannerName}}\n⏰ *Time:* {{scanTime}}\n\nWelcome to GOODLIFE! Enjoy the experience! 🎉";
  const [deletedTiers, setDeletedTiers] = useState<TicketTier[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(false);

  const closeAllModals = () => {
    setIsEditingEvent(false);
    setEditingTicket(null);
    setIsCreatingTicket(false);
    setIsCreatingTier(false);
    setEditingTier(null);
    setDeletingTicketId(null);
    setResolvingPayment(null);
    setDeletingTierId(null);
    setShowTrashPasswordModal(false);
    setResendTicket(null);
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") closeAllModals();
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {}
    window.location.href = "/login";
  };

  const loadDashboardMetrics = async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardMetrics();
      setMetrics(data);
    } catch (err) {
      console.error("Failed to load metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadEventDetails = async () => {
    try {
      const details = await fetchEventDetails();
      setEventDetails(details);
      
      setEventFormState({
        ...details,
        whatsapp_message: details.whatsapp_message?.trim()
          ? details.whatsapp_message
          : getDefaultWhatsAppTemplate(),
        whatsapp_operator_template: details.whatsapp_operator_template?.trim()
          ? details.whatsapp_operator_template
          : getDefaultOperatorTemplate(),
        whatsapp_scan_template: details.whatsapp_scan_template?.trim()
          ? details.whatsapp_scan_template
          : getDefaultScanTemplate(),
        operator_notifications_enabled: details.operator_notifications_enabled ?? false
      });
    } catch (err) {
      console.error("Failed to load event details:", err);
    }
  };

  const loadTicketTiers = async () => {
    try {
      const tiers = await fetchTicketTiers();
      setTicketTiers(tiers);
    } catch (err) {
      console.error("Failed to load ticket tiers:", err);
    }
  };

  const loadPaymentLogs = async () => {
    try {
      const res = await fetch("/api/admin/payment-logs");
      if (res.ok) {
        const data = await res.json();
        setPaymentLogs(data);
      }
    } catch (err) {
      console.error("Failed to load payment logs:", err);
    }
  };

  const loadPendingPayments = async () => {
    try {
      const res = await fetch("/api/admin/pending-payments");
      if (res.ok) {
        const data = await res.json();
        setPendingPayments(data);
      }
    } catch (err) {
      console.error("Failed to load pending payments:", err);
    }
  };

  const loadDeletedItems = async () => {
    setLoadingTrash(true);
    try {
      const [ticketsRes, tiersRes] = await Promise.all([
        fetch("/api/admin/tickets?deleted=true"),
        fetch("/api/ticket-tiers?deleted=true")
      ]);
      if (ticketsRes.ok) setDeletedTickets(await ticketsRes.json());
      if (tiersRes.ok) setDeletedTiers(await tiersRes.json());
    } catch (err) {
      console.error("Failed to load deleted items:", err);
    } finally {
      setLoadingTrash(false);
    }
  };

  const handleRestoreTicket = async (id: string) => {
    try {
      await fetch(`/api/admin/tickets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleted_at: null })
      });
      loadDeletedItems();
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to restore ticket:", err);
    }
  };

  const handleRestoreTier = async (id: string) => {
    try {
      await fetch(`/api/ticket-tiers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleted_at: null })
      });
      loadDeletedItems();
      loadTicketTiers();
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to restore tier:", err);
    }
  };

  const handleExportPayments = () => {
    if (paymentLogs.length === 0) {
      alert("No payments logged to export!");
      return;
    }

    const headers = ["ID", "Checkout Request ID", "Receipt", "Phone Number", "Amount (KES)", "Status", "Result Description", "Created At"];
    const rows = paymentLogs.map(log => [
      log.id,
      log.checkout_request_id || "",
      log.mpesa_receipt || log.receipt || "",
      log.phone_number || "",
      log.amount || "0",
      log.status,
      `"${(log.result_desc || "").replace(/"/g, '""')}"`,
      new Date(log.created_at).toLocaleString()
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `GOODLIFE-PAYMENTS-EXPORT-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportTicketsCSV = () => {
    if (!data) return;
    let filtered = [...data.tickets];

    if (exportTicketTypeFilter) {
      filtered = filtered.filter(t => t.ticket_type === exportTicketTypeFilter);
    }
    if (exportTicketStatusFilter === "active") {
      filtered = filtered.filter(t => !t.is_scanned);
    } else if (exportTicketStatusFilter === "scanned") {
      filtered = filtered.filter(t => t.is_scanned);
    }
    if (exportDateFrom) {
      const from = new Date(exportDateFrom).getTime();
      filtered = filtered.filter(t => new Date(t.purchase_time).getTime() >= from);
    }
    if (exportDateTo) {
      const to = new Date(exportDateTo).getTime() + 86400000;
      filtered = filtered.filter(t => new Date(t.purchase_time).getTime() <= to);
    }

    if (filtered.length === 0) {
      alert("No tickets match the current filters.");
      return;
    }

    const headers = ["Ticket ID", "Receipt", "Buyer Name", "Phone", "Ticket Type", "Amount (KES)", "Purchase Date", "Status", "Scanned At", "Scanned By"];
    const rows = filtered.map(t => [
      t.id,
      t.mpesa_receipt,
      `"${(t.buyer_name || "").replace(/"/g, '""')}"`,
      t.phone_number,
      t.ticket_type,
      Number(t.amount_paid).toString(),
      new Date(t.purchase_time).toLocaleString(),
      t.is_scanned ? "SCANNED" : "ACTIVE",
      t.scanned_at ? new Date(t.scanned_at).toLocaleString() : "",
      t.scanned_by || ""
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `GOODLIFE-TICKETS-EXPORT-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeletePaymentLog = async (id: number) => {
    if (!confirm("Delete this payment log entry?")) return;
    try {
      const res = await fetch(`/api/admin/payment-logs?id=${id}`, { method: "DELETE" });
      if (res.ok) loadPaymentLogs();
    } catch (err) {
      console.error("Failed to delete payment log:", err);
    }
  };

  const handleClearAllPaymentLogs = async () => {
    if (!confirm("Delete ALL payment log entries? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/admin/payment-logs?all=true", { method: "DELETE" });
      if (res.ok) loadPaymentLogs();
    } catch (err) {
      console.error("Failed to clear payment logs:", err);
    }
  };

  const handleClearAllPendingPayments = async () => {
    if (!confirm("Delete ALL pending payment records? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/admin/pending-payments?all=true", { method: "DELETE" });
      if (res.ok) loadPendingPayments();
    } catch (err) {
      console.error("Failed to clear pending payments:", err);
    }
  };

  const handleDeletePendingPayment = async (checkoutRequestId: string) => {
    if (!confirm(`Delete pending payment ${checkoutRequestId}?`)) return;
    try {
      const res = await fetch(`/api/admin/pending-payments?checkout_request_id=${encodeURIComponent(checkoutRequestId)}`, { method: "DELETE" });
      if (res.ok) loadPendingPayments();
    } catch (err) {
      console.error("Failed to delete pending payment:", err);
    }
  };

  const handleResolvePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingPayment) return;
    setResolveMessage("Resolving...");
    try {
      const res = await fetch("/api/admin/pending-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkout_request_id: resolvingPayment.checkout_request_id,
          mpesa_receipt: resolveReceipt.toUpperCase(),
          amount_paid: resolveAmount
        })
      });
      const data = await res.json();
      if (data.success) {
        setResolveMessage(`SUCCESS: ${data.message}`);
        setResolvingPayment(null);
        loadPendingPayments();
        loadDashboardMetrics();
      } else {
        setResolveMessage(`FAILED: ${data.message}`);
      }
    } catch (err: any) {
      setResolveMessage(`ERROR: ${err.message}`);
    }
  };

  // Load metrics initially
  const didLoad = React.useRef(false);
  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    loadDashboardMetrics();
    loadEventDetails();
    loadTicketTiers();
    loadPaymentLogs();
    loadPendingPayments();

    // Auto refresh every 30 seconds
    const timer = setInterval(() => {
      loadDashboardMetrics();
    }, 30000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const handleToggleSimulators = async () => {
    const isCurrentlyEnabled = eventFormState.simulators_enabled !== false;
    if (isCurrentlyEnabled) {
      setEventFormState({ ...eventFormState, simulators_enabled: false });
    } else {
      const pw = prompt("Enter developer password to enable checkout simulators:");
      if (pw !== null) {
        try {
          const res = await fetch("/api/admin/verify-simulator-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: pw }),
          });
          if (res.ok) {
            setEventFormState({ ...eventFormState, simulators_enabled: true });
            alert("Developer simulators enabled successfully.");
          } else {
            alert("Incorrect developer password. Access denied.");
          }
        } catch {
          alert("Failed to verify password. Try again.");
        }
      }
    }
  };

  const handleSaveEventDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await updateEventDetails(eventFormState);
      setEventDetails(updated);
      setIsEditingEvent(false);
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to update event details:", err);
    }
  };

  const handleEditTicketClick = (ticket: Ticket) => {
    setEditingTicket(ticket);
    setTicketFormState(ticket);
  };

  const handleSaveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    try {
      await updateTicket(editingTicket.id, ticketFormState);
      setEditingTicket(null);
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to update ticket:", err);
    }
  };

  const handleDeleteTicketClick = (id: string) => {
    setDeletingTicketId(id);
  };

  const handleConfirmDeleteTicket = async () => {
    if (!deletingTicketId) return;
    try {
      await deleteTicket(deletingTicketId);
      setDeletingTicketId(null);
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to delete ticket:", err);
    }
  };

  const handleTrashPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trashPassword !== "GoodlifeAdmin2026!") {
      alert("Incorrect admin password. Access denied.");
      return;
    }

    try {
      if (trashActionType === "clear_all") {
        await emptyTrash();
        setSelectedTrashTicketIds([]);
        setSelectedTrashTierIds([]);
      } else if (trashActionType === "delete_selected") {
        for (const id of selectedTrashTicketIds) {
          await permanentlyDeleteTicket(id);
        }
        for (const id of selectedTrashTierIds) {
          await permanentlyDeleteTicketTier(id);
        }
        setSelectedTrashTicketIds([]);
        setSelectedTrashTierIds([]);
      }
      setShowTrashPasswordModal(false);
      loadDeletedItems();
      loadDashboardMetrics();
      loadTicketTiers();
    } catch (err) {
      console.error("Failed to execute permanent delete:", err);
      alert("Database error executing delete.");
    }
  };

  const handleCreateTicketClick = () => {
    setIsCreatingTicket(true);
    setSendWhatsApp(false);
    const firstTier = ticketTiers.length > 0 ? ticketTiers[0] : null;
    setTicketFormState({
      id: "GL-" + Math.random().toString(36).substring(2, 10).toUpperCase(),
      mpesa_receipt: "O" + Math.random().toString(36).substring(2, 11).toUpperCase(),
      phone_number: "2547",
      ticket_type: firstTier?.id || "ADV 500",
      amount_paid: firstTier?.price || 500,
      is_scanned: false
    });
  };

  const handleSaveCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const ticket = await createTicket(ticketFormState as Ticket);
      if (sendWhatsApp && ticket?.id && ticket?.phone_number) {
        await fetch("/api/admin/send-whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId: ticket.id, phoneNumber: ticket.phone_number }),
        });
      }
      setIsCreatingTicket(false);
      loadDashboardMetrics();
    } catch (err: any) {
      alert("Failed to create ticket: " + (err.message || "Unknown error"));
    }
  };

  const handleCreateTierClick = () => {
    setIsCreatingTier(true);
    setTierFormState({
      id: "",
      name: "",
      price: 0,
      description: "",
      tag: "",
      show_only_on_event_day: false,
      hide_on_event_day: false
    });
  };

  const handleSaveCreateTier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTicketTier(tierFormState as TicketTier);
      setIsCreatingTier(false);
      loadTicketTiers();
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to create ticket tier:", err);
    }
  };

  const handleEditTierClick = (tier: TicketTier) => {
    setEditingTier(tier);
    setTierFormState(tier);
  };

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTier) return;
    try {
      await updateTicketTier(editingTier.id, tierFormState);
      setEditingTier(null);
      loadTicketTiers();
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to update ticket tier:", err);
    }
  };

  const handleToggleHiddenTier = async (tier: TicketTier) => {
    try {
      await updateTicketTier(tier.id, { hidden: !tier.hidden });
      loadTicketTiers();
    } catch (err) {
      console.error("Failed to toggle tier visibility:", err);
    }
  };

  const handleDeleteTierClick = (id: string) => {
    setDeletingTierId(id);
  };

  const handleConfirmDeleteTier = async () => {
    if (!deletingTierId) return;
    try {
      await deleteTicketTier(deletingTierId);
      setDeletingTierId(null);
      loadTicketTiers();
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to delete ticket tier:", err);
    }
  };

  const handleResendWhatsApp = async () => {
    if (!resendTicket || !resendPhone) return;
    const ids = resendTicket.id.split(",");
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        const res = await fetch("/api/admin/send-whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId: id.trim(), phoneNumber: resendPhone })
        });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }
    alert(`${ok} sent, ${fail} failed.`);
    if (ok > 0) { setSelectedTicketIds([]); loadDashboardMetrics(); }
    setResendTicket(null);
    setResendPhone("");
  };

  // Rotating loading messages
  const [loadingMsg, setLoadingMsg] = useState(0);
  const loadingMessages = [
    "LOADING ADMIN DASHBOARD...",
    "FETCHING TICKET LEDGER...",
    "COMPILING SALES METRICS...",
    "SYNCING PAYMENT LOGS...",
  ];
  useEffect(() => {
    if (!loading || metrics) return;
    const t = setInterval(() => setLoadingMsg(i => (i + 1) % loadingMessages.length), 2500);
    return () => clearInterval(t);
  }, [loading, metrics]);

  if (loading && !metrics) {
    return (
      <div className="min-h-screen bg-[var(--brand-off-white)] flex flex-col items-center justify-center text-[var(--brand-navy)]">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p key={loadingMsg} className="mt-2 text-xs font-black tracking-widest uppercase">{loadingMessages[loadingMsg]}</p>
      </div>
    );
  }

  const data = metrics!;
  const filteredTickets = ledgerTab === "all" ? data.tickets
    : ledgerTab === "active" ? data.tickets.filter(t => !t.is_scanned)
    : data.tickets.filter(t => t.is_scanned);

  return (
    <div className="min-h-screen bg-[var(--brand-off-white)] py-6 px-4 md:px-8 text-[var(--brand-navy)] font-sans selection:bg-[var(--brand-navy)] selection:text-white">
      
      {/* BRANDING HEADER SYSTEM */}
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between sm:items-center border-b-4 border-[var(--brand-navy)] pb-4 mb-6 gap-4">
        <div>
          <span className="font-sans font-black tracking-widest text-[10px] bg-[var(--brand-navy)] text-[var(--brand-off-white)] px-2.5 py-0.5 uppercase">
            ADMIN CONSOLE
          </span>
          <h1 className="text-3xl font-sans font-black tracking-tighter uppercase mt-1 leading-none text-[var(--brand-navy)]">
            {(eventDetails?.title || "GOODLIFE").toUpperCase()} ADMIN
          </h1>
        </div>

        <div className="flex gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => {
              setIsEditingEvent(true);
              setEventFormState({
                ...eventDetails,
                whatsapp_message: eventDetails?.whatsapp_message?.trim()
                  ? eventDetails.whatsapp_message
                  : getDefaultWhatsAppTemplate(),
                operator_notifications_enabled: eventDetails?.operator_notifications_enabled ?? false
              });
            }}
            className="text-xs font-black uppercase border-2 border-[var(--brand-navy)] px-3.5 py-2 hover:bg-[var(--brand-navy)] hover:text-[var(--brand-off-white)] transition-colors flex items-center gap-1 bg-[var(--brand-off-white)]"
          >
            <Edit className="w-3.5 h-3.5" /> EDIT EVENT INFO
          </button>
          <Link 
            href="/" 
            className="text-xs font-black uppercase border-2 border-[var(--brand-navy)] px-3.5 py-2 hover:bg-[var(--brand-navy)] hover:text-[var(--brand-off-white)] transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> CHECKOUT PORTAL
          </Link>
          <Link 
            href="/admin/scanner" 
            className="text-xs font-black uppercase bg-[var(--brand-navy)] text-[var(--brand-off-white)] px-3 py-2 hover:bg-[var(--brand-navy-light)] transition-colors flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5" /> GATE SCAN
          </Link>
          <button 
            onClick={handleSignOut}
            className="text-xs font-black uppercase border-2 border-red-600 text-red-600 px-3.5 py-2 hover:bg-red-600 hover:text-white transition-colors"
          >
            SIGN OUT
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">

        <BoxOfficeMetrics
          totalCashCollected={data.totalCashCollected}
          totalTicketsSold={data.totalTicketsSold}
          recentSalesAmount={data.recentSalesAmount}
          scanCount={data.scanCount}
        />

        <TierSalesBreakdown
          campingTiers={data.campingTiers}
          totalTicketsSold={data.totalTicketsSold}
          ticketTiers={ticketTiers}
        />

        {/* TABS SELECTION BAR */}
        <div className="flex flex-col sm:flex-row border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-[4px_4px_0px_0px_var(--brand-navy)] overflow-hidden">
          <button
            onClick={() => setActiveTab("ledger")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors ${
              activeTab === "ledger"
                ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                : "bg-transparent text-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/5"
            }`}
          >
            Ticket Sales ({data.tickets.length})
          </button>
          <button
            onClick={() => setActiveTab("tiers")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors border-t-4 sm:border-t-0 sm:border-l-4 border-[var(--brand-navy)] ${
              activeTab === "tiers"
                ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                : "bg-transparent text-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/5"
            }`}
          >
            Ticket Tiers ({ticketTiers.length})
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors border-t-4 sm:border-t-0 sm:border-l-4 border-[var(--brand-navy)] ${
              activeTab === "payments"
                ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                : "bg-transparent text-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/5"
            }`}
          >
            Payments ({paymentLogs.length})
          </button>
          <button
            onClick={() => setActiveTab("paystack")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors border-t-4 sm:border-t-0 sm:border-l-4 border-[var(--brand-navy)] ${
              activeTab === "paystack"
                ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                : "bg-transparent text-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/5"
            }`}
          >
            Paystack
          </button>
          <button
            onClick={() => { setActiveTab("trash"); loadDeletedItems(); }}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors border-t-4 sm:border-t-0 sm:border-l-4 border-[var(--brand-navy)] ${
              activeTab === "trash"
                ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                : "bg-transparent text-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/5"
            }`}
          >
            Trash ({deletedTickets.length + deletedTiers.length})
          </button>
        </div>

        {activeTab === "ledger" ? (
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-[6px_6px_0px_0px_var(--brand-navy)]">
            
            <div className="flex justify-between items-center bg-[var(--brand-navy)] p-3 text-[var(--brand-off-white)]">
              <span className="text-xs font-black tracking-widest uppercase">TICKET SALES LOG</span>
              <div className="flex gap-2">
                <button 
                  onClick={handleCreateTicketClick}
                  className="px-2 py-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/20 active:scale-95 transition-all duration-150 text-xs font-black uppercase flex items-center gap-1"
                  title="Manually create a ticket"
                >
                  <Plus className="w-3.5 h-3.5" /> Manual Ticket
                </button>
                <button 
                  onClick={loadDashboardMetrics}
                  className="p-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/20 active:scale-95 transition-all duration-150"
                  title="Refresh master ledger"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* CSV Export Row with Filters */}
            <div className="flex flex-wrap items-center gap-2 p-2 bg-[var(--brand-off-white)] border-b-2 border-[var(--brand-navy)]">
              <span className="text-[9px] font-black uppercase text-[var(--brand-navy)] mr-1">EXPORT:</span>
              <select
                value={exportTicketTypeFilter}
                onChange={(e) => setExportTicketTypeFilter(e.target.value)}
                className="text-[10px] border border-[var(--brand-navy)]/20 px-1.5 py-1 bg-[var(--brand-off-white)] font-mono"
              >
                <option value="">All Types</option>
                {ticketTiers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <select
                value={exportTicketStatusFilter}
                onChange={(e) => setExportTicketStatusFilter(e.target.value as any)}
                className="text-[10px] border border-[var(--brand-navy)]/20 px-1.5 py-1 bg-[var(--brand-off-white)] font-mono"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="scanned">Scanned Only</option>
              </select>
              <input
                type="date"
                value={exportDateFrom}
                onChange={(e) => setExportDateFrom(e.target.value)}
                className="text-[10px] border border-[var(--brand-navy)]/20 px-1.5 py-1 bg-[var(--brand-off-white)] font-mono"
                title="From date"
              />
              <span className="text-[9px] text-[var(--brand-navy)]/60">-</span>
              <input
                type="date"
                value={exportDateTo}
                onChange={(e) => setExportDateTo(e.target.value)}
                className="text-[10px] border border-[var(--brand-navy)]/20 px-1.5 py-1 bg-[var(--brand-off-white)] font-mono"
                title="To date"
              />
              <button
                onClick={handleExportTicketsCSV}
                className="text-[10px] font-black uppercase border border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white px-2.5 py-1 hover:opacity-80 active:scale-95 transition-all duration-150 flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> CSV
              </button>
            </div>

            {/* Active / Scanned sub-tabs */}
            <div className="flex border-b-2 border-[var(--brand-navy)] bg-[var(--brand-off-white)]/70">
              {(["all", "active", "scanned"] as const).map((tab) => {
                const count = tab === "all" ? data.tickets.length
                  : tab === "active" ? data.tickets.filter(t => !t.is_scanned).length
                  : data.tickets.filter(t => t.is_scanned).length;
                return (
                  <button
                    key={tab}
                    onClick={() => setLedgerTab(tab)}
                    className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest border-b-2 -mb-[2px] transition-colors ${
                      ledgerTab === tab
                        ? "border-[var(--brand-navy)] text-[var(--brand-navy)]"
                        : "border-transparent text-[var(--brand-navy)]/40 hover:text-[var(--brand-navy)]/60"
                    }`}
                  >
                    {tab === "all" ? "ALL" : tab === "active" ? "ACTIVE" : "USED"} ({count})
                  </button>
                );
              })}
            </div>

            {selectedTicketIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 p-3 bg-[var(--brand-warning-bg)] border-b-2 border-[var(--brand-navy)] text-xs font-black uppercase">
                <span className="text-brand-warning">Selected: {selectedTicketIds.length} tickets</span>
                <button
                  onClick={async () => {
                    if (confirm("Send selected tickets to Trash?")) {
                      for (const id of selectedTicketIds) {
                        await fetch(`/api/admin/tickets/${id}`, { method: "DELETE" });
                      }
                      setSelectedTicketIds([]);
                      loadDashboardMetrics();
                    }
                  }}
                  className="px-2.5 py-1 bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-700 active:scale-95 transition-all duration-150 cursor-pointer border border-red-700"
                >
                  Send to Trash
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Resend ${selectedTicketIds.length} ticket(s) via WhatsApp to their own numbers?`)) return;
                    let ok = 0, fail = 0;
                    for (const id of selectedTicketIds) {
                      const t = metrics?.tickets.find(tk => tk.id === id);
                      if (!t) { fail++; continue; }
                      try {
                        const res = await fetch("/api/admin/send-whatsapp", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ticketId: id, phoneNumber: t.phone_number })
                        });
                        if (res.ok) ok++; else fail++;
                      } catch { fail++; }
                    }
                    alert(`${ok} sent to their own numbers, ${fail} failed.`);
                    if (ok > 0) { setSelectedTicketIds([]); loadDashboardMetrics(); }
                  }}
                  className="px-2.5 py-1 bg-[var(--brand-navy)] text-white text-[10px] font-black uppercase hover:opacity-90 active:scale-95 transition-all duration-150 cursor-pointer border border-[var(--brand-navy)]"
                >
                  Resend WhatsApp
                </button>
                <button
                  onClick={async () => {
                    if (confirm("Mark selected tickets as Scanned?")) {
                      for (const id of selectedTicketIds) {
                        await fetch(`/api/admin/tickets/${id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ is_scanned: true, scanned_at: new Date().toISOString(), scanned_by: "Admin Bulk Action" })
                        });
                      }
                      setSelectedTicketIds([]);
                      loadDashboardMetrics();
                    }
                  }}
                  className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-black uppercase hover:bg-green-700 active:scale-95 transition-all duration-150 cursor-pointer border border-green-700"
                >
                  Mark Scanned
                </button>
                <button
                  onClick={async () => {
                    if (confirm("Mark selected tickets as Active (Unscanned)?")) {
                      for (const id of selectedTicketIds) {
                        await fetch(`/api/admin/tickets/${id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ is_scanned: false, scanned_at: null, scanned_by: null })
                        });
                      }
                      setSelectedTicketIds([]);
                      loadDashboardMetrics();
                    }
                  }}
                  className="px-2.5 py-1 bg-blue-600 text-white text-[10px] font-black uppercase hover:bg-blue-700 active:scale-95 transition-all duration-150 cursor-pointer border border-blue-700"
                >
                  Mark Active
                </button>
                <button
                  onClick={() => setSelectedTicketIds([])}
                  className="px-2.5 py-1 bg-[var(--brand-off-white)] text-[var(--brand-navy)] text-[10px] font-black uppercase hover:bg-[var(--brand-bg)] active:scale-95 transition-all duration-150 cursor-pointer border border-[var(--brand-navy)]/20 ml-auto"
                >
                  Deselect All
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              {/* Desktop Table View */}
              <table className="hidden md:table w-full text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-[var(--brand-navy)] bg-[var(--brand-bg)]uppercase text-[var(--brand-navy)] font-black">
                    <th className="p-3 w-8">
                      <input 
                        type="checkbox"
                        checked={filteredTickets.length > 0 && selectedTicketIds.length === filteredTickets.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTicketIds(filteredTickets.map(tk => tk.id));
                          } else {
                            setSelectedTicketIds([]);
                          }
                        }}
                        className="w-3.5 h-3.5 accent-[var(--brand-navy)] cursor-pointer"
                      />
                    </th>
                    <th className="p-3">TICKET ID / RECEIPT</th>
                    <th className="p-3">ATTENDEE</th>
                    <th className="p-3">TIER TYPE</th>
                    <th className="p-3">PHONE</th>
                    <th className="p-3">PAID</th>
                    <th className="p-3">DATE / TIME</th>
                    <th className="p-3">STATUS</th>
                    <th className="p-3 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--brand-navy)]/15 font-medium text-[var(--brand-navy)]">
                  {filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-[var(--brand-navy-light)] uppercase font-black tracking-widest">
                        {data.tickets.length === 0 ? "Zero tickets cataloged. Purchase a ticket or create one manually above." : `No ${ledgerTab === "scanned" ? "used" : "active"} tickets in this batch.`}
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map((t) => (
                      <tr key={t.id} className="hover:bg-[var(--brand-navy)]/5">
                        <td className="p-3">
                          <input 
                            type="checkbox"
                            checked={selectedTicketIds.includes(t.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTicketIds([...selectedTicketIds, t.id]);
                              } else {
                                setSelectedTicketIds(selectedTicketIds.filter(id => id !== t.id));
                              }
                            }}
                            className="w-3.5 h-3.5 accent-[var(--brand-navy)] cursor-pointer"
                          />
                        </td>
                        <td className="p-3 flex flex-col">
                          <span className="font-mono font-black text-[var(--brand-navy)]">{t.id}</span>
                          <span className="text-[10px] font-mono text-[var(--brand-navy-light)]">M-Pesa: {t.mpesa_receipt}</span>
                        </td>
                        <td className="p-3 font-bold text-[var(--brand-navy)] uppercase">{t.buyer_name}</td>
                        <td className="p-3 uppercase">
                          <span className="bg-[var(--brand-navy)]/5 text-[var(--brand-navy)] px-2 py-0.5 border border-[var(--brand-navy)]/20 font-black">
                            {t.ticket_type}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{t.phone_number}</td>
                        <td className="p-3 font-black text-[var(--brand-navy)]">KES {Number(t.amount_paid).toLocaleString()}</td>
                        <td className="p-3 font-mono text-[10px] text-[var(--brand-navy)]/60">
                          {new Date(t.purchase_time).toLocaleString()}
                        </td>
                        <td className="p-3">
                          {t.is_scanned ? (
                            <span className="bg-red-100 border border-red-300 text-red-900 font-bold px-2 py-0.5 uppercase text-[9px] flex items-center gap-1 w-max">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" /> SCANNED
                            </span>
                          ) : (
                            <span className="bg-green-100 border border-green-300 text-green-900 font-bold px-2 py-0.5 uppercase text-[9px] flex items-center gap-1 w-max">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-600" /> ACTIVE
                            </span>
                          )}
                          {t.is_scanned && t.scanned_at && (
                            <span className="block text-[8px] font-mono text-red-600 mt-1">
                              At {new Date(t.scanned_at).toLocaleTimeString()} by {t.scanned_by}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <a
                              href={`/api/tickets/${t.id}/download`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--brand-navy)] hover:underline font-bold text-[11px] uppercase active:scale-95 transition-all duration-150"
                            >
                              PDF
                            </a>
                            <button
                              onClick={() => { setResendTicket({ id: t.id, phone: t.phone_number }); setResendPhone(t.phone_number); }}
                              className="text-green-700 hover:text-green-900 font-bold text-[11px] uppercase flex items-center gap-0.5 active:scale-95 transition-all duration-150"
                              title="Resend ticket via WhatsApp"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0zm3.847 17.338c-.161.455-.935.882-1.32.936-.364.051-.834.128-2.69-.64-2.242-.927-3.666-3.21-3.774-3.354-.108-.144-.898-1.196-.898-2.28s.57-1.616.772-1.834c.202-.218.441-.272.585-.272.144 0 .288.001.411.006.132.006.311-.052.478.35.176.425.594 1.45.646 1.554.052.104.088.227.016.371-.072.144-.108.234-.216.353-.108.119-.228.257-.323.337-.104.088-.213.185-.094.39.119.205.529.873 1.134 1.412.782.697 1.442.915 1.647 1.019.205.104.323.088.446-.052.119-.14.515-.596.653-.802.138-.206.275-.171.464-.104.189.067 1.194.563 1.399.667.205.104.341.155.394.243.053.088.053.513-.108.968z"/></svg>
                            </button>
                            <button
                              onClick={() => handleEditTicketClick(t)}
                              className="text-[var(--brand-navy)] hover:text-[var(--brand-navy-light)] font-bold text-[11px] uppercase flex items-center gap-0.5"
                            >
                              <Edit className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteTicketClick(t.id)}
                              className="text-red-600 hover:text-red-800 font-bold text-[11px] uppercase flex items-center gap-0.5 active:scale-95 transition-all duration-150"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Mobile Card-List View */}
              <div className="md:hidden divide-y divide-[var(--brand-navy)]/15 font-medium text-[var(--brand-navy)]">
                  {filteredTickets.length === 0 ? (
                  <div className="p-6 text-center text-[var(--brand-navy-light)] uppercase font-black tracking-widest text-xs">
                    No {ledgerTab === "scanned" ? "used" : "active"} tickets found in this batch.
                  </div>
                ) : (
                  filteredTickets.map((t) => (
                    <div key={t.id} className="p-4 space-y-3 hover:bg-[var(--brand-navy)]/5">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="font-mono font-black text-[var(--brand-navy)] text-sm">{t.id}</span>
                          <span className="text-[10px] font-mono text-[var(--brand-navy-light)]">M-Pesa: {t.mpesa_receipt}</span>
                        </div>
                        <div>
                          {t.is_scanned ? (
                            <span className="bg-red-100 border border-red-300 text-red-900 font-bold px-2 py-0.5 uppercase text-[9px] flex items-center gap-1 w-max">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" /> SCANNED
                            </span>
                          ) : (
                            <span className="bg-green-100 border border-green-300 text-green-900 font-bold px-2 py-0.5 uppercase text-[9px] flex items-center gap-1 w-max">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-600" /> ACTIVE
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Attendee</span>
                          <span className="font-bold text-[var(--brand-navy)] uppercase">{t.buyer_name}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Tier Type</span>
                          <span className="bg-[var(--brand-navy)]/5 text-[var(--brand-navy)] px-1.5 py-0.5 border border-[var(--brand-navy)]/20 font-black uppercase text-[10px] inline-block">
                            {t.ticket_type}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Phone</span>
                          <span className="font-mono">{t.phone_number}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Amount Paid</span>
                          <span className="font-black text-[var(--brand-navy)]">KES {Number(t.amount_paid).toLocaleString()}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Date / Time</span>
                          <span className="font-mono text-[var(--brand-navy)]/60">{new Date(t.purchase_time).toLocaleString()}</span>
                          {t.is_scanned && t.scanned_at && (
                            <span className="block text-[8px] font-mono text-red-600 mt-1">
                              Scanned at {new Date(t.scanned_at).toLocaleTimeString()} by {t.scanned_by}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2 border-t border-[var(--brand-navy)]/10 justify-end text-xs font-bold">
                        <a
                          href={`/api/tickets/${t.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--brand-navy)] hover:underline uppercase text-[11px] shrink-0"
                        >
                          PDF
                        </a>
                        <button
                          onClick={() => { setResendTicket({ id: t.id, phone: t.phone_number }); setResendPhone(t.phone_number); }}
                          className="text-green-700 hover:text-green-900 uppercase flex items-center gap-0.5 text-[11px] shrink-0 active:scale-95 transition-all duration-150"
                          title="Resend via WhatsApp"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0z"/></svg>
                        </button>
                        <button
                          onClick={() => handleEditTicketClick(t)}
                          className="text-[var(--brand-navy)] hover:text-[var(--brand-navy-light)] uppercase flex items-center gap-0.5 text-[11px] shrink-0"
                        >
                          <Edit className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTicketClick(t.id)}
                          className="text-red-600 hover:text-red-800 uppercase flex items-center gap-0.5 text-[11px] shrink-0"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="p-3 bg-[var(--brand-bg)]border-t-2 border-[var(--brand-navy)] text-right font-mono text-[10px] text-[var(--brand-navy-light)]">
              Sales system active: 2026-06-17
            </div>
          </div>
        ) : activeTab === "tiers" ? (
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-[6px_6px_0px_0px_var(--brand-navy)]">
            <div className="flex justify-between items-center bg-[var(--brand-navy)] p-3 text-[var(--brand-off-white)]">
              <span className="text-xs font-black tracking-widest uppercase">Manage Event Ticket Tiers</span>
              <div className="flex gap-2">
                <button 
                  onClick={handleCreateTierClick}
                  className="px-2 py-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/10 text-xs font-black uppercase flex items-center gap-1"
                  title="Add a new ticket tier"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Tier
                </button>
                <button 
                  onClick={loadTicketTiers}
                  className="p-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/10"
                  title="Refresh ticket tiers"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {selectedTierIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 p-3 bg-[var(--brand-warning-bg)] border-b-2 border-[var(--brand-navy)] text-xs font-black uppercase">
                <span className="text-brand-warning">Selected: {selectedTierIds.length} tiers</span>
                <button
                  onClick={async () => {
                    if (confirm("Send selected tiers to Trash?")) {
                      for (const id of selectedTierIds) {
                        await fetch(`/api/ticket-tiers/${id}`, { method: "DELETE" });
                      }
                      setSelectedTierIds([]);
                      loadTicketTiers();
                    }
                  }}
                  className="px-2.5 py-1 bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-700 active:scale-95 transition-all duration-150 cursor-pointer border border-red-700"
                >
                  Send to Trash
                </button>
                <button
                  onClick={async () => {
                    for (const id of selectedTierIds) {
                      await fetch(`/api/ticket-tiers/${id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ hidden: true })
                      });
                    }
                    setSelectedTierIds([]);
                    loadTicketTiers();
                  }}
                  className="px-2.5 py-1 bg-brand-warning text-white text-[10px] font-black uppercase hover:bg-brand-warning active:scale-95 transition-all duration-150 cursor-pointer border border-brand-warning"
                >
                  Hide selected
                </button>
                <button
                  onClick={async () => {
                    for (const id of selectedTierIds) {
                      await fetch(`/api/ticket-tiers/${id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ hidden: false })
                      });
                    }
                    setSelectedTierIds([]);
                    loadTicketTiers();
                  }}
                  className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-black uppercase hover:bg-green-700 active:scale-95 transition-all duration-150 cursor-pointer border border-green-700"
                >
                  Show selected
                </button>
                <button
                  onClick={() => setSelectedTierIds([])}
                  className="px-2.5 py-1 bg-[var(--brand-off-white)] text-[var(--brand-navy-light)] text-[10px] font-black uppercase hover:bg-[var(--brand-navy)]/5 active:scale-95 transition-all duration-150 cursor-pointer border border-[var(--brand-navy)]/20 ml-auto"
                >
                  Deselect All
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              {/* Desktop Table View */}
              <table className="hidden md:table w-full text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-[var(--brand-navy)] bg-[var(--brand-bg)]uppercase text-[var(--brand-navy)] font-black font-sans">
                    <th className="p-3 w-8">
                      <input 
                        type="checkbox"
                        checked={ticketTiers.length > 0 && selectedTierIds.length === ticketTiers.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTierIds(ticketTiers.map(tk => tk.id));
                          } else {
                            setSelectedTierIds([]);
                          }
                        }}
                        className="w-3.5 h-3.5 accent-[var(--brand-navy)] cursor-pointer"
                      />
                    </th>
                    <th className="p-3">TIER ID</th>
                    <th className="p-3">DISPLAY NAME</th>
                    <th className="p-3">PRICE (KES)</th>
                    <th className="p-3">TAG</th>
                    <th className="p-3">DESCRIPTION</th>
                    <th className="p-3">EVENT DAY BEHAVIOR</th>
                    <th className="p-3 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--brand-navy)]/15 font-medium text-[var(--brand-navy)]">
                  {ticketTiers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-[var(--brand-navy-light)] uppercase font-black tracking-widest">
                        No ticket tiers defined. Add one above.
                      </td>
                    </tr>
                  ) : (
                    ticketTiers.map((t) => (
                      <tr key={t.id} className="hover:bg-[var(--brand-navy)]/5">
                        <td className="p-3">
                          <input 
                            type="checkbox"
                            checked={selectedTierIds.includes(t.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTierIds([...selectedTierIds, t.id]);
                              } else {
                                setSelectedTierIds(selectedTierIds.filter(id => id !== t.id));
                              }
                            }}
                            className="w-3.5 h-3.5 accent-[var(--brand-navy)] cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-mono font-black text-[var(--brand-navy)]">{t.id}</td>
                        <td className="p-3 font-bold uppercase">{t.name}</td>
                        <td className="p-3 font-black text-[var(--brand-navy)]">KES {Number(t.price).toLocaleString()}</td>
                        <td className="p-3 uppercase">
                          <span className="bg-[var(--brand-navy)]/5 text-[var(--brand-navy)] px-2 py-0.5 border border-[var(--brand-navy)]/20 font-black text-[10px]">
                            {t.tag}
                          </span>
                        </td>
                        <td className="p-3 text-[var(--brand-navy)]/60">{t.description}</td>
                        <td className="p-3">
                          {t.hidden && (
                            <span className="bg-red-100 border border-red-300 text-red-900 font-bold px-2 py-0.5 uppercase text-[9px] block w-max mb-0.5">
                              HIDDEN
                            </span>
                          )}
                          {t.show_only_on_event_day && (
                            <span className="bg-[var(--brand-warning-bg)] border border-brand-warning text-brand-warning font-bold px-2 py-0.5 uppercase text-[9px] block w-max">
                              SHOW ON EVENT DAY ONLY
                            </span>
                          )}
                          {t.hide_on_event_day && (
                            <span className="bg-[var(--brand-navy)]/5 border border-[var(--brand-navy)]/20 text-[var(--brand-navy-light)] font-bold px-2 py-0.5 uppercase text-[9px] block w-max">
                              HIDE ON EVENT DAY
                            </span>
                          )}
                          {!t.show_only_on_event_day && !t.hide_on_event_day && !t.hidden && (
                            <span className="bg-blue-100 border border-blue-300 text-blue-900 font-bold px-2 py-0.5 uppercase text-[9px] block w-max">
                              ALWAYS VISIBLE
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleToggleHiddenTier(t)}
                              className={`font-bold text-[11px] uppercase flex items-center gap-0.5 ${t.hidden ? "text-green-600 hover:text-green-800" : "text-brand-warning hover:text-brand-warning"}`}
                            >
                              {t.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} {t.hidden ? "Show" : "Hide"}
                            </button>
                            <button
                              onClick={() => handleEditTierClick(t)}
                              className="text-[var(--brand-navy)] hover:text-[var(--brand-navy-light)] font-bold text-[11px] uppercase flex items-center gap-0.5"
                            >
                              <Edit className="w-3 h-3" /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteTierClick(t.id)}
                              className="text-red-600 hover:text-red-800 font-bold text-[11px] uppercase flex items-center gap-0.5 active:scale-95 transition-all duration-150"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Mobile Card-List View */}
              <div className="md:hidden divide-y divide-[var(--brand-navy)]/15 font-medium text-[var(--brand-navy)]">
                {ticketTiers.length === 0 ? (
                  <div className="p-6 text-center text-[var(--brand-navy-light)] uppercase font-black tracking-widest text-xs">
                    No ticket tiers defined. Add one above.
                  </div>
                ) : (
                  ticketTiers.map((t) => (
                    <div key={t.id} className="p-4 space-y-3 hover:bg-[var(--brand-navy)]/5">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="font-mono font-black text-[var(--brand-navy)] text-sm">{t.id}</span>
                          <span className="font-bold uppercase text-[var(--brand-navy-light)]">{t.name}</span>
                        </div>
                        <span className="font-black text-[var(--brand-navy)] text-sm">KES {Number(t.price).toLocaleString()}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Tag / Badge</span>
                          <span className="bg-[var(--brand-navy)]/5 text-[var(--brand-navy)] px-1.5 py-0.5 border border-[var(--brand-navy)]/20 font-black text-[9px] uppercase inline-block font-sans">
                            {t.tag}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Behavior</span>
                          {t.hidden && (
                            <span className="bg-red-100 border border-red-300 text-red-900 font-bold px-1.5 py-0.5 uppercase text-[9px] inline-block">
                              HIDDEN
                            </span>
                          )}
                          {t.show_only_on_event_day && (
                            <span className="bg-[var(--brand-warning-bg)] border border-brand-warning text-brand-warning font-bold px-1.5 py-0.5 uppercase text-[9px] inline-block">
                              EVENT DAY ONLY
                            </span>
                          )}
                          {t.hide_on_event_day && (
                            <span className="bg-[var(--brand-navy)]/5 border border-[var(--brand-navy)]/20 text-[var(--brand-navy-light)] font-bold px-1.5 py-0.5 uppercase text-[9px] inline-block">
                              HIDE ON EVENT DAY
                            </span>
                          )}
                          {!t.show_only_on_event_day && !t.hide_on_event_day && !t.hidden && (
                            <span className="bg-blue-100 border border-blue-300 text-blue-900 font-bold px-1.5 py-0.5 uppercase text-[9px] inline-block">
                              ALWAYS VISIBLE
                            </span>
                          )}
                        </div>
                        <div className="col-span-2">
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Description</span>
                          <span className="text-[var(--brand-navy)]/60">{t.description}</span>
                        </div>
                      </div>

                      <div className="flex gap-4 pt-2 border-t border-[var(--brand-navy)]/10 justify-end text-xs font-bold">
                        <button
                          onClick={() => handleToggleHiddenTier(t)}
                          className={`uppercase flex items-center gap-0.5 text-[11px] ${t.hidden ? "text-green-600 hover:text-green-800" : "text-brand-warning hover:text-brand-warning"}`}
                        >
                          {t.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} {t.hidden ? "Show" : "Hide"}
                        </button>
                        <button
                          onClick={() => handleEditTierClick(t)}
                          className="text-[var(--brand-navy)] hover:text-[var(--brand-navy-light)] uppercase flex items-center gap-0.5 text-[11px]"
                        >
                          <Edit className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteTierClick(t.id)}
                          className="text-red-600 hover:text-red-800 uppercase flex items-center gap-0.5 text-[11px]"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-3 bg-[var(--brand-bg)]border-t-2 border-[var(--brand-navy)] text-right font-mono text-[10px] text-[var(--brand-navy-light)]">
              Ticket tiers catalog dynamically synced.
            </div>
          </div>
        ) : activeTab === "trash" ? (
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-[6px_6px_0px_0px_var(--brand-navy)]">
            <div className="flex justify-between items-center bg-[var(--brand-navy)] p-3 text-[var(--brand-off-white)]">
              <span className="text-xs font-black tracking-widest uppercase">Trash</span>
              <div className="flex gap-2">
                {(deletedTickets.length > 0 || deletedTiers.length > 0) && (
                  <button 
                    onClick={() => {
                      setTrashActionType("clear_all");
                      setTrashPassword("");
                      setShowTrashPasswordModal(true);
                    }}
                    className="px-2 py-1 border border-red-400 hover:bg-red-600 hover:text-white text-xs font-black uppercase flex items-center gap-1 text-red-400 active:scale-95 transition-all duration-150"
                    title="Permanently empty all trash items"
                  >
                    <Trash2 className="w-3 h-3" /> Empty Trash
                  </button>
                )}
                <button 
                  onClick={loadDeletedItems}
                  className="p-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/10"
                  title="Refresh trash"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Bulk Toolbar for Trash */}
            {(selectedTrashTicketIds.length > 0 || selectedTrashTierIds.length > 0) && (
              <div className="flex flex-wrap items-center gap-3 p-3 bg-[var(--brand-warning-bg)] border-b-2 border-[var(--brand-navy)] text-xs font-black uppercase">
                <span className="text-brand-warning">Selected: {selectedTrashTicketIds.length} tickets, {selectedTrashTierIds.length} tiers</span>
                <button
                  onClick={async () => {
                    if (confirm("Restore all selected items?")) {
                      for (const id of selectedTrashTicketIds) {
                        await fetch(`/api/admin/tickets/${id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ deleted_at: null })
                        });
                      }
                      for (const id of selectedTrashTierIds) {
                        await fetch(`/api/ticket-tiers/${id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ deleted_at: null })
                        });
                      }
                      setSelectedTrashTicketIds([]);
                      setSelectedTrashTierIds([]);
                      loadDeletedItems();
                      loadDashboardMetrics();
                      loadTicketTiers();
                    }
                  }}
                  className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-black uppercase hover:bg-green-700 active:scale-95 transition-all duration-150 cursor-pointer border border-green-700"
                >
                  Bulk Restore
                </button>
                <button
                  onClick={() => {
                    setTrashActionType("delete_selected");
                    setTrashPassword("");
                    setShowTrashPasswordModal(true);
                  }}
                  className="px-2.5 py-1 bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-700 active:scale-95 transition-all duration-150 cursor-pointer border border-red-700"
                >
                  Bulk Permanent Delete
                </button>
                <button
                  onClick={() => {
                    setSelectedTrashTicketIds([]);
                    setSelectedTrashTierIds([]);
                  }}
                  className="px-2.5 py-1 bg-[var(--brand-off-white)] text-[var(--brand-navy-light)] text-[10px] font-black uppercase hover:bg-[var(--brand-navy)]/5 active:scale-95 transition-all duration-150 cursor-pointer border border-[var(--brand-navy)]/20 ml-auto"
                >
                  Deselect All
                </button>
              </div>
            )}

            {/* Deleted Tickets */}
            <div className="p-3 border-b-2 border-[var(--brand-navy)]">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                Deleted Tickets ({deletedTickets.length})
              </h3>
              {loadingTrash ? (
                <div className="text-[10px] text-[var(--brand-navy)]/40 font-mono">Loading...</div>
              ) : deletedTickets.length === 0 ? (
                <div className="text-[10px] text-[var(--brand-navy)]/40 font-mono py-2 italic">No deleted tickets.</div>
              ) : (
                <div className="space-y-2">
                  {deletedTickets.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-red-50 border border-red-200 p-2">
                      <div className="flex items-center gap-2 text-[10px]">
                        <input 
                          type="checkbox"
                          checked={selectedTrashTicketIds.includes(t.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTrashTicketIds([...selectedTrashTicketIds, t.id]);
                            } else {
                              setSelectedTrashTicketIds(selectedTrashTicketIds.filter(id => id !== t.id));
                            }
                          }}
                          className="w-3.5 h-3.5 accent-[var(--brand-navy)] cursor-pointer"
                        />
                        <div>
                          <span className="font-black">{t.id}</span> — {t.ticket_type} — {t.phone_number}
                          <br />
                          <span className="text-[var(--brand-navy-light)]">
                            Deleted: {t.deleted_at ? new Date(t.deleted_at).toLocaleString() : "unknown"}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRestoreTicket(t.id)}
                          className="px-2 py-1 bg-green-600 text-white text-[10px] font-black uppercase hover:bg-green-700 active:scale-95 transition-all duration-150 flex items-center gap-1 cursor-pointer"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => {
                            setTrashActionType("delete_selected");
                            setSelectedTrashTicketIds([t.id]);
                            setSelectedTrashTierIds([]);
                            setTrashPassword("");
                            setShowTrashPasswordModal(true);
                          }}
                          className="px-2 py-1 bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-700 flex items-center gap-1 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Deleted Ticket Tiers */}
            <div className="p-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                Deleted Ticket Tiers ({deletedTiers.length})
              </h3>
              {loadingTrash ? (
                <div className="text-[10px] text-[var(--brand-navy)]/40 font-mono">Loading...</div>
              ) : deletedTiers.length === 0 ? (
                <div className="text-[10px] text-[var(--brand-navy)]/40 font-mono py-2 italic">No deleted ticket tiers.</div>
              ) : (
                <div className="space-y-2">
                  {deletedTiers.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-red-50 border border-red-200 p-2">
                      <div className="flex items-center gap-2 text-[10px]">
                        <input 
                          type="checkbox"
                          checked={selectedTrashTierIds.includes(t.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTrashTierIds([...selectedTrashTierIds, t.id]);
                            } else {
                              setSelectedTrashTierIds(selectedTrashTierIds.filter(id => id !== t.id));
                            }
                          }}
                          className="w-3.5 h-3.5 accent-[var(--brand-navy)] cursor-pointer"
                        />
                        <div>
                          <span className="font-black">{t.name}</span> — KES {Number(t.price).toLocaleString()}
                          <br />
                          <span className="text-[var(--brand-navy-light)]">
                            Deleted: {t.deleted_at ? new Date(t.deleted_at).toLocaleString() : "unknown"}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRestoreTier(t.id)}
                          className="px-2 py-1 bg-green-600 text-white text-[10px] font-black uppercase hover:bg-green-700 active:scale-95 transition-all duration-150 flex items-center gap-1 cursor-pointer"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => {
                            setTrashActionType("delete_selected");
                            setSelectedTrashTicketIds([]);
                            setSelectedTrashTierIds([t.id]);
                            setTrashPassword("");
                            setShowTrashPasswordModal(true);
                          }}
                          className="px-2 py-1 bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-700 flex items-center gap-1 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-[var(--brand-bg)]border-t-2 border-[var(--brand-navy)] text-right font-mono text-[10px] text-[var(--brand-navy-light)]">
              Deleted items can be restored, or permanently cleared with password.
            </div>
          </div>
        ) : activeTab === "paystack" ? (
          <PaystackPanel />
        ) : (
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-[6px_6px_0px_0px_var(--brand-navy)]">
            <div className="flex justify-between items-center bg-[var(--brand-navy)] p-3 text-[var(--brand-off-white)] font-sans">
              <span className="text-xs font-black tracking-widest uppercase">PAYMENT LOGS (Paystack + M-Pesa)</span>
              <div className="flex gap-2">
                <button 
                  onClick={handleExportPayments}
                  className="px-2.5 py-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/10 text-xs font-black uppercase flex items-center gap-1 cursor-pointer bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                  title="Export all logged payments to CSV"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
                <button 
                  onClick={handleClearAllPaymentLogs}
                  className="px-2 py-1 border border-red-400 hover:bg-red-600 hover:text-white text-xs font-black uppercase flex items-center gap-1 text-red-400 active:scale-95 transition-all duration-150"
                  title="Delete all payment log entries"
                >
                  <Trash2 className="w-3 h-3" /> Clear All
                </button>
                <button 
                  onClick={loadPaymentLogs}
                  className="p-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/10"
                  title="Refresh payment logs"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                </button>
              </div>
            </div>

            {selectedPaymentLogIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 p-3 bg-[var(--brand-warning-bg)] border-b-2 border-[var(--brand-navy)] text-xs font-black uppercase font-sans">
                <span className="text-brand-warning">Selected: {selectedPaymentLogIds.length} logs</span>
                <button
                  onClick={async () => {
                    if (confirm("Delete selected payment logs permanently?")) {
                      for (const id of selectedPaymentLogIds) {
                        await fetch(`/api/admin/payment-logs?id=${id}`, { method: "DELETE" });
                      }
                      setSelectedPaymentLogIds([]);
                      loadPaymentLogs();
                    }
                  }}
                  className="px-2.5 py-1 bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-700 active:scale-95 transition-all duration-150 cursor-pointer border border-red-700"
                >
                  Delete Permanently
                </button>
                <button
                  onClick={() => setSelectedPaymentLogIds([])}
                  className="px-2.5 py-1 bg-[var(--brand-off-white)] text-[var(--brand-navy-light)] text-[10px] font-black uppercase hover:bg-[var(--brand-navy)]/5 active:scale-95 transition-all duration-150 cursor-pointer border border-[var(--brand-navy)]/20 ml-auto"
                >
                  Deselect All
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              {/* Desktop Table View */}
              <table className="hidden md:table w-full text-left text-xs min-w-[600px] font-sans">
                <thead>
                    <tr className="border-b-2 border-[var(--brand-navy)] bg-[var(--brand-bg)]uppercase text-[var(--brand-navy)] font-black">
                    <th className="p-3 w-8">
                      <input 
                        type="checkbox"
                        checked={paymentLogs.length > 0 && selectedPaymentLogIds.length === paymentLogs.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPaymentLogIds(paymentLogs.map(log => log.id));
                          } else {
                            setSelectedPaymentLogIds([]);
                          }
                        }}
                        className="w-3.5 h-3.5 accent-[var(--brand-navy)] cursor-pointer"
                      />
                    </th>
                    <th className="p-3">DATE / TIME</th>
                    <th className="p-3">RECEIPT</th>
                    <th className="p-3">PHONE</th>
                    <th className="p-3">AMOUNT</th>
                    <th className="p-3">STATUS</th>
                    <th className="p-3">RESPONSE MESSAGE</th>
                    <th className="p-3 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--brand-navy)]/15 font-medium text-[var(--brand-navy)]">
                  {paymentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-[var(--brand-navy-light)] uppercase font-black tracking-widest">
                        Zero payments logged yet. Webhook callbacks will record here.
                      </td>
                    </tr>
                  ) : (
                    paymentLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[var(--brand-navy)]/5">
                        <td className="p-3">
                          <input 
                            type="checkbox"
                            checked={selectedPaymentLogIds.includes(log.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPaymentLogIds([...selectedPaymentLogIds, log.id]);
                              } else {
                                setSelectedPaymentLogIds(selectedPaymentLogIds.filter(id => id !== log.id));
                              }
                            }}
                            className="w-3.5 h-3.5 accent-[var(--brand-navy)] cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-mono text-[10px] text-[var(--brand-navy)]/60">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="p-3 font-mono font-bold">{log.mpesa_receipt || "PENDING"}</td>
                        <td className="p-3 font-mono">{log.phone_number || "N/A"}</td>
                        <td className="p-3 font-black text-[var(--brand-navy)]">
                          {log.amount ? `KES ${Number(log.amount).toLocaleString()}` : "N/A"}
                        </td>
                        <td className="p-3">
                          {log.status === "success" ? (
                            <span className="bg-green-100 border border-green-300 text-green-900 font-bold px-2 py-0.5 uppercase text-[9px] w-max block">
                              SUCCESS
                            </span>
                          ) : (
                            <span className="bg-red-100 border border-red-300 text-red-900 font-bold px-2 py-0.5 uppercase text-[9px] w-max block">
                              FAILED
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[10px] max-w-xs truncate" title={log.result_desc}>
                          {log.result_desc}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeletePaymentLog(log.id)}
                            className="text-red-600 hover:text-red-800 text-[11px] font-bold uppercase flex items-center gap-0.5 justify-end"
                            title="Delete this payment log entry"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Mobile Card-List View */}
              <div className="md:hidden divide-y divide-[var(--brand-navy)]/15 font-medium text-[var(--brand-navy)]">
                {paymentLogs.length === 0 ? (
                  <div className="p-6 text-center text-[var(--brand-navy-light)] uppercase font-black tracking-widest text-xs">
                    Zero payments logged yet. Webhook callbacks will record here.
                  </div>
                ) : (
                  paymentLogs.map((log) => (
                    <div key={log.id} className="p-4 space-y-3 hover:bg-[var(--brand-navy)]/5">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Receipt</span>
                          <span className="font-mono font-black text-[var(--brand-navy)] text-sm">{log.mpesa_receipt || "PENDING"}</span>
                        </div>
                        <div>
                          {log.status === "success" ? (
                            <span className="bg-green-100 border border-green-300 text-green-950 font-bold px-2 py-0.5 uppercase text-[9px] w-max block">
                              SUCCESS
                            </span>
                          ) : (
                            <span className="bg-red-100 border border-red-300 text-red-950 font-bold px-2 py-0.5 uppercase text-[9px] w-max block">
                              FAILED
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Phone</span>
                          <span className="font-mono">{log.phone_number || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Amount</span>
                          <span className="font-black text-[var(--brand-navy)]">{log.amount ? `KES ${Number(log.amount).toLocaleString()}` : "N/A"}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Date / Time</span>
                          <span className="font-mono text-[var(--brand-navy)]/60">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[10px] text-[var(--brand-navy-light)] uppercase font-bold block">Response Message</span>
                          <span className="font-mono text-[10px] text-[var(--brand-navy)]/60 break-words">{log.result_desc || "No message response"}</span>
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleDeletePaymentLog(log.id)}
                          className="text-red-600 hover:text-red-800 text-[10px] font-bold uppercase flex items-center gap-0.5"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-3 bg-[var(--brand-bg)]border-t-2 border-[var(--brand-navy)] text-right font-mono text-[10px] text-[var(--brand-navy-light)]">
              Audit log of all Paystack + M-Pesa transaction records.
            </div>

            {/* PENDING / ORPHANED PAYMENTS RECONCILIATION */}
            <div className="border-t-4 border-[var(--brand-navy)] mt-0">
              <div className="bg-[var(--brand-warning-bg)] p-3 border-b-2 border-[var(--brand-navy)] flex justify-between items-center">
                <span className="text-xs font-black tracking-widest uppercase text-brand-warning flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> PENDING PAYMENTS ({pendingPayments.length})
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearAllPendingPayments}
                    className="px-2 py-1 border border-red-600/30 hover:bg-red-600 hover:text-white text-xs font-black uppercase flex items-center gap-1 text-red-700 active:scale-95 transition-all duration-150"
                    title="Delete all pending payment records"
                  >
                    <Trash2 className="w-3 h-3" /> Clear All
                  </button>
                  <button
                    onClick={loadPendingPayments}
                    className="p-1 border border-brand-warning/30 hover:bg-[var(--brand-warning-bg)] text-brand-warning"
                    title="Refresh pending payments"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {pendingPayments.length === 0 ? (
                <div className="p-6 text-center text-[var(--brand-navy-light)] uppercase font-black tracking-widest text-xs bg-[var(--brand-off-white)]">
                  No pending payments. All payments have been processed.
                </div>
              ) : (
                <div className="divide-y divide-[var(--brand-navy)]/15 bg-[var(--brand-off-white)]">
                  {pendingPayments.map((pp) => (
                    <div key={pp.checkout_request_id} className="p-4 space-y-2 hover:bg-[var(--brand-warning-bg)]/50">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-mono font-black text-xs text-brand-warning block">{pp.checkout_request_id}</span>
                          <span className="text-[10px] text-[var(--brand-navy-light)]">{pp.buyer_name} · {pp.phone_number}</span>
                        </div>
                        <span className="bg-[var(--brand-warning-bg)] border border-brand-warning text-brand-warning font-bold px-2 py-0.5 uppercase text-[9px]">
                          {pp.status || "PENDING"}
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="font-black">{pp.ticket_type} × {pp.quantity}</span>
                        <span className="font-mono">KES {Number(pp.amount).toLocaleString()}</span>
                        <span className="text-[var(--brand-navy)]/40">{pp.created_at ? new Date(pp.created_at).toLocaleString() : ""}</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => {
                            setResolvingPayment(pp);
                            setResolveReceipt("");
                            setResolveAmount(Number(pp.amount));
                            setResolveMessage("");
                          }}
                          className="text-xs font-black uppercase border-2 border-brand-warning text-brand-warning px-3 py-1 hover:bg-brand-warning hover:text-white active:scale-95 transition-all duration-150"
                        >
                          Resolve & Create Tickets
                        </button>
                        <button
                          onClick={() => handleDeletePendingPayment(pp.checkout_request_id)}
                          className="text-xs font-black uppercase border-2 border-red-300 text-red-600 px-3 py-1 hover:bg-red-600 hover:text-white transition-colors"
                          title="Delete this pending payment record"
                        >
                          <Trash2 className="w-3 h-3 inline-block" /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* EVENT DETAILS EDIT MODAL */}
      {isEditingEvent && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }} className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-lg w-full max-h-[90vh] flex flex-col p-6 relative shadow-[8px_8px_0px_0px_var(--brand-navy)]">
            <button
              autoFocus
              onClick={() => setIsEditingEvent(false)}
              className="absolute top-4 right-4 p-2 hover:bg-[var(--brand-navy)]/10 text-[var(--brand-navy)] z-10 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-4 shrink-0">
              Edit Event Metadata
            </h3>
            <form onSubmit={handleSaveEventDetails} className="space-y-4 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-black uppercase">Event Title</label>
                  <input
                    type="text"
                    required
                    value={eventFormState.title || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, title: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase">Subtitle (Date)</label>
                  <input
                    type="text"
                    required
                    value={eventFormState.subtitle || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, subtitle: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase">Organizer Tag</label>
                  <input
                    type="text"
                    required
                    value={eventFormState.tag || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, tag: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase">Venue Name</label>
                  <input
                    type="text"
                    required
                    value={eventFormState.venue || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, venue: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase">Till Number</label>
                  <input
                    type="text"
                    required
                    value={eventFormState.till_number || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, till_number: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-black uppercase">Flyer Image or Video Path / URL</label>
                  <input
                    type="text"
                    required
                    value={eventFormState.flyer_url || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, flyer_url: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-black uppercase">Scrolling Marquee Text (Ticker)</label>
                  <input
                    type="text"
                    required
                    value={eventFormState.ticker_text || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, ticker_text: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-black uppercase">Custom Logo Image Path / URL (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. /custom-logo.png"
                    value={eventFormState.logo_url || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, logo_url: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2 pt-2 border-t border-[var(--brand-navy)]/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-black uppercase block">Developer Simulators Panel</span>
                      <span className="text-[10px] text-[var(--brand-navy-light)] font-bold uppercase block">Toggle local checkout bypass simulators on homepage</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleSimulators}
                      className={`text-xs font-black px-4 py-2 border-2 uppercase transition-all cursor-pointer ${
                        eventFormState.simulators_enabled !== false
                          ? "bg-green-600 border-green-600 text-white"
                          : "bg-red-600 border-red-600 text-white"
                      }`}
                    >
                      {eventFormState.simulators_enabled !== false ? "ENABLED" : "DISABLED"}
                    </button>
                  </div>
                </div>
                <div className="space-y-1 col-span-2 pt-2 border-t border-[var(--brand-navy)]/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-black uppercase block">Operator WhatsApp Notifications</span>
                      <span className="text-[10px] text-[var(--brand-navy-light)] font-bold uppercase block">Enable or disable operator broadcast alerts</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEventFormState({
                        ...eventFormState,
                        operator_notifications_enabled: !eventFormState.operator_notifications_enabled
                      })}
                      className={`text-xs font-black px-4 py-2 border-2 uppercase transition-all cursor-pointer ${
                        eventFormState.operator_notifications_enabled !== false
                          ? "bg-green-600 border-green-600 text-white"
                          : "bg-red-600 border-red-600 text-white"
                      }`}
                    >
                      {eventFormState.operator_notifications_enabled !== false ? "ENABLED" : "DISABLED"}
                    </button>
                  </div>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-black uppercase">Regulations & Advisories</label>
                  <textarea
                    required
                    rows={4}
                    value={eventFormState.regulations || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, regulations: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase">Footer Title</label>
                  <input
                    type="text"
                    value={eventFormState.footer_title || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, footer_title: e.target.value })}
                    placeholder="e.g. GOODLIFE TICKETING"
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase">Footer Legal Line</label>
                  <input
                    type="text"
                    value={eventFormState.footer_legal || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, footer_legal: e.target.value })}
                    placeholder="e.g. STRICTLY 18+ NO OUTSIDE DRINKS"
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2 pt-2 border-t border-[var(--brand-navy)]/10">
                  <label className="text-xs font-black uppercase flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0z"/></svg>
                    WhatsApp Message Template (optional)
                  </label>
                  <p className="text-[9px] text-[var(--brand-navy-light)] font-bold uppercase leading-tight">
                    Available variables: <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{ticketId}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{buyerName}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{phoneNumber}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{pdfUrl}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{eventTitle}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{eventSubtitle}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{eventVenue}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{eventRegulations}}'}</code>
                  </p>
                  <textarea
                    rows={4}
                    value={eventFormState.whatsapp_message || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, whatsapp_message: e.target.value })}
                    placeholder="Leave empty to use the default template."
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2 pt-2 border-t border-[var(--brand-navy)]/10">
                  <label className="text-xs font-black uppercase flex items-center gap-2">
                    Operator WhatsApp Template (optional)
                  </label>
                  <p className="text-[9px] text-[var(--brand-navy-light)] font-bold uppercase leading-tight">
                    Available variables: <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{buyerName}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{ticketType}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{quantity}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{amountPaid}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{reference}}'}</code>
                  </p>
                  <textarea
                    rows={3}
                    value={eventFormState.whatsapp_operator_template || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, whatsapp_operator_template: e.target.value })}
                    placeholder="Leave empty to use the default operator template."
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2 pt-2 border-t border-[var(--brand-navy)]/10">
                  <label className="text-xs font-black uppercase flex items-center gap-2">
                    Scan Notification Template (optional)
                  </label>
                  <p className="text-[9px] text-[var(--brand-navy-light)] font-bold uppercase leading-tight">
                    Available variables: <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{buyerName}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{ticketType}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{ticketId}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{scannerName}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[9px]">{'{{scanTime}}'}</code>
                  </p>
                  <textarea
                    rows={3}
                    value={eventFormState.whatsapp_scan_template || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, whatsapp_scan_template: e.target.value })}
                    placeholder="Leave empty to use the default scan template."
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--brand-navy)]/15 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditingEvent(false)}
                  className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* TICKET EDIT MODAL */}
      {editingTicket && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }} className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-md w-full p-6 relative shadow-[8px_8px_0px_0px_var(--brand-navy)]">
            <button
              onClick={() => setEditingTicket(null)}
              className="absolute top-4 right-4 p-1 hover:bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]"
            >
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-4">
              Edit Ticket Details
            </h3>
            <form onSubmit={handleSaveTicket} className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-black uppercase block mb-1">Ticket ID (Primary Key)</label>
                  <input
                    type="text"
                    disabled
                    value={editingTicket.id}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)]/20 bg-[var(--brand-bg)] font-mono text-xs text-[var(--brand-navy-light)] cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase block mb-1">M-Pesa Receipt Code</label>
                  <input
                    type="text"
                    required
                    value={ticketFormState.mpesa_receipt || ""}
                    onChange={(e) => setTicketFormState({ ...ticketFormState, mpesa_receipt: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase block mb-1">Attendee / Buyer Name</label>
                  <input
                    type="text"
                    required
                    value={ticketFormState.buyer_name || ""}
                    onChange={(e) => setTicketFormState({ ...ticketFormState, buyer_name: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase block mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={ticketFormState.phone_number || ""}
                    onChange={(e) => setTicketFormState({ ...ticketFormState, phone_number: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase block mb-1">Alt WhatsApp Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. +254..."
                    value={ticketFormState.whatsapp_number || ""}
                    onChange={(e) => setTicketFormState({ ...ticketFormState, whatsapp_number: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs font-bold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black uppercase block mb-1">Ticket Tier Type</label>
                    <select
                      value={ticketFormState.ticket_type || ""}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const tier = ticketTiers.find(t => t.id === selectedId);
                        setTicketFormState({
                          ...ticketFormState,
                          ticket_type: selectedId,
                          amount_paid: tier ? tier.price : 0
                        });
                      }}
                      className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                    >
                      <option value="" disabled>Select a tier</option>
                      {ticketTiers.map(t => (
                        <option key={t.id} value={t.id}>{t.name} (KES {t.price})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase block mb-1">Amount Paid (KES)</label>
                    <input
                      type="number"
                      required
                      value={ticketFormState.amount_paid || 0}
                      onChange={(e) => setTicketFormState({ ...ticketFormState, amount_paid: Number(e.target.value) })}
                      className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="is_scanned_check"
                    checked={!!ticketFormState.is_scanned}
                    onChange={(e) => setTicketFormState({ 
                      ...ticketFormState, 
                      is_scanned: e.target.checked,
                      scanned_at: e.target.checked ? (ticketFormState.scanned_at || new Date().toISOString()) : null,
                      scanned_by: e.target.checked ? (ticketFormState.scanned_by || "Admin Overwatch") : null
                    })}
                    className="w-4 h-4 accent-[var(--brand-navy)] border-2 border-[var(--brand-navy)]"
                  />
                  <label htmlFor="is_scanned_check" className="text-xs font-black uppercase select-none">
                    Mark Ticket as Scanned (Used)
                  </label>
                </div>
                {ticketFormState.is_scanned && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-xs font-black uppercase block mb-1">Scanned By</label>
                      <input
                        type="text"
                        value={ticketFormState.scanned_by || ""}
                        onChange={(e) => setTicketFormState({ ...ticketFormState, scanned_by: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black uppercase block mb-1">Scanned At</label>
                      <input
                        type="text"
                        disabled
                        value={ticketFormState.scanned_at ? new Date(ticketFormState.scanned_at).toLocaleString() : ""}
                        className="w-full px-3 py-2 border-2 border-[var(--brand-navy)]/20 bg-[var(--brand-bg)] font-mono text-xs text-[var(--brand-navy-light)] cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--brand-navy)]/15">
                <button
                  type="button"
                  onClick={() => setEditingTicket(null)}
                  className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* CREATE MANUAL TICKET MODAL */}
      {isCreatingTicket && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-md w-full p-6 relative shadow-[8px_8px_0px_0px_var(--brand-navy)]">
            <button 
              onClick={() => setIsCreatingTicket(false)}
              className="absolute top-4 right-4 p-1 hover:bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]"
            >
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-4">
              Create Manual Ticket
            </h3>
            <form onSubmit={handleSaveCreateTicket} className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-black uppercase block mb-1">Ticket ID (Optional / Auto-Gen)</label>
                  <input
                    type="text"
                    required
                    value={ticketFormState.id || ""}
                    onChange={(e) => setTicketFormState({ ...ticketFormState, id: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase block mb-1">M-Pesa Receipt Code</label>
                  <input
                    type="text"
                    required
                    value={ticketFormState.mpesa_receipt || ""}
                    onChange={(e) => setTicketFormState({ ...ticketFormState, mpesa_receipt: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase block mb-1">Attendee / Buyer Name</label>
                  <input
                    type="text"
                    required
                    value={ticketFormState.buyer_name || ""}
                    onChange={(e) => setTicketFormState({ ...ticketFormState, buyer_name: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase block mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={ticketFormState.phone_number || ""}
                    onChange={(e) => setTicketFormState({ ...ticketFormState, phone_number: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase block mb-1">Alt WhatsApp Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. +254..."
                    value={ticketFormState.whatsapp_number || ""}
                    onChange={(e) => setTicketFormState({ ...ticketFormState, whatsapp_number: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs font-bold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-black uppercase block mb-1">Ticket Tier Type</label>
                    <select
                      value={ticketFormState.ticket_type || ""}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const tier = ticketTiers.find(t => t.id === selectedId);
                        setTicketFormState({ 
                          ...ticketFormState, 
                          ticket_type: selectedId,
                          amount_paid: tier ? tier.price : 0
                        });
                      }}
                      className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                    >
                      <option value="" disabled>Select a tier</option>
                      {ticketTiers.map(t => (
                        <option key={t.id} value={t.id}>{t.name} (KES {t.price})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase block mb-1">Amount Paid (KES)</label>
                    <input
                      type="number"
                      required
                      value={ticketFormState.amount_paid || 0}
                      onChange={(e) => setTicketFormState({ ...ticketFormState, amount_paid: Number(e.target.value) })}
                      className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                    />
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={(e) => setSendWhatsApp(e.target.checked)}
                  className="w-4 h-4 accent-[var(--brand-navy)]"
                />
                <span className="text-xs font-black uppercase">Send ticket via WhatsApp</span>
              </label>
              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--brand-navy)]/15">
                <button
                  type="button"
                  onClick={() => setIsCreatingTicket(false)}
                  className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" /> Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* CREATE TICKET TIER MODAL */}
      {isCreatingTier && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-lg w-full p-6 relative shadow-[8px_8px_0px_0px_var(--brand-navy)]">
            <button
              onClick={() => setIsCreatingTier(false)}
              className="absolute top-4 right-4 p-1 hover:bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]"
            >
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-1">
              Add Ticket Tier
            </h3>
            <p className="text-[10px] text-[var(--brand-navy-light)] font-bold uppercase mb-4">
              Gate tiers are shown only on the day of the event. Advance tiers are hidden on event day.
            </p>
            <form onSubmit={handleSaveCreateTier} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase block">Tier ID (Unique Key)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ADV 500"
                    value={tierFormState.id || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, id: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase block">Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Advance 500"
                    value={tierFormState.name || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase block">Price (KES)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={tierFormState.price || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, price: Number(e.target.value) })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase block">Tag / Badge Label</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ADVANCE"
                    value={tierFormState.tag || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, tag: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-black uppercase block">Description</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Advance entry ticket"
                    value={tierFormState.description || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, description: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
              </div>

              {/* Event Day Behavior */}
              <div className="border-2 border-[var(--brand-navy)]/30 p-3 space-y-2 bg-[var(--brand-bg)]">
                <span className="text-[10px] font-black uppercase text-[var(--brand-navy)] tracking-widest block mb-2">
                  Event Day Behaviour
                </span>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!tierFormState.show_only_on_event_day}
                    onChange={(e) => setTierFormState({
                      ...tierFormState,
                      show_only_on_event_day: e.target.checked,
                      hide_on_event_day: e.target.checked ? false : tierFormState.hide_on_event_day
                    })}
                    className="mt-0.5 w-4 h-4 accent-brand-warning"
                  />
                  <span className="text-xs font-bold">
                    <span className="text-brand-warning font-black">GATE TIER</span> — Show ONLY on event day (day-of-gate pricing)
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!tierFormState.hide_on_event_day}
                    onChange={(e) => setTierFormState({
                      ...tierFormState,
                      hide_on_event_day: e.target.checked,
                      show_only_on_event_day: e.target.checked ? false : tierFormState.show_only_on_event_day
                    })}
                    className="mt-0.5 w-4 h-4 accent-[var(--brand-navy)]"
                  />
                  <span className="text-xs font-bold">
                    <span className="text-[var(--brand-navy)] font-black">ADVANCE TIER</span> — Hide on event day (pre-sale only)
                  </span>
                </label>
                <p className="text-[9px] text-[var(--brand-navy)]/40 font-medium pt-1">
                  Leave both unchecked = always visible on checkout.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--brand-navy)]/15">
                <button
                  type="button"
                  onClick={() => setIsCreatingTier(false)}
                  className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Tier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TICKET TIER MODAL */}
      {editingTier && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-lg w-full p-6 relative shadow-[8px_8px_0px_0px_var(--brand-navy)]">
            <button
              onClick={() => setEditingTier(null)}
              className="absolute top-4 right-4 p-1 hover:bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]"
            >
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-1">
              Edit Ticket Tier
            </h3>
            <p className="text-[10px] text-[var(--brand-navy-light)] font-bold uppercase mb-4">
              Editing: <span className="text-[var(--brand-navy)]">{editingTier.id}</span>
            </p>
            <form onSubmit={handleSaveTier} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase block">Tier ID</label>
                  <input
                    type="text"
                    disabled
                    value={editingTier.id}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)]/20 bg-[var(--brand-bg)] font-mono text-xs text-[var(--brand-navy-light)] cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase block">Display Name</label>
                  <input
                    type="text"
                    required
                    value={tierFormState.name || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase block">Price (KES)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={tierFormState.price || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, price: Number(e.target.value) })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase block">Tag / Badge Label</label>
                  <input
                    type="text"
                    required
                    value={tierFormState.tag || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, tag: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-black uppercase block">Description</label>
                  <input
                    type="text"
                    required
                    value={tierFormState.description || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, description: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                  />
                </div>
              </div>

              {/* Event Day Behavior */}
              <div className="border-2 border-[var(--brand-navy)]/30 p-3 space-y-2 bg-[var(--brand-bg)]">
                <span className="text-[10px] font-black uppercase text-[var(--brand-navy)] tracking-widest block mb-2">
                  Event Day Behaviour (Gate Tier Settings)
                </span>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!tierFormState.show_only_on_event_day}
                    onChange={(e) => setTierFormState({
                      ...tierFormState,
                      show_only_on_event_day: e.target.checked,
                      hide_on_event_day: e.target.checked ? false : tierFormState.hide_on_event_day
                    })}
                    className="mt-0.5 w-4 h-4 accent-brand-warning"
                  />
                  <span className="text-xs font-bold">
                    <span className="text-brand-warning font-black">GATE TIER</span> — Show ONLY on event day (day-of-gate pricing)
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!tierFormState.hide_on_event_day}
                    onChange={(e) => setTierFormState({
                      ...tierFormState,
                      hide_on_event_day: e.target.checked,
                      show_only_on_event_day: e.target.checked ? false : tierFormState.show_only_on_event_day
                    })}
                    className="mt-0.5 w-4 h-4 accent-[var(--brand-navy)]"
                  />
                  <span className="text-xs font-bold">
                    <span className="text-[var(--brand-navy)] font-black">ADVANCE TIER</span> — Hide on event day (pre-sale only)
                  </span>
                </label>
                <p className="text-[9px] text-[var(--brand-navy)]/40 font-medium pt-1">
                  Leave both unchecked = always visible on checkout.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--brand-navy)]/15">
                <button
                  type="button"
                  onClick={() => setEditingTier(null)}
                  className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE TICKET CONFIRM MODAL */}
      {deletingTicketId && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-red-650 bg-[var(--brand-off-white)] max-w-sm w-full p-6 relative shadow-[8px_8px_0px_0px_#FF3300]">
            <h3 className="text-lg font-black uppercase text-red-600 border-b-2 border-red-200 pb-2 mb-4 font-display">
              Send to Trash
            </h3>
            <p className="text-xs font-bold text-[var(--brand-navy)] mb-6 uppercase">
              Are you sure you want to send ticket <span className="font-mono text-red-600 font-black">{deletingTicketId}</span> to the Trash? You can restore it later.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingTicketId(null)}
                className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95 bg-[var(--brand-off-white)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTicket}
                className="px-4 py-2 bg-red-600 text-white border-2 border-red-600 text-xs font-black uppercase cursor-pointer hover:bg-red-700 transition-colors"
              >
                Send to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESOLVE PENDING PAYMENT MODAL */}
      {resolvingPayment && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-brand-warning bg-[var(--brand-off-white)] max-w-md w-full p-6 relative shadow-[8px_8px_0px_0px_#D97706]">
            <button
              onClick={() => setResolvingPayment(null)}
              className="absolute top-4 right-4 p-1 hover:bg-[var(--brand-warning-bg)] text-brand-warning z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-black uppercase text-brand-warning border-b-2 border-brand-warning pb-2 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Resolve Orphaned Payment
            </h3>

            <div className="space-y-3 text-sm mb-4">
              <div className="bg-[var(--brand-warning-bg)] p-3 border border-brand-warning space-y-1">
                <p><span className="font-bold uppercase text-[10px] text-[var(--brand-navy-light)]">Checkout ID</span><br /><span className="font-mono text-xs">{resolvingPayment.checkout_request_id}</span></p>
                <p><span className="font-bold uppercase text-[10px] text-[var(--brand-navy-light)]">Buyer</span><br /><span className="font-black">{resolvingPayment.buyer_name} · {resolvingPayment.phone_number}</span></p>
                <p><span className="font-bold uppercase text-[10px] text-[var(--brand-navy-light)]">Tickets</span><br /><span>{resolvingPayment.ticket_type} × {resolvingPayment.quantity} = KES {Number(resolvingPayment.amount).toLocaleString()}</span></p>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase text-[var(--brand-navy)]/60">M-Pesa Receipt Code</label>
                <input
                  type="text"
                  value={resolveReceipt}
                  onChange={(e) => setResolveReceipt(e.target.value.toUpperCase())}
                  placeholder="e.g. PGI1ABC2D3"
                  className="w-full border-2 border-[var(--brand-navy)] px-3 py-2 font-mono text-sm bg-[var(--brand-off-white)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase text-[var(--brand-navy)]/60">Amount Paid (KES)</label>
                <input
                  type="number"
                  value={resolveAmount}
                  onChange={(e) => setResolveAmount(Number(e.target.value))}
                  className="w-full border-2 border-[var(--brand-navy)] px-3 py-2 font-mono text-sm bg-[var(--brand-off-white)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {resolveMessage && (
                <div className={resolveMessage.startsWith("SUCCESS") ? "bg-green-100 border border-green-300 text-green-900 p-3 font-mono text-xs" : "bg-red-100 border border-red-300 text-red-900 p-3 font-mono text-xs"}>
                  {resolveMessage}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResolvingPayment(null)}
                className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95 bg-[var(--brand-off-white)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleResolvePayment}
                disabled={!resolveReceipt || resolveAmount <= 0}
                className="px-4 py-2 bg-brand-warning text-white border-2 border-brand-warning text-xs font-black uppercase cursor-pointer hover:bg-brand-warning transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE TIER CONFIRM MODAL */}
      {deletingTierId && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-red-650 bg-[var(--brand-off-white)] max-w-sm w-full p-6 relative shadow-[8px_8px_0px_0px_#FF3300]">
            <h3 className="text-lg font-black uppercase text-red-600 border-b-2 border-red-200 pb-2 mb-4 font-display">
              Send to Trash
            </h3>
            <p className="text-xs font-bold text-[var(--brand-navy)] mb-6 uppercase">
              Are you sure you want to send ticket tier <span className="font-mono text-red-600 font-black">{deletingTierId}</span> to the Trash? You can restore it later.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingTierId(null)}
                className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95 bg-[var(--brand-off-white)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTier}
                className="px-4 py-2 bg-red-600 text-white border-2 border-red-600 text-xs font-black uppercase cursor-pointer hover:bg-red-700 transition-colors"
              >
                Send to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRASH PASSWORD CONFIRMATION MODAL */}
      {showTrashPasswordModal && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-red-650 bg-[var(--brand-off-white)] max-w-sm w-full p-6 relative shadow-[8px_8px_0px_0px_#FF3300]">
            <button
              onClick={() => setShowTrashPasswordModal(false)}
              className="absolute top-4 right-4 p-1 hover:bg-red-50 text-red-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-black uppercase text-red-600 border-b-2 border-red-200 pb-2 mb-4 font-display">
              Trash Authorization Required
            </h3>
            <form onSubmit={handleTrashPasswordSubmit} className="space-y-4">
              <p className="text-xs font-bold text-[var(--brand-navy)] uppercase">
                {trashActionType === "clear_all" 
                  ? "Are you sure you want to permanently empty the trash? All deleted items will be lost forever."
                  : "Are you sure you want to permanently delete the selected items? This action cannot be undone."
                }
              </p>
              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--brand-navy)]/60 mb-1">Admin Password</label>
                <input
                  type="password"
                  required
                  value={trashPassword}
                  onChange={(e) => setTrashPassword(e.target.value)}
                  placeholder="Enter GoodlifeAdmin2026!"
                  className="w-full border-2 border-[var(--brand-navy)] px-3 py-2 font-mono text-sm bg-[var(--brand-off-white)] focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTrashPasswordModal(false)}
                  className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95 bg-[var(--brand-off-white)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white border-2 border-red-600 text-xs font-black uppercase cursor-pointer hover:bg-red-700 transition-colors"
                >
                  Confirm Delete
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESEND WHATSAPP MODAL */}
      {resendTicket && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === "Escape") setResendTicket(null); }}>
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-sm w-full p-6 relative shadow-[8px_8px_0px_0px_var(--brand-navy)]">
            <h3 className="text-lg font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-700" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0z"/></svg>
              Resend WhatsApp Ticket
            </h3>
            <p className="text-[10px] text-[var(--brand-navy-light)] font-bold uppercase mb-3">
              Ticket: <span className="font-mono text-[var(--brand-navy)]">{resendTicket.id}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase block mb-1">Phone Number</label>
                <input
                  type="text"
                  value={resendPhone}
                  onChange={(e) => setResendPhone(e.target.value)}
                  placeholder="2547XXXXXXXX"
                  className="w-full border-2 border-[var(--brand-navy)] px-3 py-2 font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setResendTicket(null)}
                  className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResendWhatsApp}
                  disabled={!resendPhone}
                  className="px-4 py-2 bg-green-700 text-white border-2 border-green-700 text-xs font-black uppercase transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0z"/></svg>
                  Resend
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto text-center mt-12 mb-8 text-[10px] text-[var(--brand-navy-light)] font-bold tracking-widest uppercase">
        © {new Date().getFullYear()} {(eventDetails?.title || "GOODLIFE").toUpperCase()} MASTER ADMIN · SECURED TRANSACTION CHANNELS
      </div>

    </div>
  );
}

function PaystackPanel() {
  const [failedTxs, setFailedTxs] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loadingPaystack, setLoadingPaystack] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/paystack/transactions?status=failed&perPage=10").then(async r => r.ok ? r.json() : { status: false, data: [] }),
      fetch("/api/admin/paystack/totals").then(async r => r.ok ? r.json() : { status: false, data: null }),
      fetch("/api/admin/paystack/settlements?perPage=5").then(async r => r.ok ? r.json() : { status: false, data: [] }),
    ]).then(([txRes, totalsRes, settleRes]) => {
      if (txRes.status) setFailedTxs(txRes.data || []);
      if (totalsRes.status) setTotals(totalsRes.data);
      if (settleRes.status) setSettlements(settleRes.data || []);
    }).catch(() => {}).finally(() => setLoadingPaystack(false));
  }, []);

  if (loadingPaystack) {
    return (
      <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-[6px_6px_0px_0px_var(--brand-navy)] p-8 text-center">
        <p className="text-xs font-black tracking-widest uppercase text-[var(--brand-navy-light)]">Loading Paystack data...</p>
      </div>
    );
  }

  return (
    <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-[6px_6px_0px_0px_var(--brand-navy)]">
      <div className="flex justify-between items-center bg-[var(--brand-navy)] p-3 text-[var(--brand-off-white)]">
        <span className="text-xs font-black tracking-widest uppercase flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Paystack Overview
        </span>
        <button
          onClick={() => {
            setLoadingPaystack(true);
            Promise.all([
              fetch("/api/admin/paystack/transactions?status=failed&perPage=10").then(async r => r.ok ? r.json() : { status: false, data: [] }),
              fetch("/api/admin/paystack/totals").then(async r => r.ok ? r.json() : { status: false, data: null }),
              fetch("/api/admin/paystack/settlements?perPage=5").then(async r => r.ok ? r.json() : { status: false, data: [] }),
            ]).then(([txRes, totalsRes, settleRes]) => {
              if (txRes.status) setFailedTxs(txRes.data || []);
              if (totalsRes.status) setTotals(totalsRes.data);
              if (settleRes.status) setSettlements(settleRes.data || []);
            }).catch(() => {}).finally(() => setLoadingPaystack(false));
          }}
          className="p-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/20 active:scale-95 transition-all duration-150"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Totals Summary */}
        {totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border-2 border-[var(--brand-navy)] p-3 bg-[var(--brand-bg)]">
              <span className="text-[10px] font-black uppercase text-[var(--brand-navy-light)] block">Total Volume</span>
              <span className="text-lg font-black block">KES {(totals.total_volume / 100).toLocaleString()}</span>
            </div>
            <div className="border-2 border-[var(--brand-navy)] p-3 bg-[var(--brand-bg)]">
              <span className="text-[10px] font-black uppercase text-[var(--brand-navy-light)] block">Transactions</span>
              <span className="text-lg font-black block">{totals.total_transactions}</span>
            </div>
            <div className="border-2 border-[var(--brand-navy)] p-3 bg-[var(--brand-bg)]">
              <span className="text-[10px] font-black uppercase text-[var(--brand-navy-light)] block">Pending Transfers</span>
              <span className="text-lg font-black block">KES {(totals.pending_transfers / 100).toLocaleString()}</span>
            </div>
            <div className="border-2 border-[var(--brand-navy)] p-3 bg-[var(--brand-bg)]">
              <span className="text-[10px] font-black uppercase text-[var(--brand-navy-light)] block">Unique Customers</span>
              <span className="text-lg font-black block">{totals.unique_customers}</span>
            </div>
          </div>
        )}

        {/* Failed Transactions */}
        <div>
          <span className="text-[10px] font-black uppercase text-[var(--brand-navy)] flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-brand-danger" /> Failed Transactions (last 10)
          </span>
          {failedTxs.length === 0 ? (
            <p className="text-[10px] font-mono text-[var(--brand-navy-light)] italic">No failed transactions.</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {failedTxs.map((tx: any) => (
                <div key={tx.id} className="flex justify-between items-center p-2 bg-red-50 border border-red-200 text-[10px]">
                  <div className="font-mono">
                    <span className="font-black block">{tx.reference}</span>
                    <span className="text-red-700">{tx.customer?.email || "—"} · {tx.amount ? `KES ${(tx.amount / 100).toLocaleString()}` : ""}</span>
                  </div>
                  <span className="text-[8px] font-black uppercase text-red-700">{tx.paid_at ? new Date(tx.paid_at).toLocaleDateString() : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settlements */}
        <div>
          <span className="text-[10px] font-black uppercase text-[var(--brand-navy)] flex items-center gap-1.5 mb-2">
            <Wallet className="w-3.5 h-3.5" /> Settlements (last 5)
          </span>
          {settlements.length === 0 ? (
            <p className="text-[10px] font-mono text-[var(--brand-navy-light)] italic">No settlements yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {settlements.map((s: any) => (
                <div key={s.id} className="flex justify-between items-center p-2 border border-[var(--brand-navy)]/10 text-[10px]">
                  <div className="font-mono">
                    <span className="font-black block">
                      KES {(s.amount / 100).toLocaleString()} ({s.transactions_count} txns)
                    </span>
                    <span className="text-[var(--brand-navy-light)]">
                      Fees: KES {(s.total_fees / 100).toLocaleString()} · Status: {s.status}
                    </span>
                  </div>
                  <span className="text-[8px] font-black uppercase">
                    {s.settled_date ? new Date(s.settled_date).toLocaleDateString() : "Unsettled"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-3 bg-[var(--brand-bg)] border-t-2 border-[var(--brand-navy)] text-right font-mono text-[10px] text-[var(--brand-navy-light)]">
        Data from Paystack API. Totals are gross (pre-fees).
      </div>
    </div>
  );
}
