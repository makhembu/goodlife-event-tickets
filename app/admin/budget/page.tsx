"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart,
  Calendar,
  RefreshCw,
  Plus,
  Download,
  Trash2,
  Edit2,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt,
  ExternalLink,
  X,
  Search,
  Filter,
  Layers,
  HelpCircle,
  Building,
  Radio,
  Music,
  Shield,
  Megaphone,
  Truck,
  Beer,
  Box,
  Image as ImageIcon,
  Store,
  Users
} from "lucide-react";
import PosterUploader from "@/components/admin/PosterUploader";

export interface ExpenseItem {
  id: number;
  event_id: number;
  event_title?: string;
  vendor_id?: number | null;
  vendor_name?: string | null;
  operator_id?: number | null;
  operator_name?: string | null;
  expense_type?: "overhead" | "vendor_cogs" | "vendor_advance" | "staff_payout" | string;
  title: string;
  category: string;
  amount: number;
  status: "paid" | "pending" | "planned" | "quoted" | "cancelled" | string;
  payment_method: string;
  recipient?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
  paid_at?: string;
  created_at?: string;
}

export interface BudgetSummary {
  event_id: number;
  event_title: string;
  budget_allocated: number;
  total_expenses: number;
  paid_expenses: number;
  pending_expenses: number;
  planned_expenses: number;
  unallocated_budget?: number;
  over_budget_amount?: number;
  ticket_revenue: number;
  realized_profit_or_loss?: number;
  projected_profit_or_loss?: number;
  net_profit_or_loss: number;
  break_even_progress_pct: number;
  expenses_by_category: Record<string, number>;
}

const CATEGORIES = [
  { id: "venue", label: "Venue & Grounds", icon: Building, color: "bg-amber-100 text-amber-900 border-amber-800" },
  { id: "sound_stage", label: "Sound & Stage", icon: Radio, color: "bg-purple-100 text-purple-900 border-purple-800" },
  { id: "artists", label: "Artists & DJs", icon: Music, color: "bg-pink-100 text-pink-900 border-pink-800" },
  { id: "permits_security", label: "Permits & Security", icon: Shield, color: "bg-blue-100 text-blue-900 border-blue-800" },
  { id: "marketing", label: "Marketing & Promo", icon: Megaphone, color: "bg-yellow-100 text-yellow-900 border-yellow-800" },
  { id: "logistics", label: "Logistics & Fuel", icon: Truck, color: "bg-cyan-100 text-cyan-900 border-cyan-800" },
  { id: "inventory", label: "Bar & Stock", icon: Beer, color: "bg-emerald-100 text-emerald-900 border-emerald-800" },
  { id: "other", label: "Other / Misc", icon: Box, color: "bg-gray-100 text-gray-900 border-gray-800" },
];

export default function AdminBudgetPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Bulk Selection & Operation State
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<number[]>([]);
  const [bulkOperating, setBulkOperating] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Fork / Clone Budget Modal State
  const [showForkModal, setShowForkModal] = useState(false);
  const [forkSourceEventId, setForkSourceEventId] = useState<string>("");
  const [forkCopyBudgetCap, setForkCopyBudgetCap] = useState(true);
  const [forking, setForking] = useState(false);

  // Unified Event Vendors & Staff Operators State
  const [eventVendors, setEventVendors] = useState<any[]>([]);
  const [vendorOperators, setVendorOperators] = useState<any[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Active Overview Tab ('overview' or 'vendors')
  const [activeFinanceTab, setActiveFinanceTab] = useState<"overview" | "stalls">("overview");

  // Form State for Expense
  const [formData, setFormData] = useState({
    event_id: "",
    vendor_id: "",
    operator_id: "",
    expense_type: "overhead",
    title: "",
    category: "venue",
    amount: "",
    status: "paid",
    payment_method: "mpesa",
    recipient: "",
    notes: "",
    receipt_url: "",
    paid_at: new Date().toISOString().split("T")[0],
  });

  // Lightbox for receipt
  const [activeReceiptUrl, setActiveReceiptUrl] = useState<string | null>(null);

  // Select event handler with URL sync
  const handleSelectEvent = (newId: string) => {
    setSelectedEventId(newId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("eventId", newId);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // Load events & sync initial event from URL
  useEffect(() => {
    fetch("/api/events")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setEvents(data);
          let targetId = "";
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const qId = params.get("eventId") || params.get("event");
            if (qId && data.some((e: any) => e.id.toString() === qId)) {
              targetId = qId;
            }
          }
          if (!targetId) {
            const active = data.find((e: any) => e.is_active) || data[0];
            if (active) targetId = active.id.toString();
          }
          if (targetId) {
            setSelectedEventId(targetId);
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.set("eventId", targetId);
              window.history.replaceState({}, "", url.toString());
            }
          }
        }
      })
      .catch((err) => console.error("Error loading events:", err));
  }, []);

  const loadData = (eventId?: string) => {
    const target = eventId !== undefined ? eventId : selectedEventId;
    if (!target) return;
    setLoading(true);

    const ts = Date.now();
    Promise.all([
      fetch(`/api/admin/budget?eventId=${target}&_t=${ts}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/admin/expenses?eventId=${target}&_t=${ts}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([summaryData, expensesData]) => {
        if (summaryData && !summaryData.error) {
          setSummary(summaryData);
          setBudgetInput(summaryData.budget_allocated ? summaryData.budget_allocated.toString() : "0");
        } else {
          setSummary(null);
        }
        setExpenses(Array.isArray(expensesData) ? expensesData : []);
      })
      .catch((err) => {
        console.error("Error loading budget data:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (selectedEventId) {
      loadData(selectedEventId);
      // Fetch assigned vendors for this event
      setLoadingVendors(true);
      fetch(`/api/admin/events/${selectedEventId}/vendors`)
        .then((res) => res.json())
        .then((data) => {
          setEventVendors(Array.isArray(data) ? data : []);
        })
        .catch(() => setEventVendors([]))
        .finally(() => setLoadingVendors(false));
    }
  }, [selectedEventId]);

  // Load operators when vendor changes in form
  useEffect(() => {
    if (formData.vendor_id) {
      fetch(`/api/admin/vendors/${formData.vendor_id}/operators`)
        .then((res) => res.json())
        .then((data) => {
          setVendorOperators(data.operators || data || []);
        })
        .catch(() => setVendorOperators([]));
    } else {
      setVendorOperators([]);
    }
  }, [formData.vendor_id]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
      if (selectedStatus !== "all") {
        if (selectedStatus === "quoted" && item.status !== "quoted" && item.status !== "planned") return false;
        if (selectedStatus === "planned" && item.status !== "planned" && item.status !== "quoted") return false;
        if (selectedStatus !== "quoted" && selectedStatus !== "planned" && item.status !== selectedStatus) return false;
      }
      if (selectedVendorFilter !== "all") {
        if (selectedVendorFilter === "overhead") {
          if (item.vendor_id) return false;
        } else {
          if (!item.vendor_id || item.vendor_id.toString() !== selectedVendorFilter) return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchRecipient = (item.recipient || "").toLowerCase().includes(q);
        const matchNotes = (item.notes || "").toLowerCase().includes(q);
        const matchVendor = (item.vendor_name || "").toLowerCase().includes(q);
        const matchOperator = (item.operator_name || "").toLowerCase().includes(q);
        if (!matchTitle && !matchRecipient && !matchNotes && !matchVendor && !matchOperator) return false;
      }
      return true;
    });
  }, [expenses, selectedCategory, selectedStatus, selectedVendorFilter, searchQuery]);

  // Total of filtered items
  const filteredTotal = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [filteredExpenses]);

  // Total of selected items
  const selectedTotal = useMemo(() => {
    return expenses
      .filter((e) => selectedExpenseIds.includes(e.id))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses, selectedExpenseIds]);

  const isAllSelected = filteredExpenses.length > 0 && filteredExpenses.every((item) => selectedExpenseIds.includes(item.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedExpenseIds([]);
    } else {
      setSelectedExpenseIds(filteredExpenses.map((item) => item.id));
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedExpenseIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Inline single-row status change
  const handleInlineStatusChange = async (id: number, newStatus: string) => {
    // Optimistic update
    setExpenses((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );

    try {
      const res = await fetch(`/api/admin/expenses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        alert("Failed to update status");
      }
      loadData();
    } catch (err: any) {
      alert(err.message || "Network error updating status");
      loadData();
    }
  };

  // Bulk status update
  const handleBulkStatus = async (status: string) => {
    if (selectedExpenseIds.length === 0 || bulkOperating) return;
    setBulkOperating(true);
    try {
      setExpenses((prev) =>
        prev.map((e) => (selectedExpenseIds.includes(e.id) ? { ...e, status } : e))
      );
      const res = await fetch("/api/admin/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", ids: selectedExpenseIds, status }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Failed to update selected expenses");
      } else {
        setSelectedExpenseIds([]);
      }
      loadData();
    } catch (err: any) {
      alert(err.message || "Network error updating bulk status");
    } finally {
      setBulkOperating(false);
    }
  };

  // Bulk category update
  const handleBulkCategory = async (category: string) => {
    if (selectedExpenseIds.length === 0 || bulkOperating || !category) return;
    setBulkOperating(true);
    try {
      setExpenses((prev) =>
        prev.map((e) => (selectedExpenseIds.includes(e.id) ? { ...e, category } : e))
      );
      const res = await fetch("/api/admin/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_category", ids: selectedExpenseIds, category }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Failed to update category for selected expenses");
      } else {
        setSelectedExpenseIds([]);
      }
      loadData();
    } catch (err: any) {
      alert(err.message || "Network error updating bulk category");
    } finally {
      setBulkOperating(false);
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedExpenseIds.length === 0 || bulkOperating) return;
    if (
      !confirm(
        `Are you sure you want to permanently delete ${selectedExpenseIds.length} expense records totaling KES ${selectedTotal.toLocaleString()}?`
      )
    ) {
      return;
    }
    setBulkOperating(true);
    try {
      setExpenses((prev) => prev.filter((e) => !selectedExpenseIds.includes(e.id)));
      const res = await fetch("/api/admin/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: selectedExpenseIds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Failed to delete selected expenses");
      } else {
        setSelectedExpenseIds([]);
      }
      loadData();
    } catch (err: any) {
      alert(err.message || "Network error deleting selected expenses");
    } finally {
      setBulkOperating(false);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      alert("No expenses to export.");
      return;
    }

    const headers = [
      "ID", 
      "Event", 
      "Date", 
      "Category", 
      "Title", 
      "Vendor / Department", 
      "Classification", 
      "Cashier / Operator", 
      "Recipient / Payee", 
      "Amount (KES)", 
      "Status", 
      "Payment Method", 
      "Notes", 
      "Receipt URL"
    ];
    const rows = filteredExpenses.map((e) => [
      e.id,
      `"${(e.event_title || "").replace(/"/g, '""')}"`,
      e.paid_at ? e.paid_at.substring(0, 10) : "",
      `"${e.category}"`,
      `"${e.title.replace(/"/g, '""')}"`,
      `"${(e.vendor_name || "Festival Overhead").replace(/"/g, '""')}"`,
      `"${(e.expense_type || "overhead").replace(/"/g, '""')}"`,
      `"${(e.operator_name || "").replace(/"/g, '""')}"`,
      `"${(e.recipient || "").replace(/"/g, '""')}"`,
      e.amount,
      e.status,
      e.payment_method,
      `"${(e.notes || "").replace(/"/g, '""')}"`,
      `"${e.receipt_url || ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const eventName = summary?.event_title ? summary.event_title.replace(/[^a-z0-9]/gi, "-").toLowerCase() : "event";
    link.setAttribute("download", `goodlife-finances-${eventName}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Save budget
  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || submitting) return;
    const num = Number(budgetInput);
    if (isNaN(num) || num < 0) {
      alert("Please enter a valid non-negative budget amount.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: Number(selectedEventId),
          budgetAllocated: num,
        }),
      });

      if (res.ok) {
        setShowBudgetModal(false);
        loadData();
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Failed to update budget");
      }
    } catch (err: any) {
      alert(err.message || "Network error updating budget");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit new or edit expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const numAmount = Number(formData.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Please enter a valid expense amount greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const resolvedEventId = Number(formData.event_id) || editingExpense?.event_id || (selectedEventId && selectedEventId !== "all" ? Number(selectedEventId) : (events[0]?.id || 2));

      const payload = {
        event_id: resolvedEventId,
        vendor_id: formData.vendor_id ? Number(formData.vendor_id) : null,
        operator_id: formData.operator_id ? Number(formData.operator_id) : null,
        expense_type: formData.expense_type || 'overhead',
        title: formData.title.trim(),
        category: formData.category,
        amount: numAmount,
        status: (formData.status || "paid").trim().toLowerCase(),
        payment_method: formData.payment_method,
        recipient: formData.recipient.trim() || null,
        notes: formData.notes.trim() || null,
        receipt_url: formData.receipt_url.trim() || null,
        paid_at: formData.paid_at || null,
      };

      let res: Response;
      if (editingExpense) {
        res = await fetch(`/api/admin/expenses/${editingExpense.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/admin/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        const savedItem = json.expense || json;
        if (savedItem && savedItem.id) {
          setExpenses((prev) => {
            const exists = prev.some((item) => item.id === savedItem.id);
            if (exists) {
              return prev.map((item) =>
                item.id === savedItem.id
                  ? { ...item, ...savedItem, amount: Number(savedItem.amount) }
                  : item
              );
            } else {
              return [savedItem, ...prev];
            }
          });
        }
        setShowAddModal(false);
        setEditingExpense(null);
        resetForm();
        loadData();
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "Failed to save expense");
      }
    } catch (err: any) {
      alert(err.message || "Network error saving expense");
    } finally {
      setSubmitting(false);
    }
  };

  // Fork / Clone Budget from Another Event
  const handleForkBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forkSourceEventId || !selectedEventId || forking) return;
    if (forkSourceEventId === selectedEventId) {
      alert("Source and destination event editions must be different.");
      return;
    }

    setForking(true);
    try {
      const res = await fetch("/api/admin/expenses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clone_event",
          from_event_id: Number(forkSourceEventId),
          to_event_id: Number(selectedEventId),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || "Failed to clone event budget");
        return;
      }

      // If requested, also copy the initial budget target cap
      if (forkCopyBudgetCap) {
        const sourceBudgetRes = await fetch(`/api/admin/budget?eventId=${forkSourceEventId}`);
        if (sourceBudgetRes.ok) {
          const sourceBudgetData = await sourceBudgetRes.json();
          if (sourceBudgetData && sourceBudgetData.budget_allocated > 0) {
            await fetch("/api/admin/budget", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                eventId: Number(selectedEventId),
                budgetAllocated: Number(sourceBudgetData.budget_allocated),
              }),
            });
          }
        }
      }

      setShowForkModal(false);
      alert(`Fork complete! Copied ${json.cloned_count || 0} line items into this edition.`);
      loadData(selectedEventId);
    } catch (err: any) {
      alert(err.message || "Network error while forking budget");
    } finally {
      setForking(false);
    }
  };

  // Delete expense
  const handleDeleteExpense = async (id: number) => {
    if (!confirm("Are you sure you want to delete this expense record?")) return;
    try {
      const res = await fetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadData();
      } else {
        alert("Failed to delete expense");
      }
    } catch (err: any) {
      alert(err.message || "Network error deleting expense");
    }
  };

  const openEditModal = (item: ExpenseItem) => {
    setEditingExpense(item);
    setFormData({
      event_id: (item.event_id || selectedEventId || (events[0]?.id ? events[0].id.toString() : "2")).toString(),
      vendor_id: item.vendor_id ? item.vendor_id.toString() : "",
      operator_id: item.operator_id ? item.operator_id.toString() : "",
      expense_type: item.expense_type || (item.vendor_id ? "vendor_cogs" : "overhead"),
      title: item.title,
      category: item.category,
      amount: item.amount.toString(),
      status: item.status,
      payment_method: item.payment_method || "mpesa",
      recipient: item.recipient || "",
      notes: item.notes || "",
      receipt_url: item.receipt_url || "",
      paid_at: item.paid_at ? item.paid_at.substring(0, 10) : new Date().toISOString().split("T")[0],
    });
    setShowAddModal(true);
  };

  const resetForm = () => {
    setFormData({
      event_id: selectedEventId || (events[0]?.id ? events[0].id.toString() : "2"),
      vendor_id: "",
      operator_id: "",
      expense_type: "overhead",
      title: "",
      category: "venue",
      amount: "",
      status: "paid",
      payment_method: "mpesa",
      recipient: "",
      notes: "",
      receipt_url: "",
      paid_at: new Date().toISOString().split("T")[0],
    });
  };

  // Category Helper
  const getCategoryMeta = (catId: string) => {
    return CATEGORIES.find((c) => c.id === catId) || { label: catId, color: "bg-gray-100 text-gray-900 border-gray-800", icon: Box };
  };

  const budgetAllocated = summary?.budget_allocated || 0;
  const totalExpenses = summary?.total_expenses || 0;
  const paidExpenses = summary?.paid_expenses || 0;
  const pendingExpenses = summary?.pending_expenses || 0;
  const plannedExpenses = summary?.planned_expenses || 0;

  const unallocatedBudget = summary?.unallocated_budget !== undefined 
    ? summary.unallocated_budget 
    : Math.max(0, budgetAllocated - totalExpenses);
  const overBudgetAmount = summary?.over_budget_amount !== undefined 
    ? summary.over_budget_amount 
    : (totalExpenses > budgetAllocated && budgetAllocated > 0 ? totalExpenses - budgetAllocated : 0);

  const ticketRevenue = summary?.ticket_revenue || 0;

  // Dual P&L
  const realizedProfitOrLoss = summary?.realized_profit_or_loss !== undefined
    ? summary.realized_profit_or_loss
    : ticketRevenue - paidExpenses;
  const isRealizedProfitable = realizedProfitOrLoss >= 0;

  const projectedProfitOrLoss = summary?.projected_profit_or_loss !== undefined
    ? summary.projected_profit_or_loss
    : ticketRevenue - totalExpenses;
  const isProjectedProfitable = projectedProfitOrLoss >= 0;

  const budgetAllocatedPct = budgetAllocated > 0 ? Math.round((totalExpenses / budgetAllocated) * 100) : 0;
  const isOverBudget = budgetAllocated > 0 && totalExpenses > budgetAllocated;

  // Stacking percentages relative to budget cap (or total if cap is 0)
  const baseDenominator = budgetAllocated > 0 ? budgetAllocated : (totalExpenses > 0 ? totalExpenses : 1);
  const paidPct = Math.min(100, Math.round((paidExpenses / baseDenominator) * 100));
  const pendingPct = Math.min(100 - paidPct, Math.round((pendingExpenses / baseDenominator) * 100));
  const plannedPct = Math.min(100 - (paidPct + pendingPct), Math.round((plannedExpenses / baseDenominator) * 100));

  return (
    <div className="w-full min-h-screen bg-brand-off-white text-brand-navy p-4 md:p-6 font-mono">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b-4 border-brand-navy pb-4 gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/dashboard"
              className="text-brand-navy hover:bg-brand-accent p-2 border-2 border-brand-navy font-bold uppercase transition-colors shadow-(--shadow-brut-xs)"
            >
              &larr; Dashboard
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-display uppercase flex items-center gap-2">
                <DollarSign className="w-7 h-7 text-brand-navy" /> Event Finances & P&L
              </h1>
              <p className="text-xs text-brand-navy/60 font-bold uppercase mt-0.5">
                Unified Event Budget, Commercial Stalls, Payroll & Dual P&L
              </p>
            </div>
          </div>

          {/* Quick Sub-navigation & Controls */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Link
              href="/admin/settlements"
              className="px-2.5 py-1.5 border-2 border-brand-navy bg-white hover:bg-brand-accent text-xs font-bold uppercase transition-colors shadow-(--shadow-brut-xs)"
            >
              Settlements
            </Link>

            {events.length > 0 && (
              <div className="flex items-center gap-1.5 border-2 border-brand-navy bg-white px-2 py-1 shadow-(--shadow-brut-xs)">
                <Calendar className="w-4 h-4 text-brand-navy/60" />
                <select
                  value={selectedEventId}
                  onChange={(e) => handleSelectEvent(e.target.value)}
                  className="font-bold text-xs uppercase bg-transparent outline-none cursor-pointer"
                >
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id.toString()}>
                      {evt.title} {evt.is_active ? "(LIVE)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {events.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const other = events.find((e) => e.id.toString() !== selectedEventId);
                  if (other) setForkSourceEventId(other.id.toString());
                  setShowForkModal(true);
                }}
                className="px-2.5 py-1.5 border-2 border-brand-navy bg-white hover:bg-brand-accent text-xs font-bold uppercase transition-colors shadow-(--shadow-brut-xs) cursor-pointer flex items-center gap-1.5"
                title="Fork / clone budget line items from a previous edition"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Fork Budget</span>
              </button>
            )}

            <button
              onClick={() => loadData()}
              className="p-2 border-2 border-brand-navy bg-white hover:bg-brand-accent transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={() => {
                resetForm();
                setEditingExpense(null);
                setShowAddModal(true);
              }}
              className="px-3 py-1.5 border-2 border-brand-navy bg-brand-accent hover:bg-brand-accent/80 font-bold text-xs uppercase transition-all shadow-(--shadow-brut-xs) cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Log Expense</span>
            </button>
          </div>
        </div>

        {/* View Mode Switcher: Event Overall vs Stall Unit Economics */}
        <div className="flex border-4 border-brand-navy bg-white shadow-(--shadow-brut-xs)">
          <button
            type="button"
            onClick={() => setActiveFinanceTab("overview")}
            className={`flex-1 py-2 text-xs font-black uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              activeFinanceTab === "overview"
                ? "bg-brand-navy text-brand-off-white"
                : "bg-white text-brand-navy hover:bg-brand-accent/30"
            }`}
          >
            <PieChart className="w-4 h-4" />
            <span>Festival Overall Finances & P&L</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFinanceTab("stalls")}
            className={`flex-1 py-2 text-xs font-black uppercase flex items-center justify-center gap-2 border-l-4 border-brand-navy transition-colors cursor-pointer ${
              activeFinanceTab === "stalls"
                ? "bg-brand-navy text-brand-off-white"
                : "bg-white text-brand-navy hover:bg-brand-accent/30"
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Commercial Stalls Unit Economics ({eventVendors.length})</span>
          </button>
        </div>

        {/* Commercial Stalls Unit Economics View */}
        {activeFinanceTab === "stalls" && (
          <div className="border-4 border-brand-navy bg-white p-4 shadow-(--shadow-brut-sm) space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-brand-navy pb-3 gap-2">
              <div>
                <h2 className="text-base font-display uppercase flex items-center gap-2">
                  <Store className="w-5 h-5 text-brand-navy" /> Vendor Stalls Profitability & COGS Audit
                </h2>
                <p className="text-xs text-brand-navy/60 font-bold uppercase mt-0.5">
                  Direct Stall Supplies, POS Gross Revenue, Festival Commission & Net Margins
                </p>
              </div>
              <Link
                href="/admin/settlements"
                className="px-2.5 py-1 text-xs font-black uppercase bg-brand-accent text-brand-navy border-2 border-brand-navy self-start sm:self-auto hover:bg-yellow-300 transition-colors shadow-(--shadow-brut-xs)"
              >
                Go to Settlements &rarr;
              </Link>
            </div>

            {eventVendors.length === 0 ? (
              <div className="p-8 text-center text-xs text-brand-navy/60 font-bold uppercase border-2 border-dashed border-brand-navy/30">
                No vendors assigned to this event edition yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {eventVendors.map((vendor) => {
                  const vendorExp = expenses.filter(
                    (e) => e.vendor_id === vendor.id && e.status !== "cancelled"
                  );
                  const totalStallExpenses = vendorExp.reduce(
                    (sum, e) => sum + (Number(e.amount) || 0),
                    0
                  );
                  const totalGrossSales = Number(vendor.total_sales || 0);
                  const commRate = Number(vendor.commission_rate || 10);
                  const commissionOwed = Math.round((totalGrossSales * commRate) / 100);
                  const vendorNetTakehome = totalGrossSales - commissionOwed - totalStallExpenses;

                  return (
                    <div
                      key={vendor.id}
                      className="border-2 border-brand-navy p-3 bg-brand-off-white shadow-(--shadow-brut-xs) flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 border-b border-brand-navy/20 pb-2">
                          <div>
                            <h3 className="font-bold text-sm text-brand-navy">{vendor.name}</h3>
                            <p className="text-[10px] text-brand-navy/60 font-mono">
                              Rate: {commRate}% Commission
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVendorFilter(vendor.id.toString());
                              setActiveFinanceTab("overview");
                            }}
                            className="text-[9px] font-black uppercase px-1.5 py-0.5 border border-brand-navy bg-white hover:bg-brand-accent text-brand-navy cursor-pointer"
                            title="Filter expenses for this vendor"
                          >
                            View Items &rarr;
                          </button>
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs font-mono">
                          <div className="flex justify-between">
                            <span className="text-[10px] uppercase font-bold text-brand-navy/70">Gross POS Revenue:</span>
                            <span className="font-bold text-brand-navy">KES {totalGrossSales.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[10px] uppercase font-bold text-brand-navy/70">Festival Cut ({commRate}%):</span>
                            <span className="font-bold text-brand-navy/80">KES {commissionOwed.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[10px] uppercase font-bold text-red-600">Stall Costs / Advances:</span>
                            <span className="font-bold text-red-600">KES {totalStallExpenses.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between pt-1.5 border-t border-brand-navy/20 font-black">
                            <span className="text-[10px] uppercase text-brand-navy">Net Margin:</span>
                            <span
                              className={`text-sm ${
                                vendorNetTakehome >= 0 ? "text-emerald-700" : "text-red-600"
                              }`}
                            >
                              {vendorNetTakehome >= 0 ? "+" : ""}KES {vendorNetTakehome.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-brand-navy/20 flex items-center justify-between text-[10px]">
                        <span className="text-brand-navy/60 font-mono">
                          {vendorExp.length} {vendorExp.length === 1 ? "expense" : "expenses"} logged
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              vendor_id: vendor.id.toString(),
                              category: "inventory",
                              expense_type: "vendor_cogs",
                              title: `Supplies for ${vendor.name}`,
                            });
                            setShowAddModal(true);
                          }}
                          className="px-2 py-0.5 border border-brand-navy bg-brand-accent font-bold uppercase text-[9px] hover:bg-yellow-300 cursor-pointer"
                        >
                          + Log Expense
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* KPI Dashboard Cards: 3-Tier Budget Model & Dual P&L */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* Card 1: Initial Budget Cap & Earmarked */}
          <div className="border-4 border-brand-navy p-3 md:p-4 bg-white shadow-(--shadow-brut-sm) flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-brand-navy/60">Initial Budget Cap</p>
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(true)}
                  className="text-[10px] font-bold uppercase underline hover:text-brand-accent text-brand-navy cursor-pointer flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" /> Set Cap
                </button>
              </div>
              <p className="text-xl md:text-2xl font-bold font-mono text-brand-navy mt-1">
                KES {budgetAllocated.toLocaleString()}
              </p>
            </div>

            <div className="mt-3 pt-2 border-t border-brand-navy/20 space-y-1 text-[11px]">
              <div className="flex justify-between items-center text-brand-navy/80">
                <span className="uppercase text-[10px] font-bold">Earmarked:</span>
                <span className="font-mono font-bold">KES {totalExpenses.toLocaleString()} ({budgetAllocatedPct}%)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="uppercase text-[10px] font-bold text-brand-navy/60">Unallocated:</span>
                {unallocatedBudget > 0 ? (
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1 border border-emerald-300">
                    KES {unallocatedBudget.toLocaleString()}
                  </span>
                ) : overBudgetAmount > 0 ? (
                  <span className="font-mono font-bold text-red-600 bg-red-50 px-1 border border-red-300">
                    KES {overBudgetAmount.toLocaleString()} OVER
                  </span>
                ) : (
                  <span className="font-mono font-bold text-brand-navy/60">0</span>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Cash Disbursed & Multi-Tier Allocation */}
          <div className={`border-4 border-brand-navy p-3 md:p-4 bg-white shadow-(--shadow-brut-sm) flex flex-col justify-between ${isOverBudget ? "bg-red-50" : ""}`}>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-brand-navy/60">Cash Disbursed</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 border border-brand-navy bg-emerald-100 text-emerald-900">
                  {paidExpenses > 0 ? `KES ${paidExpenses.toLocaleString()} OUT` : "0 PAID"}
                </span>
              </div>
              <p className="text-xl md:text-2xl font-bold font-mono mt-1 text-emerald-800">
                KES {paidExpenses.toLocaleString()}
              </p>

              {/* Segmented Progress Bar */}
              <div className="w-full bg-gray-200 h-2.5 border border-brand-navy mt-2 flex overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: `${paidPct}%` }}
                  title={`Paid: KES ${paidExpenses.toLocaleString()} (${paidPct}%)`}
                />
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{ width: `${pendingPct}%` }}
                  title={`Pending: KES ${pendingExpenses.toLocaleString()} (${pendingPct}%)`}
                />
                <div
                  className="bg-blue-500 h-full transition-all"
                  style={{ width: `${plannedPct}%` }}
                  title={`Planned: KES ${plannedExpenses.toLocaleString()} (${plannedPct}%)`}
                />
              </div>
            </div>

            {/* Breakdown Chips */}
            <div className="mt-3 pt-2 border-t border-brand-navy/20 flex flex-wrap items-center gap-1 text-[9px] font-black uppercase font-mono">
              <span className="px-1 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-400">
                Paid: {paidExpenses > 1000 ? `${Math.round(paidExpenses / 1000)}k` : paidExpenses}
              </span>
              <span className="px-1 py-0.5 bg-amber-100 text-amber-900 border border-amber-400">
                Pend: {pendingExpenses > 1000 ? `${Math.round(pendingExpenses / 1000)}k` : pendingExpenses}
              </span>
              <span className="px-1 py-0.5 bg-blue-100 text-blue-900 border border-blue-400">
                Plan: {plannedExpenses > 1000 ? `${Math.round(plannedExpenses / 1000)}k` : plannedExpenses}
              </span>
            </div>
          </div>

          {/* Card 3: Ticket Sales Inflow */}
          <div className="border-4 border-brand-navy p-3 md:p-4 bg-white shadow-(--shadow-brut-sm) flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-brand-navy/60">Ticket Revenue</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 border border-brand-navy bg-emerald-100 text-emerald-900">
                  LIVE INFLOW
                </span>
              </div>
              <p className="text-xl md:text-2xl font-bold font-mono text-emerald-700 mt-1">
                KES {ticketRevenue.toLocaleString()}
              </p>
            </div>

            <div className="mt-3 pt-2 border-t border-brand-navy/20 space-y-1 text-[11px]">
              <div className="flex justify-between items-center text-brand-navy/80">
                <span className="uppercase text-[10px] font-bold">Source:</span>
                <span className="font-bold">Verified Ticket Sales</span>
              </div>
              <div className="flex justify-between items-center text-brand-navy/60">
                <span className="uppercase text-[10px] font-bold">Cost Coverage:</span>
                <span className="font-mono font-bold text-brand-navy">
                  {summary?.break_even_progress_pct || 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Dual Net P&L (Cash in Hand vs Projected) */}
          <div className={`border-4 border-brand-navy p-3 md:p-4 shadow-(--shadow-brut-sm) flex flex-col justify-between ${isProjectedProfitable ? "bg-emerald-50" : "bg-amber-50"}`}>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase font-bold text-brand-navy/60">Net P&L Position</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 border border-brand-navy flex items-center gap-1 ${isProjectedProfitable ? "bg-emerald-600 text-white" : "bg-amber-500 text-brand-navy"}`}>
                  {isProjectedProfitable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {isProjectedProfitable ? "PROFIT" : "DEFICIT"}
                </span>
              </div>

              {/* Dual Numbers */}
              <div className="mt-2 space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] font-bold uppercase text-brand-navy/70">Realized Cash:</span>
                  <span className={`font-mono font-black text-sm ${isRealizedProfitable ? "text-emerald-700" : "text-amber-700"}`}>
                    {isRealizedProfitable ? "+" : ""}KES {realizedProfitOrLoss.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-1 border-t border-brand-navy/20">
                  <span className="text-[10px] font-bold uppercase text-brand-navy">Projected Net:</span>
                  <span className={`font-mono font-black text-base ${isProjectedProfitable ? "text-emerald-700" : "text-red-600"}`}>
                    {isProjectedProfitable ? "+" : ""}KES {projectedProfitOrLoss.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-brand-navy/70 uppercase mt-2 pt-1 border-t border-brand-navy/15">
              {isProjectedProfitable
                ? "All budgeted costs covered by ticket sales"
                : `Need KES ${Math.abs(projectedProfitOrLoss).toLocaleString()} to break even`}
            </p>
          </div>
        </div>

        {/* Category Spending Breakdown */}
        {summary && Object.keys(summary.expenses_by_category).length > 0 && (
          <div className="border-4 border-brand-navy bg-white p-4 shadow-(--shadow-brut-sm) space-y-3">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2">
              <h2 className="text-sm font-bold uppercase flex items-center gap-2">
                <PieChart className="w-4 h-4 text-brand-navy" /> Spending by Department
              </h2>
              <span className="text-[10px] font-bold text-brand-navy/60 uppercase">
                {CATEGORIES.filter((c) => summary.expenses_by_category[c.id]).length} active categories
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {CATEGORIES.map((cat) => {
                const amt = summary.expenses_by_category[cat.id] || 0;
                const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
                const Icon = cat.icon;
                return (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCategory(selectedCategory === cat.id ? "all" : cat.id)}
                    className={`border-2 p-2 flex flex-col justify-between cursor-pointer transition-all ${
                      selectedCategory === cat.id
                        ? "border-brand-navy bg-brand-accent shadow-(--shadow-brut-xs)"
                        : "border-brand-navy/40 bg-brand-off-white hover:border-brand-navy"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Icon className="w-3.5 h-3.5 text-brand-navy/80" />
                      <span className="text-[9px] font-bold text-brand-navy/60">{pct}%</span>
                    </div>
                    <p className="text-[10px] font-bold uppercase truncate" title={cat.label}>
                      {cat.label}
                    </p>
                    <p className="text-xs font-bold font-mono text-brand-navy mt-1">
                      KES {amt.toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Expense Filters & Actions Bar */}
        <div className="border-4 border-brand-navy bg-white p-3 md:p-4 shadow-(--shadow-brut-sm) space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-brand-navy/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search expense description, payee, notes..."
                className="w-full pl-9 pr-3 py-1.5 border-2 border-brand-navy bg-brand-off-white text-xs font-bold focus:outline-none focus:bg-white"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase text-brand-navy/60 hidden sm:inline">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="p-1.5 border-2 border-brand-navy bg-brand-off-white text-xs font-bold uppercase outline-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="paid">Paid Only</option>
                <option value="pending">Pending</option>
                <option value="planned">Planned</option>
              </select>
            </div>

            {/* Vendor / Department Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase text-brand-navy/60 hidden sm:inline">Stall:</span>
              <select
                value={selectedVendorFilter}
                onChange={(e) => setSelectedVendorFilter(e.target.value)}
                className="p-1.5 border-2 border-brand-navy bg-brand-off-white text-xs font-bold uppercase outline-none cursor-pointer max-w-[150px] truncate"
              >
                <option value="all">All Allocations</option>
                <option value="overhead">Festival Overhead Only</option>
                {eventVendors.map((v) => (
                  <option key={v.id} value={v.id.toString()}>
                    Vendor: {v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase text-brand-navy/60 hidden sm:inline">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="p-1.5 border-2 border-brand-navy bg-brand-off-white text-xs font-bold uppercase outline-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* CSV Export Button */}
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 border-2 border-brand-navy bg-white hover:bg-brand-accent text-xs font-bold uppercase transition-colors shadow-(--shadow-brut-xs) cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
              title="Download CSV for Excel or Accounting"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Active Filter Chips */}
          {(selectedCategory !== "all" || selectedStatus !== "all" || selectedVendorFilter !== "all" || searchQuery) && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-brand-navy/20 text-xs">
              <span className="text-[10px] font-bold uppercase text-brand-navy/60">Active Filters:</span>
              {selectedVendorFilter !== "all" && (
                <span className="px-2 py-0.5 border border-brand-navy bg-brand-accent font-bold text-[10px] uppercase flex items-center gap-1">
                  Stall: {selectedVendorFilter === "overhead" ? "Festival Overhead" : eventVendors.find(v => v.id.toString() === selectedVendorFilter)?.name || "Vendor"}
                  <button onClick={() => setSelectedVendorFilter("all")} className="cursor-pointer">&times;</button>
                </span>
              )}
              {selectedCategory !== "all" && (
                <span className="px-2 py-0.5 border border-brand-navy bg-brand-accent font-bold text-[10px] uppercase flex items-center gap-1">
                  Category: {getCategoryMeta(selectedCategory).label}
                  <button onClick={() => setSelectedCategory("all")} className="cursor-pointer">&times;</button>
                </span>
              )}
              {selectedStatus !== "all" && (
                <span className="px-2 py-0.5 border border-brand-navy bg-brand-accent font-bold text-[10px] uppercase flex items-center gap-1">
                  Status: {selectedStatus}
                  <button onClick={() => setSelectedStatus("all")} className="cursor-pointer">&times;</button>
                </span>
              )}
              {searchQuery && (
                <span className="px-2 py-0.5 border border-brand-navy bg-brand-accent font-bold text-[10px] uppercase flex items-center gap-1">
                  Search: &ldquo;{searchQuery}&rdquo;
                  <button onClick={() => setSearchQuery("")} className="cursor-pointer">&times;</button>
                </span>
              )}
              <button
                onClick={() => {
                  setSelectedCategory("all");
                  setSelectedStatus("all");
                  setSelectedVendorFilter("all");
                  setSearchQuery("");
                }}
                className="text-[10px] underline font-bold uppercase text-red-600 hover:text-red-800 cursor-pointer ml-auto"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Expenses Ledger / Table */}
        <div className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-sm) overflow-hidden">
          {/* Sticky Bulk Action Bar */}
          {selectedExpenseIds.length > 0 && (
            <div className="bg-brand-navy text-white p-3 border-b-2 border-brand-accent flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center gap-2">
                <span className="bg-brand-accent text-brand-navy font-mono font-black text-xs px-2 py-0.5 border border-brand-navy">
                  ⚡ {selectedExpenseIds.length} SELECTED
                </span>
                <span className="text-xs font-mono font-bold text-brand-off-white">
                  Total: KES {selectedTotal.toLocaleString()}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Quick Status Buttons */}
                <div className="flex items-center gap-1 bg-white/10 p-1 border border-white/20">
                  <span className="text-[10px] font-bold uppercase text-white/70 px-1">Status:</span>
                  <button
                    type="button"
                    onClick={() => handleBulkStatus("paid")}
                    disabled={bulkOperating}
                    className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase transition-colors cursor-pointer"
                  >
                    Paid
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatus("pending")}
                    disabled={bulkOperating}
                    className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-brand-navy text-[10px] font-black uppercase transition-colors cursor-pointer"
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatus("quoted")}
                    disabled={bulkOperating}
                    className="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-black uppercase transition-colors cursor-pointer"
                  >
                    Quoted
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkStatus("cancelled")}
                    disabled={bulkOperating}
                    className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white text-[10px] font-black uppercase transition-colors cursor-pointer"
                  >
                    Cancelled
                  </button>
                </div>

                {/* Quick Move Category */}
                <select
                  defaultValue=""
                  disabled={bulkOperating}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkCategory(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="px-2 py-1.5 bg-white text-brand-navy border border-brand-navy text-[10px] font-black uppercase cursor-pointer outline-none"
                >
                  <option value="" disabled>Reassign Category...</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>

                {/* Bulk Delete Button */}
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkOperating}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white border border-red-700 text-[10px] font-black uppercase flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete ({selectedExpenseIds.length})</span>
                </button>

                {/* Deselect All */}
                <button
                  type="button"
                  onClick={() => setSelectedExpenseIds([])}
                  className="text-[10px] font-mono text-white/70 hover:text-white underline cursor-pointer px-1"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          <div className="p-3 bg-brand-navy text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <h3 className="font-bold uppercase text-xs tracking-wider">
                Expense Ledger ({filteredExpenses.length} records)
              </h3>
            </div>
            <div className="text-xs font-bold font-mono">
              Filtered Total: KES {filteredTotal.toLocaleString()}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs uppercase font-bold text-brand-navy/60">
              Loading budget and expense records...
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-xs uppercase font-bold text-brand-navy/60">
                No expense entries found for the selected filters.
              </p>
              <button
                onClick={() => {
                  resetForm();
                  setEditingExpense(null);
                  setShowAddModal(true);
                }}
                className="px-3 py-1.5 border-2 border-brand-navy bg-brand-accent font-bold text-xs uppercase shadow-(--shadow-brut-xs)"
              >
                + Log the first expense
              </button>
            </div>
          ) : (
            <div>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-brand-navy bg-brand-off-white text-[11px] font-bold uppercase">
                      <th className="p-2.5 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                          aria-label="Select all rows"
                          className="w-4 h-4 cursor-pointer accent-brand-navy"
                        />
                      </th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5">Expense Item / Payee</th>
                      <th className="p-2.5">Method</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Receipt</th>
                      <th className="p-2.5 text-right">Amount (KES)</th>
                      <th className="p-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-navy/20">
                    {filteredExpenses.map((item) => {
                      const cat = getCategoryMeta(item.category);
                      const isSelected = selectedExpenseIds.includes(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isSelected ? "bg-brand-accent/20" : "hover:bg-brand-navy/5"
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-2.5 w-8 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(item.id)}
                              aria-label={`Select expense ${item.title}`}
                              className="w-4 h-4 cursor-pointer accent-brand-navy"
                            />
                          </td>

                          {/* Date */}
                          <td className="p-2.5 whitespace-nowrap text-[11px] font-mono">
                            {item.paid_at ? item.paid_at.substring(0, 10) : "—"}
                          </td>

                          {/* Category */}
                          <td className="p-2.5 whitespace-nowrap">
                            <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase ${cat.color}`}>
                              {cat.label}
                            </span>
                          </td>

                          {/* Title & Payee */}
                          <td className="p-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-brand-navy">{item.title}</span>
                              {item.vendor_name && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 border border-brand-navy bg-brand-accent/30 text-[9px] font-black uppercase text-brand-navy">
                                  <Store className="w-2.5 h-2.5" /> {item.vendor_name}
                                </span>
                              )}
                              {item.expense_type && item.expense_type !== "overhead" && (
                                <span className="px-1 py-0.2 border border-brand-navy/60 bg-white text-[9px] font-mono uppercase text-brand-navy/80">
                                  {item.expense_type === "vendor_cogs" ? "COGS" : item.expense_type === "vendor_advance" ? "Advance" : "Staff"}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-brand-navy/60 flex items-center gap-2 mt-0.5 flex-wrap">
                              {item.operator_name && (
                                <span className="flex items-center gap-0.5 text-brand-navy font-semibold">
                                  <Users className="w-2.5 h-2.5" /> {item.operator_name}
                                </span>
                              )}
                              {item.recipient && <span>Payee: <strong>{item.recipient}</strong></span>}
                              {item.notes && <span className="italic truncate max-w-xs">{item.notes}</span>}
                            </div>
                          </td>

                          {/* Method */}
                          <td className="p-2.5 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 border border-brand-navy bg-white text-[10px] font-bold uppercase">
                              {item.payment_method}
                            </span>
                          </td>

                          {/* Status (Interactive Inline Dropdown) */}
                          <td className="p-2.5 whitespace-nowrap">
                            <select
                              value={item.status}
                              onChange={(e) => handleInlineStatusChange(item.id, e.target.value)}
                              className={`px-1.5 py-0.5 border text-[10px] font-black uppercase rounded-none cursor-pointer outline-none transition-colors ${
                                item.status === "paid"
                                  ? "bg-green-100 text-green-900 border-green-800"
                                  : item.status === "pending"
                                  ? "bg-amber-100 text-amber-900 border-amber-800"
                                  : item.status === "quoted" || item.status === "planned"
                                  ? "bg-blue-100 text-blue-900 border-blue-800"
                                  : "bg-gray-100 text-gray-800 border-gray-600"
                              }`}
                              title="Click to quickly change status"
                            >
                              <option value="paid">PAID</option>
                              <option value="pending">PENDING</option>
                              <option value="quoted">QUOTED</option>
                              <option value="planned">PLANNED</option>
                              <option value="cancelled">CANCELLED</option>
                            </select>
                          </td>

                          {/* Receipt */}
                          <td className="p-2.5 whitespace-nowrap">
                            {item.receipt_url ? (
                              <button
                                type="button"
                                onClick={() => setActiveReceiptUrl(item.receipt_url || null)}
                                className="px-2 py-0.5 border border-brand-navy bg-brand-accent/30 hover:bg-brand-accent text-[10px] font-bold uppercase cursor-pointer flex items-center gap-1"
                                title="Click to view receipt image"
                              >
                                <Receipt className="w-3 h-3 text-brand-navy" />
                                <span>View</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-brand-navy/40 font-mono">None</span>
                            )}
                          </td>

                          {/* Amount */}
                          <td className="p-2.5 whitespace-nowrap text-right font-mono font-bold text-sm">
                            KES {Number(item.amount).toLocaleString()}
                          </td>

                          {/* Actions */}
                          <td className="p-2.5 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="p-1 border border-brand-navy/40 hover:border-brand-navy hover:bg-brand-accent text-brand-navy transition-colors cursor-pointer"
                                title="Edit Expense"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(item.id)}
                                className="p-1 border border-red-500/40 hover:border-red-600 hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
                                title="Delete Expense"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card-List View */}
              <div className="md:hidden divide-y-2 divide-brand-navy/20">
                {/* Mobile Quick Select-All Header */}
                <div className="p-2.5 bg-brand-off-white border-b border-brand-navy/20 flex items-center justify-between text-xs font-bold uppercase">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 cursor-pointer accent-brand-navy"
                    />
                    <span>Select All ({filteredExpenses.length})</span>
                  </label>
                  <span className="text-[10px] text-brand-navy/60 font-mono">
                    {selectedExpenseIds.length > 0 ? `${selectedExpenseIds.length} chosen` : "Tap card to select"}
                  </span>
                </div>

                {filteredExpenses.map((item) => {
                  const cat = getCategoryMeta(item.category);
                  const isSelected = selectedExpenseIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`p-3 space-y-2.5 transition-colors ${
                        isSelected ? "bg-brand-accent/20" : "hover:bg-brand-navy/5"
                      }`}
                    >
                      {/* Top: Checkbox, Title & Amount */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(item.id)}
                            aria-label={`Select expense ${item.title}`}
                            className="w-4 h-4 mt-1 cursor-pointer accent-brand-navy shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-sm text-brand-navy leading-snug break-words">
                              {item.title}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`px-1.5 py-0.5 border text-[9px] font-black uppercase ${cat.color}`}>
                                {cat.label}
                              </span>
                              {item.vendor_name && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-brand-navy bg-brand-accent/30 text-[9px] font-black uppercase text-brand-navy">
                                  <Store className="w-2.5 h-2.5" /> {item.vendor_name}
                                </span>
                              )}
                              {item.expense_type && item.expense_type !== "overhead" && (
                                <span className="px-1 py-0.5 border border-brand-navy/60 bg-white text-[9px] font-mono uppercase text-brand-navy/80">
                                  {item.expense_type === "vendor_cogs" ? "COGS" : item.expense_type === "vendor_advance" ? "Advance" : "Staff"}
                                </span>
                              )}
                              <span className="text-[10px] text-brand-navy/60 font-mono">
                                {item.paid_at ? item.paid_at.substring(0, 10) : "No date"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="font-mono font-black text-sm text-brand-navy">
                            KES {Number(item.amount).toLocaleString()}
                          </p>
                          <span className="text-[9px] font-bold uppercase text-brand-navy/60">
                            {item.payment_method}
                          </span>
                        </div>
                      </div>

                      {/* Recipient & Notes */}
                      {(item.recipient || item.notes) && (
                        <div className="bg-brand-off-white p-2 border border-brand-navy/20 text-xs space-y-0.5">
                          {item.recipient && (
                            <p className="text-brand-navy">
                              <span className="text-[10px] font-bold uppercase text-brand-navy/60">Payee:</span>{" "}
                              <strong>{item.recipient}</strong>
                            </p>
                          )}
                          {item.notes && (
                            <p className="text-[11px] text-brand-navy/70 italic break-words">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Bottom Controls: Inline Status & Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-brand-navy/15">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase text-brand-navy/60">Status:</span>
                          <select
                            value={item.status}
                            onChange={(e) => handleInlineStatusChange(item.id, e.target.value)}
                            className={`px-2 py-1 border text-[10px] font-black uppercase rounded-none cursor-pointer outline-none min-h-[36px] ${
                              item.status === "paid"
                                ? "bg-green-100 text-green-900 border-green-800"
                                : item.status === "pending"
                                ? "bg-amber-100 text-amber-900 border-amber-800"
                                : item.status === "quoted" || item.status === "planned"
                                ? "bg-blue-100 text-blue-900 border-blue-800"
                                : "bg-gray-100 text-gray-800 border-gray-600"
                            }`}
                          >
                            <option value="paid">PAID</option>
                            <option value="pending">PENDING</option>
                            <option value="quoted">QUOTED</option>
                            <option value="planned">PLANNED</option>
                            <option value="cancelled">CANCELLED</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1">
                          {item.receipt_url && (
                            <button
                              type="button"
                              onClick={() => setActiveReceiptUrl(item.receipt_url || null)}
                              className="px-2 py-1 border border-brand-navy bg-brand-accent/30 hover:bg-brand-accent text-[10px] font-bold uppercase flex items-center gap-1 min-h-[36px]"
                              title="View Attached Receipt"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Receipt</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="p-1.5 border border-brand-navy/60 hover:bg-brand-accent text-brand-navy min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                            title="Edit Expense"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(item.id)}
                            className="p-1.5 border border-red-500/60 hover:bg-red-50 text-red-600 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* MODAL: Log or Edit Expense */}
      {showAddModal && (
        <div className="fixed inset-0 bg-brand-navy/80 backdrop-blur-xs z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white border-4 border-brand-navy p-4 sm:p-5 max-w-lg w-full shadow-(--shadow-brut-lg) space-y-4 my-2 sm:my-8 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3 shrink-0">
              <h3 className="font-display uppercase text-lg font-black flex items-center gap-2">
                <Receipt className="w-5 h-5 text-brand-navy" />
                {editingExpense ? "Edit Expense Entry" : "Log New Event Expense"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingExpense(null);
                }}
                className="text-brand-navy hover:bg-brand-navy hover:text-white p-1 border border-brand-navy font-bold cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-3 text-xs overflow-y-auto pr-1">
              {/* Event Edition Selector */}
              <div>
                <label className="font-bold uppercase block mb-1">
                  Event Edition *
                </label>
                <select
                  value={formData.event_id}
                  onChange={(e) => setFormData({ ...formData, event_id: e.target.value })}
                  className="w-full p-2 border-2 border-brand-navy font-bold uppercase focus:outline-none bg-brand-off-white cursor-pointer"
                >
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id.toString()}>
                      {evt.title} {evt.is_active ? "(LIVE)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-brand-navy/60 font-medium mt-1">
                  {editingExpense ? "Re-assign this expense to any event edition if needed." : "Event edition this expense belongs to."}
                </p>
              </div>

              {/* Expense Type & Allocation Scope */}
              <div className="bg-brand-off-white border-2 border-brand-navy p-3 space-y-2">
                <label className="font-bold uppercase block text-brand-navy flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-brand-navy" /> Allocation Scope / Department
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-brand-accent/40 font-mono text-brand-navy uppercase">
                    {formData.vendor_id ? "Vendor Stall Linked" : "Festival Overhead"}
                  </span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase block text-brand-navy/70 mb-0.5">
                      Assigned Commercial Vendor
                    </label>
                    <select
                      value={formData.vendor_id}
                      onChange={(e) => {
                        const vid = e.target.value;
                        const vObj = eventVendors.find((v) => v.id.toString() === vid);
                        setFormData({
                          ...formData,
                          vendor_id: vid,
                          operator_id: "",
                          // Auto set appropriate category if vendor selected
                          category: vid ? "inventory" : formData.category,
                          expense_type: vid ? "vendor_cogs" : "overhead",
                        });
                      }}
                      className="w-full p-1.5 border border-brand-navy font-bold text-xs uppercase bg-white focus:outline-none cursor-pointer"
                    >
                      <option value="">— Festival Overhead (General) —</option>
                      {eventVendors.map((v) => (
                        <option key={v.id} value={v.id.toString()}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase block text-brand-navy/70 mb-0.5">
                      Accounting Classification
                    </label>
                    <select
                      value={formData.expense_type}
                      onChange={(e) => setFormData({ ...formData, expense_type: e.target.value })}
                      className="w-full p-1.5 border border-brand-navy font-bold text-xs uppercase bg-white focus:outline-none cursor-pointer"
                    >
                      <option value="overhead">Festival Overhead</option>
                      <option value="vendor_cogs">Vendor Stock / COGS</option>
                      <option value="vendor_advance">Vendor Cash Advance</option>
                      <option value="staff_payout">Staff / Crew Wage</option>
                    </select>
                  </div>
                </div>

                {/* Operator / Staff Attribution */}
                {vendorOperators.length > 0 && (
                  <div className="pt-1 border-t border-brand-navy/20">
                    <label className="text-[10px] font-bold uppercase block text-brand-navy/70 mb-0.5 flex items-center gap-1">
                      <Users className="w-3 h-3" /> Cashier / Operator Incurring Expense (Optional)
                    </label>
                    <select
                      value={formData.operator_id}
                      onChange={(e) => {
                        const opId = e.target.value;
                        const opObj = vendorOperators.find((o) => o.id.toString() === opId);
                        setFormData({
                          ...formData,
                          operator_id: opId,
                          recipient: opObj && !formData.recipient ? opObj.name : formData.recipient,
                        });
                      }}
                      className="w-full p-1.5 border border-brand-navy font-bold text-xs uppercase bg-white focus:outline-none cursor-pointer"
                    >
                      <option value="">— No Specific Operator —</option>
                      {vendorOperators.map((op) => (
                        <option key={op.id} value={op.id.toString()}>
                          {op.name} ({op.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="font-bold uppercase block mb-1">
                  Expense Description / Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Ground Deposit for Marara Camp, DJ Advance"
                  className="w-full p-2 border-2 border-brand-navy font-bold focus:outline-none bg-brand-off-white"
                />
              </div>

              {/* Category & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase block mb-1">
                    Department Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2 border-2 border-brand-navy font-bold uppercase focus:outline-none bg-brand-off-white cursor-pointer"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold uppercase block mb-1">
                    Amount (KES) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="e.g. 75000"
                    className="w-full p-2 border-2 border-brand-navy font-bold font-mono focus:outline-none bg-brand-off-white"
                  />
                </div>
              </div>

              {/* Payee / Recipient & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase block mb-1">
                    Payee / Supplier Name
                  </label>
                  <input
                    type="text"
                    value={formData.recipient}
                    onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
                    placeholder="e.g. StageRig Ltd, DJ John"
                    className="w-full p-2 border-2 border-brand-navy font-bold focus:outline-none bg-brand-off-white"
                  />
                </div>

                <div>
                  <label className="font-bold uppercase block mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={formData.paid_at}
                    onChange={(e) => setFormData({ ...formData, paid_at: e.target.value })}
                    className="w-full p-2 border-2 border-brand-navy font-bold font-mono focus:outline-none bg-brand-off-white"
                  />
                </div>
              </div>

              {/* Payment Method & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase block mb-1">
                    Payment Channel
                  </label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full p-2 border-2 border-brand-navy font-bold uppercase focus:outline-none bg-brand-off-white cursor-pointer"
                  >
                    <option value="mpesa">M-Pesa Paybill / Till</option>
                    <option value="bank_transfer">Bank Wire / EFT</option>
                    <option value="cash">Cash in Hand</option>
                    <option value="credit">Credit / Account</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold uppercase block mb-1">
                    Payment Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full p-2 border-2 border-brand-navy font-bold uppercase focus:outline-none bg-brand-off-white cursor-pointer"
                  >
                    <option value="paid">Paid & Settled</option>
                    <option value="pending">Pending Approval / Payout</option>
                    <option value="quoted">Quoted / Invoiced</option>
                    <option value="planned">Planned / Budgeted</option>
                    <option value="cancelled">Cancelled / Void</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="font-bold uppercase block mb-1">
                  Notes & M-Pesa / Reference Code
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g. Ref: QHB929281, includes transport & setup crew"
                  className="w-full p-2 border-2 border-brand-navy font-mono text-xs focus:outline-none bg-brand-off-white"
                />
              </div>

              {/* Receipt Attachment using ImgBB */}
              <div>
                <PosterUploader
                  value={formData.receipt_url}
                  onChange={(url) => setFormData({ ...formData, receipt_url: url })}
                  label="Receipt Photo / Invoice (ImgBB)"
                  dropzoneText="Click to Upload or Drag Receipt / Invoice Photo Here"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t-2 border-brand-navy">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingExpense(null);
                  }}
                  className="px-4 py-2 border-2 border-brand-navy bg-white hover:bg-gray-100 font-bold uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 border-2 border-brand-navy bg-brand-accent hover:bg-brand-accent/80 font-bold uppercase shadow-(--shadow-brut-xs) cursor-pointer"
                >
                  {submitting ? "Saving..." : editingExpense ? "Update Expense" : "Save Expense Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Set Event Initial Budget */}
      {showBudgetModal && (
        <div className="fixed inset-0 bg-brand-navy/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-brand-navy p-5 max-w-sm w-full shadow-(--shadow-brut-lg) space-y-4">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3">
              <h3 className="font-display uppercase text-lg font-black flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-brand-navy" />
                Set Initial Budget
              </h3>
              <button
                type="button"
                onClick={() => setShowBudgetModal(false)}
                className="text-brand-navy hover:bg-brand-navy hover:text-white p-1 border border-brand-navy font-bold cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-3 text-xs">
              <p className="text-brand-navy/70 leading-relaxed">
                Set the target allocated budget in KES for <strong>{summary?.event_title || "this event"}</strong>. This budget will be used to track department utilization and cost overruns.
              </p>

              <div>
                <label className="font-bold uppercase block mb-1">
                  Budget Capital (KES) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1000"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder="e.g. 500000"
                  className="w-full p-2 border-2 border-brand-navy font-bold font-mono text-sm focus:outline-none bg-brand-off-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t-2 border-brand-navy">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowBudgetModal(false)}
                  className="px-3 py-1.5 border-2 border-brand-navy bg-white hover:bg-gray-100 font-bold uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 border-2 border-brand-navy bg-brand-accent hover:bg-brand-accent/80 font-bold uppercase shadow-(--shadow-brut-xs) cursor-pointer"
                >
                  {submitting ? "Saving..." : "Save Budget"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Fork / Clone Budget from Another Event */}
      {showForkModal && (
        <div className="fixed inset-0 bg-brand-navy/80 backdrop-blur-xs z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white border-4 border-brand-navy p-4 sm:p-5 max-w-md w-full shadow-(--shadow-brut-lg) space-y-4 my-2 sm:my-8 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3 shrink-0">
              <h3 className="font-display uppercase text-lg font-black flex items-center gap-2">
                <Layers className="w-5 h-5 text-brand-navy" />
                Fork Budget From Edition
              </h3>
              <button
                type="button"
                onClick={() => setShowForkModal(false)}
                className="text-brand-navy hover:bg-brand-navy hover:text-white p-1 border border-brand-navy font-bold cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleForkBudget} className="space-y-4 text-xs overflow-y-auto pr-1">
              <p className="text-brand-navy/80 leading-relaxed">
                Clone departmental budget line-items (Venue, Artists, Sound, Marketing, etc.) from an existing event into <strong>{summary?.event_title || "this edition"}</strong>.
              </p>

              <div>
                <label className="font-bold uppercase block mb-1">
                  Source Event Edition *
                </label>
                <select
                  value={forkSourceEventId}
                  onChange={(e) => setForkSourceEventId(e.target.value)}
                  className="w-full p-2 border-2 border-brand-navy font-bold uppercase focus:outline-none bg-brand-off-white cursor-pointer"
                >
                  {events
                    .filter((e) => e.id.toString() !== selectedEventId)
                    .map((evt) => (
                      <option key={evt.id} value={evt.id.toString()}>
                        {evt.title} {evt.is_active ? "(LIVE)" : ""}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-brand-navy/60 font-medium mt-1">
                  All copied line-items will be marked as "PLANNED / BUDGETED" so past payment records are clean.
                </p>
              </div>

              <div className="flex items-start gap-2 border-2 border-brand-navy/40 p-2.5 bg-brand-off-white">
                <input
                  type="checkbox"
                  id="copyBudgetCap"
                  checked={forkCopyBudgetCap}
                  onChange={(e) => setForkCopyBudgetCap(e.target.checked)}
                  className="w-4 h-4 mt-0.5 cursor-pointer accent-brand-navy"
                />
                <label htmlFor="copyBudgetCap" className="font-bold uppercase cursor-pointer select-none">
                  Also copy Target Budget Cap (KES allocation) from source edition
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t-2 border-brand-navy">
                <button
                  type="button"
                  disabled={forking}
                  onClick={() => setShowForkModal(false)}
                  className="px-3 py-1.5 border-2 border-brand-navy bg-white hover:bg-gray-100 font-bold uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forking || !forkSourceEventId}
                  className="px-4 py-1.5 border-2 border-brand-navy bg-brand-accent hover:bg-brand-accent/80 font-bold uppercase shadow-(--shadow-brut-xs) cursor-pointer flex items-center gap-1.5"
                >
                  {forking ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Forking...</span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-3.5 h-3.5" />
                      <span>Fork Budget Now</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL / LIGHTBOX: Receipt Image Viewer */}
      {activeReceiptUrl && (
        <div
          onClick={() => setActiveReceiptUrl(null)}
          className="fixed inset-0 bg-brand-navy/90 backdrop-blur-xs z-50 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border-4 border-brand-navy p-3 max-w-2xl w-full shadow-(--shadow-brut-lg) space-y-3 cursor-default"
          >
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2">
              <span className="font-bold uppercase text-xs flex items-center gap-1.5">
                <Receipt className="w-4 h-4" /> Attached Expense Receipt
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={activeReceiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold underline flex items-center gap-1 hover:text-brand-accent"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Full Size
                </a>
                <button
                  onClick={() => setActiveReceiptUrl(null)}
                  className="p-1 border border-brand-navy hover:bg-brand-navy hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="relative w-full h-96 sm:h-[450px] bg-black/5 border-2 border-brand-navy flex items-center justify-center overflow-hidden">
              <img
                src={activeReceiptUrl}
                alt="Receipt Document"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
