"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { fmtDate, fmtTime } from "@/lib/utils";
import {
  fetchDashboardMetrics, 
  fetchActiveEvent,
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
  TicketTier,
  TicketAudience,
  NormalizedTicket
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
  ListChecks,
  Flame,
  Store,
  Receipt,
  Users,
  ExternalLink
} from "lucide-react";
import Link from "next/link";
import BoxOfficeMetrics from "@/components/admin/BoxOfficeMetrics";
import TierSalesBreakdown from "@/components/admin/TierSalesBreakdown";
import EventSelector from "@/components/EventSelector";

/**
 * Two sales of the same tier on the same phone further apart than this are
 * treated as two real purchases. Tuned against the actual ledger: the genuine
 * doubles were 4 and 13 minutes apart; the same-phone-but-separate-purchase
 * case was 2 hours.
 */
const DUPLICATE_WINDOW_MIN = 60;

/** Kenyan numbers are stored inconsistently (with/without +, leading 0, spaces). */
function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // 0712345678 and 254712345678 are the same subscriber.
  return digits.startsWith("0") ? `254${digits.slice(1)}` : digits;
}

interface MetricsState {
  totalCashCollected: number;
  totalTicketsSold: number;
  scanCount: number;
  campingTiers: Record<string, {
    sold: number;
    revenue: number;
    cap?: number;
    name?: string;
    tag?: string;
    minPaid?: number;
    maxPaid?: number;
  }>;
  recentSalesAmount: number;
  tickets: NormalizedTicket[];
  staffPasses: number;
  eventLabels: Record<string, string>;
  /** event_id -> "YYYY-MM-DD", or null when the event has no date set. */
  eventDates: Record<string, string | null>;
}

const AUDIENCE_OPTIONS: { value: TicketAudience; label: string }[] = [
  { value: "customers", label: "CUSTOMERS" },
  { value: "staff", label: "STAFF" },
  { value: "all", label: "ALL" }
];

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<MetricsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  // null = all events, number = specific event. Starts unresolved: the mount
  // effect decides from ?event= first, and only then falls back to the active
  // event. Never defaults to a hardcoded id.
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [eventResolved, setEventResolved] = useState(false);
  const selectedEventIdRef = React.useRef<number | null>(null);
  const [audience, setAudience] = useState<TicketAudience>("customers");
  const audienceRef = React.useRef<TicketAudience>("customers");
  const [saving, setSaving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ledger" | "tiers" | "payment-requests" | "payments" | "waitlist" | "trash">("ledger");
  const [ledgerTab, setLedgerTab] = useState<"all" | "active" | "scanned">("all");

  // Early-bird waitlist states
  const [waitlistEntries, setWaitlistEntries] = useState<any[]>([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<any>(null);

  // Event details editing states
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [eventFormState, setEventFormState] = useState<Partial<EventDetails>>({});

  // Ticket editing states
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [ticketFormState, setTicketFormState] = useState<Partial<Ticket>>({});
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [isCrewPass, setIsCrewPass] = useState(false);

  // Ticket Tier editing states
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([]);
  const [editingTier, setEditingTier] = useState<TicketTier | null>(null);
  const [isCreatingTier, setIsCreatingTier] = useState(false);
  const [tierFormState, setTierFormState] = useState<Partial<TicketTier>>({});

  // Payment Logs states
  const [paymentLogs, setPaymentLogs] = useState<any[]>([]);

  // Tickets CSV export filter states
  const [typeFilter, setTypeFilter] = useState("");
  const [exportTicketStatusFilter, setExportTicketStatusFilter] = useState<"all" | "active" | "scanned">("all");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  
  // Pending Payments (orphaned) states
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [resolvingPayment, setResolvingPayment] = useState<any>(null);
  const [resolveReceipt, setResolveReceipt] = useState("");
  const [resolveAmount, setResolveAmount] = useState(0);
  const [resolveMessage, setResolveMessage] = useState("");

  // Till payment requests state
  const [tillPayments, setTillPayments] = useState<any[]>([]);
  const [approvingPayment, setApprovingPayment] = useState<string | null>(null);

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

  const getDefaultWhatsAppTemplate = () => `*{{eventTitle}} TICKET CONFIRMED*\n\nTicket ID: {{ticketId}}\nAttendee: {{buyerName}}\nPhone: {{phoneNumber}}\nEvent: {{eventTitle}} {{eventSubtitle}}\nVenue: {{eventVenue}}\n📍 Directions: {{eventMapsUrl}}\n\nDownload the ticket PDF here: {{pdfUrl}}\n\nREGULATIONS:\n{{eventRegulations}}`;
  const getDefaultOperatorTemplate = () => `*NEW TICKET SECURED*\n\nBuyer: {{buyerName}}\nTicket Type: {{ticketType}} (Qty: {{quantity}})\nAmount Paid: KES {{amountPaid}}\nReference/ID: {{reference}}`;
  const getDefaultScanTemplate = () => `*{{eventTitle}} GATE ENTRY VALIDATED*\n\nTicket ID: {{ticketId}}\nAttendee: {{buyerName}}\nTicket Type: {{ticketType}}\nScanned By: {{scannerName}}\nTime: {{scanTime}}`;
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

  const loadDashboardMetrics = async (eventId?: number | null, nextAudience?: TicketAudience) => {
    setLoading(true);
    try {
      const targetId = eventId !== undefined ? eventId : selectedEventIdRef.current;
      const targetAudience = nextAudience ?? audienceRef.current;
      // null = "All Events", mapped to -1 for the API
      const queryId = targetId === null ? -1 : targetId;
      const data = await fetchDashboardMetrics(queryId, targetAudience);
      setMetrics(data);
      setMetricsError(null);
    } catch (err: any) {
      // Previously this was a bare console.error, which left the PREVIOUS
      // event's rows on screen under the newly selected event's label.
      console.error("Failed to load metrics:", err);
      setMetricsError(err?.message || "Could not load dashboard metrics.");
    } finally {
      setLoading(false);
    }
  };

  // Keep the address bar truthful about which event is being viewed.
  const syncEventToUrl = (eventId: number | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (eventId === null) url.searchParams.set("event", "all");
    else url.searchParams.set("event", String(eventId));
    window.history.replaceState(null, "", url.toString());
  };

  const handleEventSelect = (eventId: number | null) => {
    setSelectedEventId(eventId);
    selectedEventIdRef.current = eventId;
    syncEventToUrl(eventId);
    loadDashboardMetrics(eventId);
    loadTicketTiers(eventId && eventId > 0 ? eventId : undefined);
    loadWaitlist(eventId && eventId > 0 ? eventId : undefined);
  };

  const handleAudienceSelect = (next: TicketAudience) => {
    setAudience(next);
    audienceRef.current = next;
    loadDashboardMetrics(undefined, next);
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
        payment_contact: details.payment_contact || "",
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

  const loadTicketTiers = async (eventId?: number) => {
    try {
      const tiers = await fetchTicketTiers(eventId);
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
      fmtDate(log.created_at)
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

    if (typeFilter) {
      // Match on the resolved label, not raw ticket_type. ticket_type is stored
      // inconsistently (PayHero -> name, manual form -> id), so comparing it to
      // a tier id silently dropped every PayHero ticket from the export.
      filtered = filtered.filter(t => t.tier_label === typeFilter);
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

    const headers = ["Ticket ID", "Receipt", "Buyer Name", "Phone", "Event", "Tier", "Audience", "Amount (KES)", "Purchase Date", "Status", "Scanned At", "Scanned By"];
    const rows = filtered.map(t => [
      t.id,
      t.mpesa_receipt,
      `"${(t.buyer_name || "").replace(/"/g, '""')}"`,
      t.phone_number,
      t.event_id ? (data.eventLabels[String(t.event_id)] || `EVENT #${t.event_id}`) : "UNASSIGNED",
      t.tier_label,
      t.is_staff ? "STAFF" : "CUSTOMER",
      Number(t.amount_paid).toString(),
      fmtDate(t.purchase_time),
      t.is_scanned ? "SCANNED" : "ACTIVE",
      t.scanned_at ? fmtDate(t.scanned_at) : "",
      t.scanned_by || ""
    ]);

    const audienceSuffix = audience === "all" ? "" : `-${audience.toUpperCase()}`;
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `GOODLIFE-TICKETS-EXPORT${audienceSuffix}-${new Date().toISOString().split('T')[0]}.csv`);
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

  const loadTillPayments = async () => {
    try {
      const res = await fetch("/api/admin/pending-payments");
      if (res.ok) {
        const all = await res.json();
        const till = all.filter((p: any) => p.status === "till_pending");
        setTillPayments(till);
      }
    } catch (err) {
      console.error("Failed to load till payments:", err);
    }
  };

  const handleApproveTillPayment = async (pp: any) => {
    if (!confirm(`Approve payment from ${pp.buyer_name} (${pp.mpesa_reference || "no ref"}) and create tickets?`)) return;
    setApprovingPayment(pp.checkout_request_id);
    try {
      const ref = pp.mpesa_reference || pp.checkout_request_id.replace("TILL-", "").split("-")[0];
      const res = await fetch("/api/admin/pending-payments/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkout_request_id: pp.checkout_request_id,
          mpesa_reference: ref
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Tickets created: ${data.message}`);
        loadTillPayments();
        loadDashboardMetrics();
      } else {
        alert(`Failed: ${data.message}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setApprovingPayment(null);
    }
  };

  const handleRejectTillPayment = async (checkoutRequestId: string) => {
    if (!confirm("Reject this payment request?")) return;
    try {
      await fetch("/api/admin/pending-payments/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkout_request_id: checkoutRequestId })
      });
      loadTillPayments();
    } catch (err) {
      console.error("Failed to reject:", err);
    }
  };

  const loadWaitlist = async (eventId?: number | null) => {
    setWaitlistLoading(true);
    try {
      const url = eventId ? `/api/admin/waitlist?eventId=${eventId}` : "/api/admin/waitlist";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setWaitlistEntries(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to load waitlist:", err);
    } finally {
      setWaitlistLoading(false);
    }
  };

  const handleBroadcastDrop = async () => {
    const targetEventId = selectedEventId;
    // Broadcasting to "All Events" would message every waitlist in the database.
    if (targetEventId === null || targetEventId <= 0) {
      alert("Select a single event before broadcasting. 'All Events' is not a valid broadcast target.");
      return;
    }
    const pendingCount = waitlistEntries.filter(w => !w.notified).length;
    if (pendingCount === 0) {
      alert("No pending subscribers to notify for this edition.");
      return;
    }
    const confirmed = confirm(`Are you sure you want to broadcast WhatsApp early-bird notifications to ${pendingCount} pending subscriber(s) for Event #${targetEventId}?`);
    if (!confirmed) return;

    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const res = await fetch("/api/admin/waitlist/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: targetEventId,
          message: broadcastMessage.trim() || undefined
        })
      });
      const data = await res.json();
      setBroadcastResult(data);
      loadWaitlist(targetEventId);
    } catch (err: any) {
      setBroadcastResult({ success: false, error: err.message });
    } finally {
      setBroadcasting(false);
    }
  };

  // Load metrics initially
  const didLoad = React.useRef(false);
  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;

    // Resolve which event to show, in priority order:
    //   1. ?event=4  /  ?event=all   (explicit, survives refresh, shareable)
    //   2. the active event
    // Previously this unconditionally overwrote the selection with the active
    // event on every page load, which is why picking an event never stuck.
    const param = new URLSearchParams(window.location.search).get("event");
    let resolvedFromParam: number | null = null;
    let paramIsValid = false;
    if (param === "all") {
      resolvedFromParam = null;
      paramIsValid = true;
    } else if (param !== null && /^\d+$/.test(param)) {
      resolvedFromParam = parseInt(param, 10);
      paramIsValid = true;
    }

    const boot = (eventId: number | null) => {
      setSelectedEventId(eventId);
      selectedEventIdRef.current = eventId;
      setEventResolved(true);
      // Write the choice back so the address bar is never stale.
      syncEventToUrl(eventId);
      loadDashboardMetrics(eventId);
      loadTicketTiers(eventId && eventId > 0 ? eventId : undefined);
      loadWaitlist(eventId && eventId > 0 ? eventId : undefined);
    };

    if (paramIsValid) {
      boot(resolvedFromParam);
    } else {
      // No usable ?event= - fall back to the active event. If that lookup fails
      // we land on "All Events" rather than a hardcoded id, so we never show
      // one arbitrary event's data under another event's label.
      fetchActiveEvent()
        .then((active) => boot(active?.id ?? null))
        .catch(() => boot(null));
    }

    loadEventDetails();
    loadPaymentLogs();
    loadPendingPayments();
    loadTillPayments();

    // Auto refresh every 30 seconds for currently selected event
    const timer = setInterval(() => {
      loadDashboardMetrics(selectedEventIdRef.current);
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
    setSaving("event");
    try {
      const updated = await updateEventDetails(eventFormState);
      setEventDetails(updated);
      setIsEditingEvent(false);
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to update event details:", err);
    } finally { setSaving(null); }
  };

  const handleEditTicketClick = (ticket: Ticket) => {
    setEditingTicket(ticket);
    setTicketFormState(ticket);
  };

  const handleSaveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    setSaving("ticket");
    try {
      await updateTicket(editingTicket.id, ticketFormState);
      setEditingTicket(null);
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to update ticket:", err);
    } finally { setSaving(null); }
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
    setIsCrewPass(false);
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
    setSaving("create");
    try {
      const ticket = await createTicket({
        ...ticketFormState,
        event_id: ticketFormState.event_id ?? (selectedEventId && selectedEventId > 0 ? selectedEventId : undefined)
      } as Ticket);
      if (ticket?.id) {
        if (sendWhatsApp && ticket.phone_number) {
          await fetch("/api/admin/send-whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticketId: ticket.id, phoneNumber: ticket.phone_number }),
          });
        }
        // Notify operators
        await fetch("/api/admin/notify-operators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyerName: ticket.buyer_name,
            ticketType: ticket.ticket_type,
            quantity: 1,
            amountPaid: ticket.amount_paid,
            reference: ticket.id,
          }),
        }).catch(() => {});
      }
      setIsCreatingTicket(false);
      loadDashboardMetrics(selectedEventId);
    } catch (err: any) {
      alert("Failed to create ticket: " + (err.message || "Unknown error"));
    } finally { setSaving(null); }
  };

  const handleCreateTierClick = () => {
    setIsCreatingTier(true);
    setTierFormState({
      id: "",
      name: "",
      price: 0,
      description: "",
      tag: "",
      available_from: null,
      available_until: null,
      max_quantity: null,
      show_only_on_event_day: false,
      hide_on_event_day: false
    });
  };

  const handleSaveCreateTier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving("tier");
    try {
      await createTicketTier({
        ...tierFormState,
        event_id: tierFormState.event_id ?? (selectedEventId && selectedEventId > 0 ? selectedEventId : undefined)
      } as TicketTier);
      setIsCreatingTier(false);
      await loadTicketTiers(selectedEventId && selectedEventId > 0 ? selectedEventId : undefined);
      await loadDashboardMetrics(selectedEventId);
    } catch (err: any) {
      console.error("Failed to create ticket tier:", err);
      alert("Failed to create ticket tier: " + (err.message || "Unknown error"));
    } finally { setSaving(null); }
  };

  const handleEditTierClick = (tier: TicketTier) => {
    setEditingTier(tier);
    setTierFormState(tier);
  };

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTier) return;
    setSaving("edit-tier");
    try {
      await updateTicketTier(editingTier.id, tierFormState);
      setEditingTier(null);
      loadTicketTiers();
      loadDashboardMetrics();
    } catch (err) {
      console.error("Failed to update ticket tier:", err);
    } finally { setSaving(null); }
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
  // Lazy initializer so the clock is read exactly once, and outside render, to
  // satisfy react-hooks/purity. The 30s refresh deliberately does not advance
  // it: a data-integrity check does not need a second-by-second clock, and
  // moving it would re-run the mismatch scan on every poll.
  const [now] = useState(() => Date.now());
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

  /**
   * Flag likely double-payments: the same phone buying the same tier twice in a
   * short window. In practice this is a double-tapped pay button or a retry
   * after a STK push timeout, and it silently doubles the revenue tile.
   *
   * Deliberately narrow, because the alternative is a wall of false positives:
   *  - same phone AND same tier, so a family buying two different tiers is
   *    never questioned
   *  - within DUPLICATE_WINDOW_MIN, so a genuine second purchase hours later
   *    is left alone (the 4-minute and 13-minute real cases are caught; a
   *    2-hour gap is not)
   *  - both must have a phone, since the manual ticket form permits a blank
   *
   * This is advisory only - it writes nothing and blocks nothing.
   */
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, NormalizedTicket[]>();
    (metrics?.tickets || []).forEach(t => {
      const phone = normalizePhone(t.phone_number);
      if (!phone) return;
      const key = `${phone}|${t.tier_label}`;
      const list = groups.get(key);
      if (list) list.push(t);
      else groups.set(key, [t]);
    });

    const flagged = new Map<string, number>();
    groups.forEach(list => {
      if (list.length < 2) return;
      const sorted = [...list].sort(
        (a, b) => new Date(a.purchase_time).getTime() - new Date(b.purchase_time).getTime()
      );
      for (let i = 1; i < sorted.length; i++) {
        const gap = new Date(sorted[i].purchase_time).getTime()
          - new Date(sorted[i - 1].purchase_time).getTime();
        if (gap <= DUPLICATE_WINDOW_MIN * 60_000) {
          // Mark both halves: a refund/refund decision needs the pair.
          flagged.set(sorted[i - 1].id, (flagged.get(sorted[i - 1].id) || 0) + 1);
          flagged.set(sorted[i].id, (flagged.get(sorted[i].id) || 0) + 1);
        }
      }
    });
    return flagged;
  }, [metrics]);

  /**
   * Data-integrity check, not decoration.
   *
   * GOODLIFE 4's `event_date` read 2026-09-27 while every one of its 39 gate
   * scans happened on 2026-07-11. The row had been re-dated for an upcoming
   * edition while the previous edition's tickets stayed attached to it, which
   * is why the ledger showed a full season of real sales for an event that had
   * not happened yet.
   *
   * Two independent signals, either sufficient to warrant a look:
   *   1. sales recorded against an event still dated in the future
   *   2. peak gate activity nowhere near the recorded event_date
   *
   * An event with no date set is never flagged: absence of data is not evidence
   * of a fault.
   */
  const dateMismatches = useMemo(() => {
    const byEvent = new Map<number, { date: string | null; scanned: string[]; sold: number }>();
    (metrics?.tickets || []).forEach(t => {
      if (!t.event_id) return;
      const entry = byEvent.get(t.event_id) || {
        date: metrics?.eventDates[String(t.event_id)] || null,
        scanned: [] as string[],
        sold: 0,
      };
      entry.sold += 1;
      if (t.scanned_at) entry.scanned.push(t.scanned_at.slice(0, 10));
      byEvent.set(t.event_id, entry);
    });

    const out: Array<{ eventId: number; reason: string }> = [];
    byEvent.forEach((entry, eventId) => {
      if (!entry.date) return;
      const eventDay = new Date(entry.date).getTime();

      if (eventDay > now) {
        out.push({
          eventId,
          reason: `is dated ${entry.date.slice(0, 10)}, still in the future, but already has ${entry.sold} ticket${entry.sold === 1 ? "" : "s"} sold`,
        });
        return;
      }

      if (entry.scanned.length === 0) return;
      // Compare against the busiest scanning day, not the first, so a single
      // early door-opening scan cannot make a correct event look wrong.
      const tally = new Map<string, number>();
      entry.scanned.forEach(d => tally.set(d, (tally.get(d) || 0) + 1));
      const peak = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0][0];
      const drift = Math.round((new Date(peak).getTime() - eventDay) / 86400000);
      if (Math.abs(drift) > 3) {
        out.push({
          eventId,
          reason: `is dated ${entry.date.slice(0, 10)}, but its gate was scanned on ${peak} - ${Math.abs(drift)} days ${drift > 0 ? "earlier" : "later"}. The event record and the tickets under it describe different occasions`,
        });
      }
    });
    return out;
  }, [metrics, now]);

  if ((loading || !eventResolved) && !metrics) {
    return (
      <div className="min-h-screen bg-[var(--brand-off-white)] flex flex-col items-center justify-center text-[var(--brand-navy)]">
        <RefreshCw className="w-8 h-8 animate-spin" />
        <p key={loadingMsg} className="mt-2 text-xs font-black tracking-widest uppercase">{loadingMessages[loadingMsg]}</p>
      </div>
    );
  }

  const data = metrics!;
  // The heading used to read event_details.title, which is the site-wide
  // singleton - so it said "GOODLIFE XP ADMIN" while viewing another event's
  // data. Derive it from the actually-selected event instead.
  const selectedEventTitle = selectedEventId === null
    ? "ALL EVENTS"
    : data.eventLabels[String(selectedEventId)] || `EVENT #${selectedEventId}`;

  // data.tickets is already scoped to the selected event and audience, so every
  // count, table row and export below inherits both filters automatically.
  const filteredTickets = (ledgerTab === "all" ? data.tickets
    : ledgerTab === "active" ? data.tickets.filter(t => !t.is_scanned)
    : data.tickets.filter(t => t.is_scanned))
    .filter(t => !typeFilter || t.tier_label === typeFilter);

  // Options come from the tickets actually on screen, so a tier with no sales
  // in this event/audience can't be selected into an empty result.
  const tierLabelOptions = Array.from(
    data.tickets.reduce((m, t) => m.set(t.tier_label, (m.get(t.tier_label) || 0) + 1), new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]);

  // Counted against what is on screen, not the whole event, so the warning
  // never cites rows the operator cannot actually see.
  const duplicateCount = filteredTickets.filter(t => duplicateGroups.has(t.id)).length;

  return (
    <div className="min-h-screen bg-[var(--brand-off-white)] py-6 px-4 md:px-8 text-[var(--brand-navy)] font-sans selection:bg-[var(--brand-navy)] selection:text-white">
      
      {/* BRANDING HEADER SYSTEM */}
      <div className="w-full max-w-7xl xl:max-w-[1500px] mx-auto border-b-4 border-[var(--brand-navy)] pb-4 mb-6">
        {/* Tier 1: Title & Global Actions */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
          <div>
            <span className="font-sans font-black tracking-widest text-[11px] bg-[var(--brand-navy)] text-[var(--brand-off-white)] px-2.5 py-0.5 uppercase">
              ADMIN CONSOLE
            </span>
            <h1 className="text-2xl sm:text-3xl font-sans font-black tracking-tighter uppercase mt-1 leading-none text-[var(--brand-navy)]">
              {selectedEventTitle.toUpperCase()} ADMIN
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link 
              href="/" 
              className="text-xs font-black uppercase border-2 border-[var(--brand-navy)] px-3 py-1.5 hover:bg-[var(--brand-navy)] hover:text-[var(--brand-off-white)] transition-colors flex items-center gap-1.5 bg-white shadow-(--shadow-brut-xs)"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> CHECKOUT PORTAL
            </Link>
            <button 
              onClick={handleSignOut}
              className="text-xs font-black uppercase border-2 border-red-600 text-red-600 px-3 py-1.5 hover:bg-red-600 hover:text-white transition-colors bg-white shadow-(--shadow-brut-xs)"
            >
              SIGN OUT
            </button>
          </div>
        </div>

        {/* Tier 2: Event Selector & Operational Action Bar */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 pt-3 border-t-2 border-dashed border-[var(--brand-navy)]/30">
          {/* Left: Event Picker & Audience Filter */}
          <div className="flex flex-wrap items-center gap-3">
            <EventSelector selectedEventId={selectedEventId} onSelect={handleEventSelect} />

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-caption font-black uppercase text-[var(--brand-navy)]">Showing</span>
              <div className="flex border-2 border-[var(--brand-navy)] bg-white shadow-(--shadow-brut-xs)">
                {AUDIENCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleAudienceSelect(opt.value)}
                    aria-pressed={audience === opt.value}
                    className={`px-2.5 py-1 text-[11px] font-black uppercase transition-colors duration-150 active:scale-95 ${
                      audience === opt.value
                        ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                        : "bg-white text-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/10"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="text-caption text-[var(--brand-navy-light)] font-bold uppercase whitespace-nowrap">
                {data.staffPasses} staff pass{data.staffPasses === 1 ? "" : "es"}
              </span>
              {dateMismatches.map(m => (
                <span
                  key={m.eventId}
                  className="text-caption font-black uppercase text-brand-danger flex items-center gap-1"
                  title={`${data.eventLabels[String(m.eventId)] || `Event #${m.eventId}`} ${m.reason}.`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {data.eventLabels[String(m.eventId)] || `EVENT #${m.eventId}`} &mdash; {m.reason}
                </span>
              ))}
              {duplicateCount > 0 && (
                <span
                  className="text-caption font-black uppercase text-brand-danger flex items-center gap-1"
                  title="Possible duplicate payment."
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {duplicateCount} possible duplicate payment{duplicateCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>

          {/* Right: Operational Tool Buttons */}
          <div className="flex gap-2 flex-wrap items-center">
            <button
              onClick={() => {
                setIsEditingEvent(true);
                setEventFormState({
                  ...eventDetails,
                  whatsapp_message: eventDetails?.whatsapp_message?.trim()
                    ? eventDetails.whatsapp_message
                    : getDefaultWhatsAppTemplate(),
                  payment_contact: eventDetails?.payment_contact || "",
                  whatsapp_operator_template: eventDetails?.whatsapp_operator_template?.trim()
                    ? eventDetails.whatsapp_operator_template
                    : getDefaultOperatorTemplate(),
                  whatsapp_scan_template: eventDetails?.whatsapp_scan_template?.trim()
                    ? eventDetails.whatsapp_scan_template
                    : getDefaultScanTemplate(),
                  operator_notifications_enabled: eventDetails?.operator_notifications_enabled ?? false
                });
              }}
              className="text-xs font-black uppercase border-2 border-[var(--brand-navy)] px-3 py-1.5 hover:bg-[var(--brand-navy)] hover:text-[var(--brand-off-white)] transition-colors flex items-center gap-1 bg-white shadow-(--shadow-brut-xs)"
            >
              <Edit className="w-3.5 h-3.5" /> EDIT EVENT INFO
            </button>
            <Link 
              href="/admin/vendors" 
              className="text-xs font-black uppercase border-2 border-[var(--brand-navy)] px-3 py-1.5 bg-brand-accent text-brand-navy hover:bg-[var(--brand-navy)] hover:text-[var(--brand-off-white)] transition-colors flex items-center gap-1.5 shadow-(--shadow-brut-xs)"
            >
              <Store className="w-3.5 h-3.5" /> STAFF & POS
            </Link>
            <Link 
              href="/admin/settlements" 
              className="text-xs font-black uppercase border-2 border-[var(--brand-navy)] px-3 py-1.5 bg-white text-brand-navy hover:bg-[var(--brand-navy)] hover:text-[var(--brand-off-white)] transition-colors flex items-center gap-1.5 shadow-(--shadow-brut-xs)"
            >
              <Receipt className="w-3.5 h-3.5" /> SETTLEMENTS
            </Link>
            <Link 
              href="/scanner" 
              className="text-xs font-black uppercase bg-[var(--brand-navy)] text-[var(--brand-off-white)] px-3 py-1.5 hover:bg-[var(--brand-navy-light)] transition-colors flex items-center gap-1.5 shadow-(--shadow-brut-xs)"
            >
              <Activity className="w-3.5 h-3.5" /> GATE SCAN
            </Link>
          </div>
        </div>
      </div>

      {/* Stale-data guard: a failed load used to be swallowed, leaving the
          previous event's rows on screen under the new event's label. */}
      {metricsError && (
        <div className="w-full max-w-7xl xl:max-w-[1500px] mx-auto mb-4 border-4 border-red-600 bg-red-50 p-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-black uppercase text-red-800 flex-1 min-w-[200px]">
            Could not refresh this view: {metricsError} The figures below may be stale.
          </span>
          <button
            onClick={() => loadDashboardMetrics()}
            className="px-2.5 py-1 bg-red-600 text-white text-[11px] font-black uppercase hover:bg-red-700 active:scale-95 transition-all duration-150 border border-red-700"
          >
            Retry
          </button>
        </div>
      )}

      <div className="w-full max-w-7xl xl:max-w-[1500px] mx-auto space-y-6">

        <BoxOfficeMetrics
          totalCashCollected={data.totalCashCollected}
          totalTicketsSold={data.totalTicketsSold}
          recentSalesAmount={data.recentSalesAmount}
          scanCount={data.scanCount}
          staffPasses={data.staffPasses}
          audience={audience}
        />

        <TierSalesBreakdown
          campingTiers={data.campingTiers}
          totalTicketsSold={data.totalTicketsSold}
          ticketTiers={ticketTiers}
          audience={audience}
        />

        {/* STAFF & VENDOR POS WAR ROOM CARD */}
        <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] p-4 md:p-5 shadow-(--shadow-brut-md) flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Store className="w-5 h-5 text-[var(--brand-navy)]" />
              <h3 className="font-display text-lg md:text-xl uppercase text-[var(--brand-navy)] font-black tracking-wide">
                STAFF & VENDOR POS STALLS
              </h3>
            </div>
            <p className="font-mono text-xs uppercase text-[var(--brand-navy)]/80">
              Manage festival bar/food vendor stalls, assign operator staff PINs, review customer tabs & process payouts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/admin/vendors?add=true"
              className="px-3.5 py-2 border-2 border-[var(--brand-navy)] bg-brand-accent text-[var(--brand-navy)] font-mono text-xs font-black uppercase hover:bg-[var(--brand-navy)] hover:text-[var(--brand-off-white)] transition-colors flex items-center gap-1.5 shadow-(--shadow-brut-xs)"
            >
              <Plus className="w-3.5 h-3.5" /> ADD POS STALL
            </Link>
            <Link
              href="/admin/vendors"
              className="px-3.5 py-2 border-2 border-[var(--brand-navy)] bg-[var(--brand-off-white)] text-[var(--brand-navy)] font-mono text-xs font-black uppercase hover:bg-[var(--brand-navy)] hover:text-[var(--brand-off-white)] transition-colors flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" /> VIEW STAFF & TABS
            </Link>
            <Link
              href="/vendor/sell"
              target="_blank"
              className="px-3.5 py-2 border-2 border-[var(--brand-navy)] bg-[var(--brand-navy)] text-[var(--brand-off-white)] font-mono text-xs font-black uppercase hover:bg-brand-accent hover:text-[var(--brand-navy)] transition-colors flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> OPEN POS TERMINAL
            </Link>
          </div>
        </div>

        {/* TABS SELECTION BAR */}
        <div className="flex flex-col sm:flex-row border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-(--shadow-brut-md) overflow-hidden">
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
            onClick={() => setActiveTab("payment-requests")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors border-t-4 sm:border-t-0 sm:border-l-4 border-[var(--brand-navy)] ${
              activeTab === "payment-requests"
                ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                : "bg-transparent text-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/5"
            }`}
          >
            Payment Requests ({tillPayments.length})
          </button>
          <button
            onClick={() => { setActiveTab("waitlist"); loadWaitlist(selectedEventId); }}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors border-t-4 sm:border-t-0 sm:border-l-4 border-[var(--brand-navy)] ${
              activeTab === "waitlist"
                ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                : "bg-transparent text-[var(--brand-navy)] hover:bg-[var(--brand-navy)]/5"
            }`}
          >
            Waitlist & Drops ({waitlistEntries.length})
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
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-(--shadow-brut-lg)">
            
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
                  onClick={() => loadDashboardMetrics(selectedEventId)}
                  className="p-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/20 active:scale-95 transition-all duration-150"
                  title="Refresh master ledger"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Ledger filters + CSV export. The tier dropdown filters the table
                as well as the export; it previously only fed the export, and
                matched on tier id against a name-encoded column. */}
            <div className="flex flex-wrap items-center gap-2 p-2 bg-[var(--brand-off-white)] border-b-2 border-[var(--brand-navy)]">
              <span className="text-[11px] font-black uppercase text-[var(--brand-navy)] mr-1">FILTER:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by tier"
                className="text-[11px] border border-[var(--brand-navy)]/20 px-1.5 py-1 bg-[var(--brand-off-white)] font-mono"
              >
                <option value="">All Tiers ({data.tickets.length})</option>
                {tierLabelOptions.map(([label, count]) => (
                  <option key={label} value={label}>{label} ({count})</option>
                ))}
              </select>
              <select
                value={exportTicketStatusFilter}
                onChange={(e) => setExportTicketStatusFilter(e.target.value as any)}
                className="text-[11px] border border-[var(--brand-navy)]/20 px-1.5 py-1 bg-[var(--brand-off-white)] font-mono"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="scanned">Scanned Only</option>
              </select>
              <input
                type="date"
                value={exportDateFrom}
                onChange={(e) => setExportDateFrom(e.target.value)}
                className="text-[11px] border border-[var(--brand-navy)]/20 px-1.5 py-1 bg-[var(--brand-off-white)] font-mono"
                title="From date"
              />
              <span className="text-[11px] text-[var(--brand-navy)]/60">-</span>
              <input
                type="date"
                value={exportDateTo}
                onChange={(e) => setExportDateTo(e.target.value)}
                className="text-[11px] border border-[var(--brand-navy)]/20 px-1.5 py-1 bg-[var(--brand-off-white)] font-mono"
                title="To date"
              />
              <button
                onClick={handleExportTicketsCSV}
                className="text-[11px] font-black uppercase border border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white px-2.5 py-1 hover:opacity-80 active:scale-95 transition-all duration-150 flex items-center gap-1"
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
                    className={`flex-1 py-2 text-[11px] font-black uppercase tracking-widest border-b-2 -mb-[2px] transition-colors ${
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
                  className="px-2.5 py-1 bg-red-600 text-white text-[11px] font-black uppercase hover:bg-red-700 active:scale-95 transition-all duration-150 cursor-pointer border border-red-700"
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
                  className="px-2.5 py-1 bg-[var(--brand-navy)] text-white text-[11px] font-black uppercase hover:opacity-90 active:scale-95 transition-all duration-150 cursor-pointer border border-[var(--brand-navy)]"
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
                  className="px-2.5 py-1 bg-green-600 text-white text-[11px] font-black uppercase hover:bg-green-700 active:scale-95 transition-all duration-150 cursor-pointer border border-green-700"
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
                  className="px-2.5 py-1 bg-blue-600 text-white text-[11px] font-black uppercase hover:bg-blue-700 active:scale-95 transition-all duration-150 cursor-pointer border border-blue-700"
                >
                  Mark Active
                </button>
                <button
                  onClick={() => setSelectedTicketIds([])}
                  className="px-2.5 py-1 bg-[var(--brand-off-white)] text-[var(--brand-navy)] text-[11px] font-black uppercase hover:bg-[var(--brand-bg)] active:scale-95 transition-all duration-150 cursor-pointer border border-[var(--brand-navy)]/20 ml-auto"
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
                    <th className="p-3">EVENT</th>
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
                      <td colSpan={10} className="p-6 text-center text-[var(--brand-navy-light)] uppercase font-black tracking-widest">
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
                          <span className="text-[11px] font-mono text-[var(--brand-navy-light)]">M-Pesa: {t.mpesa_receipt}</span>
                        </td>
                        <td className="p-3 text-[11px] uppercase text-[var(--brand-navy-light)] font-black">
                          {t.event_id ? (data.eventLabels[String(t.event_id)] || `EVENT #${t.event_id}`) : "UNASSIGNED"}
                        </td>
                        <td className="p-3 font-bold text-[var(--brand-navy)] uppercase">{t.buyer_name}</td>
                        <td className="p-3 uppercase">
                          <span className={`px-2 py-0.5 border font-black ${t.is_staff ? "bg-brand-accent/20 border-[var(--brand-navy)]/40" : "bg-[var(--brand-navy)]/5 text-[var(--brand-navy)] border-[var(--brand-navy)]/20"}`}>
                            {t.tier_label}
                          </span>
                        </td>
                        <td className="p-3 font-mono">
                          {t.phone_number}
                          {duplicateGroups.has(t.id) && (
                            <span
                              className="block mt-1 bg-brand-warning/15 border border-brand-warning text-brand-danger font-black px-1.5 py-0.5 uppercase text-[10px] w-max"
                              title={`Another sale of ${t.tier_label} went to this same phone within ${DUPLICATE_WINDOW_MIN} minutes. Check whether this is a double payment before counting it as revenue.`}
                            >
                              Possible duplicate
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-black text-[var(--brand-navy)]">{t.is_staff ? "Staff Pass" : `KES ${Number(t.amount_paid).toLocaleString()}`}</td>
                        <td className="p-3 font-mono text-[11px] text-[var(--brand-navy)]/60">
                          {fmtDate(t.purchase_time)}
                        </td>
                        <td className="p-3">
                          {t.is_scanned ? (
                            <span className="bg-red-100 border border-red-300 text-red-900 font-bold px-2 py-0.5 uppercase text-[11px] flex items-center gap-1 w-max">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" /> SCANNED
                            </span>
                          ) : (
                            <span className="bg-green-100 border border-green-300 text-green-900 font-bold px-2 py-0.5 uppercase text-[11px] flex items-center gap-1 w-max">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-600" /> ACTIVE
                            </span>
                          )}
                          {t.is_scanned && t.scanned_at && (
                            <span className="block text-[11px] font-mono text-red-600 mt-1">
                              At {fmtTime(t.scanned_at)} by {t.scanned_by}
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
                          <span className="text-[11px] font-mono text-[var(--brand-navy-light)]">M-Pesa: {t.mpesa_receipt}</span>
                        </div>
                        <div>
                          {t.is_scanned ? (
                            <span className="bg-red-100 border border-red-300 text-red-900 font-bold px-2 py-0.5 uppercase text-[11px] flex items-center gap-1 w-max">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" /> SCANNED
                            </span>
                          ) : (
                            <span className="bg-green-100 border border-green-300 text-green-900 font-bold px-2 py-0.5 uppercase text-[11px] flex items-center gap-1 w-max">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-600" /> ACTIVE
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Attendee</span>
                          <span className="font-bold text-[var(--brand-navy)] uppercase">{t.buyer_name}</span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Event</span>
                          <span className="font-black text-[var(--brand-navy)] uppercase text-[11px]">
                            {t.event_id ? (data.eventLabels[String(t.event_id)] || `EVENT #${t.event_id}`) : "UNASSIGNED"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Tier Type</span>
                          <span className={`px-1.5 py-0.5 border font-black uppercase text-[11px] inline-block ${t.is_staff ? "bg-brand-accent/20 border-[var(--brand-navy)]/40" : "bg-[var(--brand-navy)]/5 text-[var(--brand-navy)] border-[var(--brand-navy)]/20"}`}>
                            {t.tier_label}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Phone</span>
                          <span className="font-mono">{t.phone_number}</span>
                          {duplicateGroups.has(t.id) && (
                            <span
                              className="block mt-1 bg-brand-warning/15 border border-brand-warning text-brand-danger font-black px-1.5 py-0.5 uppercase text-[10px] w-max"
                              title={`Another sale of ${t.tier_label} went to this same phone within ${DUPLICATE_WINDOW_MIN} minutes. Check whether this is a double payment before counting it as revenue.`}
                            >
                              Possible duplicate
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">{t.is_staff ? "Pass Type" : "Amount Paid"}</span>
                          <span className="font-black text-[var(--brand-navy)]">{t.is_staff ? "Staff Pass" : `KES ${Number(t.amount_paid).toLocaleString()}`}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Date / Time</span>
                          <span className="font-mono text-[var(--brand-navy)]/60">{fmtDate(t.purchase_time)}</span>
                          {t.is_scanned && t.scanned_at && (
                            <span className="block text-[11px] font-mono text-red-600 mt-1">
                              Scanned at {fmtTime(t.scanned_at)} by {t.scanned_by}
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
            
            <div className="p-3 bg-[var(--brand-bg)]border-t-2 border-[var(--brand-navy)] text-right font-mono text-[11px] text-[var(--brand-navy-light)]">
              Sales system active: 2026-06-17
            </div>
          </div>
        ) : activeTab === "tiers" ? (
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-(--shadow-brut-lg)">
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
                  onClick={() => loadTicketTiers(selectedEventId && selectedEventId > 0 ? selectedEventId : undefined)}
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
                  className="px-2.5 py-1 bg-red-600 text-white text-[11px] font-black uppercase hover:bg-red-700 active:scale-95 transition-all duration-150 cursor-pointer border border-red-700"
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
                  className="px-2.5 py-1 bg-brand-warning text-white text-[11px] font-black uppercase hover:bg-brand-warning active:scale-95 transition-all duration-150 cursor-pointer border border-brand-warning"
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
                  className="px-2.5 py-1 bg-green-600 text-white text-[11px] font-black uppercase hover:bg-green-700 active:scale-95 transition-all duration-150 cursor-pointer border border-green-700"
                >
                  Show selected
                </button>
                <button
                  onClick={() => setSelectedTierIds([])}
                  className="px-2.5 py-1 bg-[var(--brand-off-white)] text-[var(--brand-navy-light)] text-[11px] font-black uppercase hover:bg-[var(--brand-navy)]/5 active:scale-95 transition-all duration-150 cursor-pointer border border-[var(--brand-navy)]/20 ml-auto"
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
                          <span className="bg-[var(--brand-navy)]/5 text-[var(--brand-navy)] px-2 py-0.5 border border-[var(--brand-navy)]/20 font-black text-[11px]">
                            {t.tag}
                          </span>
                        </td>
                        <td className="p-3 text-[var(--brand-navy)]/60">{t.description}</td>
                        <td className="p-3">
                          {t.hidden && (
                            <span className="bg-red-100 border border-red-300 text-red-900 font-bold px-2 py-0.5 uppercase text-[11px] block w-max mb-0.5">
                              HIDDEN
                            </span>
                          )}
                          {t.show_only_on_event_day && (
                            <span className="bg-[var(--brand-warning-bg)] border border-brand-warning text-brand-warning font-bold px-2 py-0.5 uppercase text-[11px] block w-max">
                              SHOW ON EVENT DAY ONLY
                            </span>
                          )}
                          {t.hide_on_event_day && (
                            <span className="bg-[var(--brand-navy)]/5 border border-[var(--brand-navy)]/20 text-[var(--brand-navy-light)] font-bold px-2 py-0.5 uppercase text-[11px] block w-max">
                              HIDE ON EVENT DAY
                            </span>
                          )}
                          {!t.show_only_on_event_day && !t.hide_on_event_day && !t.hidden && (
                            <span className="bg-blue-100 border border-blue-300 text-blue-900 font-bold px-2 py-0.5 uppercase text-[11px] block w-max">
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
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Tag / Badge</span>
                          <span className="bg-[var(--brand-navy)]/5 text-[var(--brand-navy)] px-1.5 py-0.5 border border-[var(--brand-navy)]/20 font-black text-[11px] uppercase inline-block font-sans">
                            {t.tag}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Behavior</span>
                          {t.hidden && (
                            <span className="bg-red-100 border border-red-300 text-red-900 font-bold px-1.5 py-0.5 uppercase text-[11px] inline-block">
                              HIDDEN
                            </span>
                          )}
                          {t.show_only_on_event_day && (
                            <span className="bg-[var(--brand-warning-bg)] border border-brand-warning text-brand-warning font-bold px-1.5 py-0.5 uppercase text-[11px] inline-block">
                              EVENT DAY ONLY
                            </span>
                          )}
                          {t.hide_on_event_day && (
                            <span className="bg-[var(--brand-navy)]/5 border border-[var(--brand-navy)]/20 text-[var(--brand-navy-light)] font-bold px-1.5 py-0.5 uppercase text-[11px] inline-block">
                              HIDE ON EVENT DAY
                            </span>
                          )}
                          {!t.show_only_on_event_day && !t.hide_on_event_day && !t.hidden && (
                            <span className="bg-blue-100 border border-blue-300 text-blue-900 font-bold px-1.5 py-0.5 uppercase text-[11px] inline-block">
                              ALWAYS VISIBLE
                            </span>
                          )}
                        </div>
                        <div className="col-span-2">
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Description</span>
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

            <div className="p-3 bg-[var(--brand-bg)]border-t-2 border-[var(--brand-navy)] text-right font-mono text-[11px] text-[var(--brand-navy-light)]">
              Ticket tiers catalog dynamically synced.
            </div>
          </div>
        ) : activeTab === "trash" ? (
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-(--shadow-brut-lg)">
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
                  className="px-2.5 py-1 bg-green-600 text-white text-[11px] font-black uppercase hover:bg-green-700 active:scale-95 transition-all duration-150 cursor-pointer border border-green-700"
                >
                  Bulk Restore
                </button>
                <button
                  onClick={() => {
                    setTrashActionType("delete_selected");
                    setTrashPassword("");
                    setShowTrashPasswordModal(true);
                  }}
                  className="px-2.5 py-1 bg-red-600 text-white text-[11px] font-black uppercase hover:bg-red-700 active:scale-95 transition-all duration-150 cursor-pointer border border-red-700"
                >
                  Bulk Permanent Delete
                </button>
                <button
                  onClick={() => {
                    setSelectedTrashTicketIds([]);
                    setSelectedTrashTierIds([]);
                  }}
                  className="px-2.5 py-1 bg-[var(--brand-off-white)] text-[var(--brand-navy-light)] text-[11px] font-black uppercase hover:bg-[var(--brand-navy)]/5 active:scale-95 transition-all duration-150 cursor-pointer border border-[var(--brand-navy)]/20 ml-auto"
                >
                  Deselect All
                </button>
              </div>
            )}

            {/* Deleted Tickets */}
            <div className="p-3 border-b-2 border-[var(--brand-navy)]">
              <h3 className="text-[11px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                Deleted Tickets ({deletedTickets.length})
              </h3>
              {loadingTrash ? (
                <div className="text-[11px] text-[var(--brand-navy)]/40 font-mono">Loading...</div>
              ) : deletedTickets.length === 0 ? (
                <div className="text-[11px] text-[var(--brand-navy)]/40 font-mono py-2 italic">No deleted tickets.</div>
              ) : (
                <div className="space-y-2">
                  {deletedTickets.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-red-50 border border-red-200 p-2">
                      <div className="flex items-center gap-2 text-[11px]">
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
                            Deleted: {t.deleted_at ? fmtDate(t.deleted_at) : "unknown"}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRestoreTicket(t.id)}
                          className="px-2 py-1 bg-green-600 text-white text-[11px] font-black uppercase hover:bg-green-700 active:scale-95 transition-all duration-150 flex items-center gap-1 cursor-pointer"
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
                          className="px-2 py-1 bg-red-600 text-white text-[11px] font-black uppercase hover:bg-red-700 flex items-center gap-1 cursor-pointer"
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
              <h3 className="text-[11px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                Deleted Ticket Tiers ({deletedTiers.length})
              </h3>
              {loadingTrash ? (
                <div className="text-[11px] text-[var(--brand-navy)]/40 font-mono">Loading...</div>
              ) : deletedTiers.length === 0 ? (
                <div className="text-[11px] text-[var(--brand-navy)]/40 font-mono py-2 italic">No deleted ticket tiers.</div>
              ) : (
                <div className="space-y-2">
                  {deletedTiers.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-red-50 border border-red-200 p-2">
                      <div className="flex items-center gap-2 text-[11px]">
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
                            Deleted: {t.deleted_at ? fmtDate(t.deleted_at) : "unknown"}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRestoreTier(t.id)}
                          className="px-2 py-1 bg-green-600 text-white text-[11px] font-black uppercase hover:bg-green-700 active:scale-95 transition-all duration-150 flex items-center gap-1 cursor-pointer"
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
                          className="px-2 py-1 bg-red-600 text-white text-[11px] font-black uppercase hover:bg-red-700 flex items-center gap-1 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-[var(--brand-bg)]border-t-2 border-[var(--brand-navy)] text-right font-mono text-[11px] text-[var(--brand-navy-light)]">
              Deleted items can be restored, or permanently cleared with password.
            </div>
          </div>
        ) : activeTab === "payment-requests" ? (
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-(--shadow-brut-lg)">
            <div className="flex justify-between items-center bg-[var(--brand-navy)] p-3 text-[var(--brand-off-white)]">
              <span className="text-xs font-black tracking-widest uppercase flex items-center gap-2">
                <ListChecks className="w-4 h-4" /> PAYMENT REQUESTS ({tillPayments.length})
              </span>
              <div className="flex gap-2">
                <button
                  onClick={loadTillPayments}
                  className="p-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/10"
                  title="Refresh payment requests"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {tillPayments.length === 0 ? (
              <div className="p-8 text-center text-[var(--brand-navy-light)] uppercase font-black tracking-widest text-xs">
                No pending payment requests.
              </div>
            ) : (
              <div className="divide-y divide-[var(--brand-navy)]/15">
                {tillPayments.map((pp) => (
                  <div key={pp.checkout_request_id} className="p-4 space-y-3 hover:bg-[var(--brand-warning-bg)]/30">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono font-black text-xs text-brand-warning block">{pp.checkout_request_id}</span>
                        <span className="text-[11px] text-[var(--brand-navy-light)]">{pp.buyer_name} · {pp.phone_number}</span>
                      </div>
                      <span className="bg-blue-100 border border-blue-300 text-blue-900 font-bold px-2 py-0.5 uppercase text-[11px]">
                        TILL PENDING
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs items-center">
                      <span className="font-black">{pp.ticket_type} × {pp.quantity}</span>
                      <span className="font-mono">KES {Number(pp.amount).toLocaleString()}</span>
                      {pp.mpesa_reference && (
                        <span className="font-mono bg-brand-navy/5 px-2 py-0.5 border border-brand-navy/20">
                          REF: {pp.mpesa_reference}
                        </span>
                      )}
                      <span className="text-[var(--brand-navy)]/40">{pp.created_at ? fmtDate(pp.created_at) : ""}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => handleApproveTillPayment(pp)}
                        disabled={approvingPayment === pp.checkout_request_id}
                        className="text-xs font-black uppercase border-2 border-green-600 text-green-700 px-4 py-1.5 hover:bg-green-600 hover:text-white active:scale-95 transition-all duration-150 disabled:opacity-40"
                      >
                        {approvingPayment === pp.checkout_request_id ? "APPROVING..." : "APPROVE & CREATE TICKETS"}
                      </button>
                      <button
                        onClick={() => handleRejectTillPayment(pp.checkout_request_id)}
                        className="text-xs font-black uppercase border-2 border-red-300 text-red-600 px-3 py-1.5 hover:bg-red-600 hover:text-white active:scale-95 transition-all duration-150"
                      >
                        REJECT
                      </button>
                    </div>
                    {pp.whatsapp_number && (
                      <p className="text-[11px] font-mono text-[var(--brand-navy-light)]">
                        WhatsApp: {pp.whatsapp_number}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === "waitlist" ? (
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-(--shadow-brut-lg)">
            {/* Header */}
            <div className="flex justify-between items-center bg-[var(--brand-navy)] p-3 text-[var(--brand-off-white)]">
              <span className="text-xs font-black tracking-widest uppercase flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-accent" /> EARLY-BIRD DROP AUDIENCE & WAITLIST ({waitlistEntries.length})
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => loadWaitlist(selectedEventId)}
                  className="p-1 border border-[var(--brand-off-white)] hover:bg-[var(--brand-off-white)]/10 cursor-pointer"
                  title="Refresh waitlist"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Metrics cards */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-b-2 border-brand-navy bg-brand-bg/50">
              <div className="p-3 border-2 border-brand-navy bg-white">
                <span className="text-[10px] font-mono font-bold uppercase text-brand-navy/60 block">SUBSCRIBERS</span>
                <span className="font-display text-2xl text-brand-navy">{waitlistEntries.length}</span>
              </div>
              <div className="p-3 border-2 border-brand-navy bg-white">
                <span className="text-[10px] font-mono font-bold uppercase text-green-700 block">NOTIFIED / DROPPED</span>
                <span className="font-display text-2xl text-green-700">
                  {waitlistEntries.filter(w => w.notified).length}
                </span>
              </div>
              <div className="p-3 border-2 border-brand-navy bg-white">
                <span className="text-[10px] font-mono font-bold uppercase text-yellow-700 block">PENDING DROPS</span>
                <span className="font-display text-2xl text-yellow-700">
                  {waitlistEntries.filter(w => !w.notified).length}
                </span>
              </div>
            </div>

            {/* Broadcast Action Box */}
            <div className="p-4 border-b-2 border-brand-navy bg-brand-accent/10 space-y-3">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-brand-navy" />
                <h4 className="font-display text-base uppercase text-brand-navy">
                  BROADCAST EARLY BIRD DROP VIA WHATSAPP
                </h4>
              </div>
              <p className="text-[11px] font-mono text-brand-navy/80 uppercase leading-relaxed">
                Sends automated WhatsApp announcement to all pending subscribers in rate-controlled batches (10 msgs / 2.5s) to prevent spam filtering.
              </p>
              
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase text-brand-navy block">
                  DROP MESSAGE TEMPLATE (OPTIONAL CUSTOM TEXT):
                </label>
                <textarea
                  rows={2}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder={`🔥 ${eventDetails?.title || 'GOODLIFE'} Early Bird Passes are officially LIVE! Secure your ticket now before they sell out 👉 https://goodlife.smwhr.space`}
                  className="w-full p-2 border-2 border-brand-navy bg-white font-mono text-xs focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={broadcasting || waitlistEntries.filter(w => !w.notified).length === 0}
                  onClick={handleBroadcastDrop}
                  className="py-2.5 px-4 bg-brand-navy text-brand-off-white font-display text-sm uppercase tracking-wider hover:bg-brand-accent hover:text-brand-navy transition-colors border-2 border-brand-navy disabled:opacity-50 cursor-pointer shadow-(--shadow-brut-xs)"
                >
                  {broadcasting ? "BROADCASTING IN CHUNKS..." : `📢 BROADCAST TO ${waitlistEntries.filter(w => !w.notified).length} SUBSCRIBERS`}
                </button>

                {broadcastResult && (
                  <div className={`text-xs font-mono font-bold p-2 border ${
                    broadcastResult.success ? "bg-green-100 border-green-500 text-green-950" : "bg-red-100 border-red-500 text-red-950"
                  }`}>
                    {broadcastResult.message || `Dispatched ${broadcastResult.sent} messages (${broadcastResult.failed} failed)`}
                  </div>
                )}
              </div>
            </div>

            {/* Subscribers Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-brand-navy/10 border-b-2 border-brand-navy text-[10px] font-black uppercase tracking-wider">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">PHONE NUMBER</th>
                    <th className="p-3">SUBSCRIBED DATE</th>
                    <th className="p-3">DROP STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-navy/15">
                  {waitlistLoading ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-brand-navy/60 uppercase">
                        Loading subscribers...
                      </td>
                    </tr>
                  ) : waitlistEntries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-brand-navy/60 uppercase">
                        No waitlist subscribers recorded for this edition yet.
                      </td>
                    </tr>
                  ) : (
                    waitlistEntries.map((entry, idx) => (
                      <tr key={entry.id || idx} className="hover:bg-brand-navy/5">
                        <td className="p-3 font-bold">{idx + 1}</td>
                        <td className="p-3 font-bold">{entry.phone_number}</td>
                        <td className="p-3 text-brand-navy/70">{fmtDate(entry.created_at)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase border ${
                            entry.notified 
                              ? "bg-green-100 text-green-950 border-green-500" 
                              : "bg-yellow-100 text-yellow-950 border-yellow-500"
                          }`}>
                            {entry.notified ? "DROPPED / NOTIFIED" : "PENDING DROP"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-(--shadow-brut-lg)">
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
                  className="px-2.5 py-1 bg-red-600 text-white text-[11px] font-black uppercase hover:bg-red-700 active:scale-95 transition-all duration-150 cursor-pointer border border-red-700"
                >
                  Delete Permanently
                </button>
                <button
                  onClick={() => setSelectedPaymentLogIds([])}
                  className="px-2.5 py-1 bg-[var(--brand-off-white)] text-[var(--brand-navy-light)] text-[11px] font-black uppercase hover:bg-[var(--brand-navy)]/5 active:scale-95 transition-all duration-150 cursor-pointer border border-[var(--brand-navy)]/20 ml-auto"
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
                        <td className="p-3 font-mono text-[11px] text-[var(--brand-navy)]/60">
                          {fmtDate(log.created_at)}
                        </td>
                        <td className="p-3 font-mono font-bold">{log.mpesa_receipt || "PENDING"}</td>
                        <td className="p-3 font-mono">{log.phone_number || "N/A"}</td>
                        <td className="p-3 font-black text-[var(--brand-navy)]">
                          {log.amount ? `KES ${Number(log.amount).toLocaleString()}` : "N/A"}
                        </td>
                        <td className="p-3">
                          {log.status === "success" ? (
                            <span className="bg-green-100 border border-green-300 text-green-900 font-bold px-2 py-0.5 uppercase text-[11px] w-max block">
                              SUCCESS
                            </span>
                          ) : (
                            <span className="bg-red-100 border border-red-300 text-red-900 font-bold px-2 py-0.5 uppercase text-[11px] w-max block">
                              FAILED
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[11px] max-w-xs truncate" title={log.result_desc}>
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
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Receipt</span>
                          <span className="font-mono font-black text-[var(--brand-navy)] text-sm">{log.mpesa_receipt || "PENDING"}</span>
                        </div>
                        <div>
                          {log.status === "success" ? (
                            <span className="bg-green-100 border border-green-300 text-green-950 font-bold px-2 py-0.5 uppercase text-[11px] w-max block">
                              SUCCESS
                            </span>
                          ) : (
                            <span className="bg-red-100 border border-red-300 text-red-950 font-bold px-2 py-0.5 uppercase text-[11px] w-max block">
                              FAILED
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Phone</span>
                          <span className="font-mono">{log.phone_number || "N/A"}</span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Amount</span>
                          <span className="font-black text-[var(--brand-navy)]">{log.amount ? `KES ${Number(log.amount).toLocaleString()}` : "N/A"}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Date / Time</span>
                          <span className="font-mono text-[var(--brand-navy)]/60">{fmtDate(log.created_at)}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[11px] text-[var(--brand-navy-light)] uppercase font-bold block">Response Message</span>
                          <span className="font-mono text-[11px] text-[var(--brand-navy)]/60 break-words">{log.result_desc || "No message response"}</span>
                        </div>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleDeletePaymentLog(log.id)}
                          className="text-red-600 hover:text-red-800 text-[11px] font-bold uppercase flex items-center gap-0.5"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-3 bg-[var(--brand-bg)]border-t-2 border-[var(--brand-navy)] text-right font-mono text-[11px] text-[var(--brand-navy-light)]">
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
                          <span className="text-[11px] text-[var(--brand-navy-light)]">{pp.buyer_name} · {pp.phone_number}</span>
                        </div>
                        <span className="bg-[var(--brand-warning-bg)] border border-brand-warning text-brand-warning font-bold px-2 py-0.5 uppercase text-[11px]">
                          {pp.status || "PENDING"}
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="font-black">{pp.ticket_type} × {pp.quantity}</span>
                        <span className="font-mono">KES {Number(pp.amount).toLocaleString()}</span>
                        <span className="text-[var(--brand-navy)]/40">{pp.created_at ? fmtDate(pp.created_at) : ""}</span>
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
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }} className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-lg w-full max-h-[90vh] flex flex-col p-6 relative shadow-(--shadow-brut-xl)">
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
                  <label className="text-xs font-black uppercase">Subtitle</label>
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
                  <label className="text-xs font-black uppercase">Event Date</label>
                  <input
                    type="date"
                    value={eventFormState.event_date || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, event_date: e.target.value || null })}
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
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase">Google Maps Pin Link *</label>
                    {eventFormState.maps_url && (
                      <a
                        href={eventFormState.maps_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-mono font-bold text-brand-navy hover:text-brand-accent underline flex items-center gap-0.5"
                      >
                        Test Pin ↗
                      </a>
                    )}
                  </div>
                  <input
                    type="url"
                    required
                    value={eventFormState.maps_url || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, maps_url: e.target.value })}
                    placeholder="https://maps.app.goo.gl/... or dropped pin"
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs font-mono"
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
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase">Payment Contact (for till users)</label>
                  <input
                    type="text"
                    value={eventFormState.payment_contact || ""}
                    onChange={(e) => setEventFormState({ ...eventFormState, payment_contact: e.target.value })}
                    placeholder="e.g. +254 700 000 000"
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
                      <span className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase block">Toggle local checkout bypass simulators on homepage</span>
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
                      <span className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase block">Enable or disable operator broadcast alerts</span>
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
                  <p className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase leading-tight">
                    Available variables: <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{ticketId}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{buyerName}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{phoneNumber}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{pdfUrl}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{eventTitle}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{eventSubtitle}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{eventVenue}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{eventMapsUrl}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{eventRegulations}}'}</code>
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
                  <p className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase leading-tight">
                    Available variables: <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{buyerName}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{ticketType}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{quantity}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{amountPaid}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{reference}}'}</code>
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
                  <p className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase leading-tight">
                    Available variables: <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{buyerName}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{ticketType}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{ticketId}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{scannerName}}'}</code> <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">{'{{scanTime}}'}</code>
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
                  disabled={saving === "event"}
                  className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving === "event" ? <><div className="animate-spin border-2 border-[var(--brand-off-white)] border-t-transparent w-3.5 h-3.5" /> SAVING...</> : <><Save className="w-3.5 h-3.5" /> Save Changes</>}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* TICKET EDIT MODAL */}
      {editingTicket && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }} className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-md w-full p-6 relative shadow-(--shadow-brut-xl)">
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
                        value={ticketFormState.scanned_at ? fmtDate(ticketFormState.scanned_at) : ""}
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
                  disabled={saving === "ticket"}
                  className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving === "ticket" ? <><div className="animate-spin border-2 border-[var(--brand-off-white)] border-t-transparent w-3.5 h-3.5" /> SAVING...</> : <><Save className="w-3.5 h-3.5" /> Save</>}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* CREATE MANUAL TICKET MODAL */}
      {isCreatingTicket && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-md w-full p-6 relative shadow-(--shadow-brut-xl)">
            <button 
              onClick={() => setIsCreatingTicket(false)}
              className="absolute top-4 right-4 p-1 hover:bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]"
            >
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-4">
              {isCrewPass ? "Create Crew Pass" : "Create Manual Ticket"}
            </h3>
            <form onSubmit={handleSaveCreateTicket} className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer pb-1">
                <input
                  type="checkbox"
                  checked={isCrewPass}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsCrewPass(checked);
                    if (checked) {
                      setTicketFormState(prev => ({
                        ...prev,
                        ticket_type: "CREW",
                        amount_paid: 0,
                        mpesa_receipt: "CREW-" + prev.id
                      }));
                    }
                  }}
                  className="w-4 h-4 accent-[var(--brand-navy)]"
                />
                <span className="text-xs font-black uppercase">Crew Pass (no charge)</span>
              </label>
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
                {!isCrewPass && (
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
                )}
                <div>
                  <label className="text-xs font-black uppercase block mb-1">Attendee / Crew Name</label>
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
                {isCrewPass ? (
                  <div>
                    <label className="text-xs font-black uppercase block mb-1">Crew Role</label>
                    <input
                      type="text"
                      required
                      value={ticketFormState.ticket_type || "CREW"}
                      onChange={(e) => setTicketFormState({ ...ticketFormState, ticket_type: e.target.value.toUpperCase() })}
                      placeholder="e.g. SECURITY, BAR, STAGE"
                      className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs"
                    />
                    <div className="mt-1 flex gap-1">
                      {["SECURITY", "BAR", "STAGE", "MEDIA", "VENDOR"].map(role => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setTicketFormState({ ...ticketFormState, ticket_type: "CREW/" + role })}
                          className={`px-2 py-0.5 text-[11px] font-black uppercase border border-[var(--brand-navy)] transition-all duration-150 active:scale-95 ${ticketFormState.ticket_type === "CREW/" + role ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]" : "text-[var(--brand-navy)]"}`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-[var(--brand-navy-light)] font-bold mt-1">KES 0 — not counted in revenue</p>
                  </div>
                ) : (
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
                )}
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
                  disabled={saving === "create"}
                  className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving === "create" ? <><div className="animate-spin border-2 border-[var(--brand-off-white)] border-t-transparent w-3.5 h-3.5" /> CREATING...</> : <><Plus className="w-3.5 h-3.5" /> {isCrewPass ? "Create Crew Pass" : "Create Ticket"}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* CREATE TICKET TIER MODAL */}
      {isCreatingTier && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-lg w-full p-6 relative shadow-(--shadow-brut-xl)">
            <button
              onClick={() => setIsCreatingTier(false)}
              className="absolute top-4 right-4 p-1 hover:bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]"
            >
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-1">
              Add Ticket Tier
            </h3>
            <p className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase mb-4">
              Set date windows for each tier to control when it appears on checkout. Add capacity limits to create scarcity.
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

                            {/* Sale Window & Capacity */}
              <div className="border-2 border-[var(--brand-navy)]/30 p-3 space-y-3 bg-[var(--brand-bg)]">
                <span className="text-[11px] font-black uppercase text-[var(--brand-navy)] tracking-widest block mb-2">
                  Sale Window &amp; Capacity
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-black uppercase block">Available From</label>
                    <input
                      type="datetime-local"
                      value={tierFormState.available_from ? new Date(tierFormState.available_from).toISOString().slice(0, 16) : ""}
                      onChange={(e) => setTierFormState({ ...tierFormState, available_from: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      className="w-full px-2 py-1.5 border-2 border-[var(--brand-navy)] font-bold text-[11px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-black uppercase block">Available Until</label>
                    <input
                      type="datetime-local"
                      value={tierFormState.available_until ? new Date(tierFormState.available_until).toISOString().slice(0, 16) : ""}
                      onChange={(e) => setTierFormState({ ...tierFormState, available_until: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      className="w-full px-2 py-1.5 border-2 border-[var(--brand-navy)] font-bold text-[11px]"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase block">Max Quantity (Capacity)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Leave empty for unlimited"
                    value={tierFormState.max_quantity || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, max_quantity: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-2 py-1.5 border-2 border-[var(--brand-navy)] font-bold text-[11px]"
                  />
                </div>
                <p className="text-[11px] text-[var(--brand-navy)]/50 font-medium">
                  Leave dates empty = always visible. Capacity empty = unlimited.
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
                  disabled={saving === "tier"}
                  className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving === "tier" ? <><div className="animate-spin border-2 border-[var(--brand-off-white)] border-t-transparent w-3.5 h-3.5" /> ADDING...</> : <><Plus className="w-3.5 h-3.5" /> Add Tier</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TICKET TIER MODAL */}
      {editingTier && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-lg w-full p-6 relative shadow-(--shadow-brut-xl)">
            <button
              onClick={() => setEditingTier(null)}
              className="absolute top-4 right-4 p-1 hover:bg-[var(--brand-navy)]/10 text-[var(--brand-navy)]"
            >
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-1">
              Edit Ticket Tier
            </h3>
            <p className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase mb-4">
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

                            {/* Sale Window & Capacity */}
              <div className="border-2 border-[var(--brand-navy)]/30 p-3 space-y-3 bg-[var(--brand-bg)]">
                <span className="text-[11px] font-black uppercase text-[var(--brand-navy)] tracking-widest block mb-2">
                  Sale Window &amp; Capacity
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-black uppercase block">Available From</label>
                    <input
                      type="datetime-local"
                      value={tierFormState.available_from ? new Date(tierFormState.available_from).toISOString().slice(0, 16) : ""}
                      onChange={(e) => setTierFormState({ ...tierFormState, available_from: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      className="w-full px-2 py-1.5 border-2 border-[var(--brand-navy)] font-bold text-[11px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-black uppercase block">Available Until</label>
                    <input
                      type="datetime-local"
                      value={tierFormState.available_until ? new Date(tierFormState.available_until).toISOString().slice(0, 16) : ""}
                      onChange={(e) => setTierFormState({ ...tierFormState, available_until: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      className="w-full px-2 py-1.5 border-2 border-[var(--brand-navy)] font-bold text-[11px]"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase block">Max Quantity (Capacity)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Leave empty for unlimited"
                    value={tierFormState.max_quantity || ""}
                    onChange={(e) => setTierFormState({ ...tierFormState, max_quantity: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-2 py-1.5 border-2 border-[var(--brand-navy)] font-bold text-[11px]"
                  />
                </div>
                <p className="text-[11px] text-[var(--brand-navy)]/50 font-medium">
                  Leave dates empty = always visible. Capacity empty = unlimited.
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
                  disabled={saving === "edit-tier"}
                  className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving === "edit-tier" ? <><div className="animate-spin border-2 border-[var(--brand-off-white)] border-t-transparent w-3.5 h-3.5" /> SAVING...</> : <><Save className="w-3.5 h-3.5" /> Save Changes</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE TICKET CONFIRM MODAL */}
      {deletingTicketId && (
        <div className="fixed inset-0 bg-[var(--brand-navy)]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all duration-200" role="dialog" aria-modal="true" onKeyDown={handleOverlayKeyDown}>
          <div className="border-4 border-red-650 bg-[var(--brand-off-white)] max-w-sm w-full p-6 relative shadow-(--shadow-brut-fire)">
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
          <div className="border-4 border-brand-warning bg-[var(--brand-off-white)] max-w-md w-full p-6 relative shadow-(--shadow-brut-xl-accent)">
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
                <p><span className="font-bold uppercase text-[11px] text-[var(--brand-navy-light)]">Checkout ID</span><br /><span className="font-mono text-xs">{resolvingPayment.checkout_request_id}</span></p>
                <p><span className="font-bold uppercase text-[11px] text-[var(--brand-navy-light)]">Buyer</span><br /><span className="font-black">{resolvingPayment.buyer_name} · {resolvingPayment.phone_number}</span></p>
                <p><span className="font-bold uppercase text-[11px] text-[var(--brand-navy-light)]">Tickets</span><br /><span>{resolvingPayment.ticket_type} × {resolvingPayment.quantity} = KES {Number(resolvingPayment.amount).toLocaleString()}</span></p>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-black uppercase text-[var(--brand-navy)]/60">M-Pesa Receipt Code</label>
                <input
                  type="text"
                  value={resolveReceipt}
                  onChange={(e) => setResolveReceipt(e.target.value.toUpperCase())}
                  placeholder="e.g. PGI1ABC2D3"
                  className="w-full border-2 border-[var(--brand-navy)] px-3 py-2 font-mono text-sm bg-[var(--brand-off-white)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-black uppercase text-[var(--brand-navy)]/60">Amount Paid (KES)</label>
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
          <div className="border-4 border-red-650 bg-[var(--brand-off-white)] max-w-sm w-full p-6 relative shadow-(--shadow-brut-fire)">
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
          <div className="border-4 border-red-650 bg-[var(--brand-off-white)] max-w-sm w-full p-6 relative shadow-(--shadow-brut-fire)">
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
                <label className="block text-[11px] font-black uppercase text-[var(--brand-navy)]/60 mb-1">Admin Password</label>
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
          <div className="border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] max-w-sm w-full p-6 relative shadow-(--shadow-brut-xl)">
            <h3 className="text-lg font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-700" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0z"/></svg>
              Resend WhatsApp Ticket
            </h3>
            <p className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase mb-3">
              Ticket: <span className="font-mono text-[var(--brand-navy)]">{resendTicket.id}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-black uppercase block mb-1">Phone Number</label>
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

      <div className="max-w-4xl mx-auto text-center mt-12 mb-8 text-[11px] text-[var(--brand-navy-light)] font-bold tracking-widest uppercase">
        © {new Date().getFullYear()} {(eventDetails?.footer_title || eventDetails?.title || "GOODLIFE").toUpperCase()} · SECURED TRANSACTION CHANNELS
      </div>

    </div>
  );
}


