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
  Image as ImageIcon
} from "lucide-react";
import PosterUploader from "@/components/admin/PosterUploader";

export interface ExpenseItem {
  id: number;
  event_id: number;
  event_title?: string;
  title: string;
  category: string;
  amount: number;
  status: "paid" | "pending" | "planned";
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
  ticket_revenue: number;
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
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Form State for Expense
  const [formData, setFormData] = useState({
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

  // Load events
  useEffect(() => {
    fetch("/api/events")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setEvents(data);
          const active = data.find((e: any) => e.is_active) || data[0];
          if (active) setSelectedEventId(active.id.toString());
        }
      })
      .catch((err) => console.error("Error loading events:", err));
  }, []);

  const loadData = (eventId?: string) => {
    const target = eventId !== undefined ? eventId : selectedEventId;
    if (!target) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/admin/budget?eventId=${target}`).then((r) => r.json()),
      fetch(`/api/admin/expenses?eventId=${target}`).then((r) => r.json()),
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
    }
  }, [selectedEventId]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
      if (selectedStatus !== "all" && item.status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchRecipient = (item.recipient || "").toLowerCase().includes(q);
        const matchNotes = (item.notes || "").toLowerCase().includes(q);
        if (!matchTitle && !matchRecipient && !matchNotes) return false;
      }
      return true;
    });
  }, [expenses, selectedCategory, selectedStatus, searchQuery]);

  // Total of filtered items
  const filteredTotal = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [filteredExpenses]);

  // CSV Export
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      alert("No expenses to export.");
      return;
    }

    const headers = ["ID", "Event", "Date", "Category", "Title", "Recipient", "Amount (KES)", "Status", "Payment Method", "Notes", "Receipt URL"];
    const rows = filteredExpenses.map((e) => [
      e.id,
      `"${(e.event_title || "").replace(/"/g, '""')}"`,
      e.paid_at ? e.paid_at.substring(0, 10) : "",
      `"${e.category}"`,
      `"${e.title.replace(/"/g, '""')}"`,
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
    link.setAttribute("download", `goodlife-expenses-${eventName}-${new Date().toISOString().slice(0, 10)}.csv`);
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
      const payload = {
        event_id: Number(selectedEventId),
        title: formData.title.trim(),
        category: formData.category,
        amount: numAmount,
        status: formData.status,
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
  const ticketRevenue = summary?.ticket_revenue || 0;
  const netProfitOrLoss = summary?.net_profit_or_loss || 0;
  const isProfitable = netProfitOrLoss >= 0;

  const budgetUsedPct = budgetAllocated > 0 ? Math.round((totalExpenses / budgetAllocated) * 100) : 0;
  const isOverBudget = budgetAllocated > 0 && totalExpenses > budgetAllocated;

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
                <DollarSign className="w-7 h-7 text-brand-navy" /> Event Budget & P&L
              </h1>
              <p className="text-xs text-brand-navy/60 font-bold uppercase mt-0.5">
                Initial Budget, Cost Tracking, Live Inflows & Financial Reconciliation
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
                  onChange={(e) => setSelectedEventId(e.target.value)}
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

        {/* KPI Dashboard Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* Card 1: Initial Budget */}
          <div className="border-4 border-brand-navy p-3 md:p-4 bg-white shadow-(--shadow-brut-sm) flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-bold text-brand-navy/60">Initial Budget</p>
              <button
                type="button"
                onClick={() => setShowBudgetModal(true)}
                className="text-[10px] font-bold uppercase underline hover:text-brand-accent text-brand-navy cursor-pointer flex items-center gap-1"
              >
                <Edit2 className="w-3 h-3" /> Set Budget
              </button>
            </div>
            <p className="text-xl md:text-2xl font-bold font-mono text-brand-navy mt-1">
              KES {budgetAllocated.toLocaleString()}
            </p>
            <div className="mt-2 text-[10px] text-brand-navy/70 uppercase">
              {budgetAllocated > 0 ? (
                <span>Cap: KES {budgetAllocated.toLocaleString()}</span>
              ) : (
                <span className="text-amber-600 font-bold">No budget cap set</span>
              )}
            </div>
          </div>

          {/* Card 2: Total Spent & Utilization */}
          <div className={`border-4 border-brand-navy p-3 md:p-4 bg-white shadow-(--shadow-brut-sm) flex flex-col justify-between ${isOverBudget ? "bg-red-50" : ""}`}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-bold text-brand-navy/60">Total Expenses</p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 border border-brand-navy ${isOverBudget ? "bg-red-500 text-white" : "bg-brand-navy text-white"}`}>
                {budgetAllocated > 0 ? `${budgetUsedPct}% USED` : `${expenses.length} ITEMS`}
              </span>
            </div>
            <p className={`text-xl md:text-2xl font-bold font-mono mt-1 ${isOverBudget ? "text-red-600" : "text-brand-navy"}`}>
              KES {totalExpenses.toLocaleString()}
            </p>
            {/* Progress bar */}
            <div className="w-full bg-gray-200 h-2 border border-brand-navy mt-2 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isOverBudget
                    ? "bg-red-500"
                    : budgetUsedPct > 80
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, budgetUsedPct)}%` }}
              />
            </div>
          </div>

          {/* Card 3: Ticket Sales Inflow */}
          <div className="border-4 border-brand-navy p-3 md:p-4 bg-white shadow-(--shadow-brut-sm) flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-bold text-brand-navy/60">Ticket Revenue</p>
              <span className="text-[10px] font-bold px-1.5 py-0.5 border border-brand-navy bg-emerald-100 text-emerald-900">
                LIVE INFLOW
              </span>
            </div>
            <p className="text-xl md:text-2xl font-bold font-mono text-emerald-700 mt-1">
              KES {ticketRevenue.toLocaleString()}
            </p>
            <p className="text-[10px] text-brand-navy/70 uppercase mt-2">
              From verified tickets
            </p>
          </div>

          {/* Card 4: Net P&L (Profit & Loss) */}
          <div className={`border-4 border-brand-navy p-3 md:p-4 shadow-(--shadow-brut-sm) flex flex-col justify-between ${isProfitable ? "bg-emerald-50" : "bg-amber-50"}`}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase font-bold text-brand-navy/60">Net P&L Position</p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 border border-brand-navy flex items-center gap-1 ${isProfitable ? "bg-emerald-600 text-white" : "bg-amber-500 text-brand-navy"}`}>
                {isProfitable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {isProfitable ? "PROFIT" : "DEFICIT"}
              </span>
            </div>
            <p className={`text-xl md:text-2xl font-bold font-mono mt-1 ${isProfitable ? "text-emerald-700" : "text-amber-700"}`}>
              {isProfitable ? "+" : ""}KES {netProfitOrLoss.toLocaleString()}
            </p>
            <p className="text-[10px] text-brand-navy/70 uppercase mt-2">
              {isProfitable
                ? "Costs fully covered by tickets"
                : `Need KES ${Math.abs(netProfitOrLoss).toLocaleString()} to break even`}
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
          {(selectedCategory !== "all" || selectedStatus !== "all" || searchQuery) && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-brand-navy/20 text-xs">
              <span className="text-[10px] font-bold uppercase text-brand-navy/60">Active Filters:</span>
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-brand-navy bg-brand-off-white text-[11px] font-bold uppercase">
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
                    return (
                      <tr key={item.id} className="hover:bg-brand-navy/5 transition-colors">
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
                          <p className="font-bold text-brand-navy">{item.title}</p>
                          <div className="text-[10px] text-brand-navy/60 flex items-center gap-2 mt-0.5">
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

                        {/* Status */}
                        <td className="p-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 border text-[10px] font-bold uppercase ${
                              item.status === "paid"
                                ? "bg-green-100 text-green-900 border-green-800"
                                : item.status === "pending"
                                ? "bg-amber-100 text-amber-900 border-amber-800"
                                : "bg-blue-100 text-blue-900 border-blue-800"
                            }`}
                          >
                            {item.status}
                          </span>
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
          )}
        </div>

      </div>

      {/* MODAL: Log or Edit Expense */}
      {showAddModal && (
        <div className="fixed inset-0 bg-brand-navy/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border-4 border-brand-navy p-5 max-w-lg w-full shadow-(--shadow-brut-lg) space-y-4 my-8">
            <div className="flex items-center justify-between border-b-2 border-brand-navy pb-3">
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

            <form onSubmit={handleSaveExpense} className="space-y-3 text-xs">
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
                    <option value="planned">Planned / Quoted</option>
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
