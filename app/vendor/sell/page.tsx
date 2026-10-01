"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShoppingCart, Plus, Minus, CreditCard, Banknote, Users, Download, ChevronUp, ChevronDown, X, Zap, RotateCw, CheckCircle2, FileText, Search, Ticket, Loader2, Receipt, ExternalLink, MessageSquare, Phone, Clock, ShoppingBag, Printer, AlertTriangle, ArrowLeft } from "lucide-react";
import { HapticFeedback } from "@/components/ui/haptic-feedback";

export default function VendorSellPage() {
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [catalogSearchQuery, setCatalogSearchQuery] = useState<string>("");

  // Recent Sales Drawer state
  const [showRecentSalesDrawer, setShowRecentSalesDrawer] = useState(false);
  const [recentSalesList, setRecentSalesList] = useState<any[]>([]);
  const [loadingRecentSales, setLoadingRecentSales] = useState(false);

  // Customer Audit & Unified Docket Drawer state
  const [showCustomerAuditDrawer, setShowCustomerAuditDrawer] = useState(false);
  const [selectedCustomerAudit, setSelectedCustomerAudit] = useState<any | null>(null);
  const [customerDocketItem, setCustomerDocketItem] = useState<any | null>(null);
  const [auditSearchQuery, setAuditSearchQuery] = useState("");
  const [auditSettleTab, setAuditSettleTab] = useState<any | null>(null);
  const [auditSettleAmount, setAuditSettleAmount] = useState<string>("");
  const [auditSettleMethod, setAuditSettleMethod] = useState<"cash" | "mpesa">("cash");
  const [isSettlingTab, setIsSettlingTab] = useState(false);
  const [isRemindingTab, setIsRemindingTab] = useState<number | null>(null);
  
  // Split payment state
  const [cashAmount, setCashAmount] = useState("");
  const [mpesaAmount, setMpesaAmount] = useState("");
  const [tabAmount, setTabAmount] = useState("");
  const [tabId, setTabId] = useState("");
  const [tabs, setTabs] = useState<any[]>([]);
  const [completedSale, setCompletedSale] = useState<any>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Customer & Tab Search state for Split Payment
  const [eventCustomers, setEventCustomers] = useState<any[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [isCreatingTabForCustomer, setIsCreatingTabForCustomer] = useState(false);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  
  // Custom new tab modal state
  const [showNewTabModal, setShowNewTabModal] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabPhone, setNewTabPhone] = useState("");
  const [newTabLimit, setNewTabLimit] = useState("5000");

  // Track 2 additions: Intercept remainder modal & submit lock
  const [submittingSale, setSubmittingSale] = useState(false);
  const [showRemainderModal, setShowRemainderModal] = useState(false);
  const [remainderTabId, setRemainderTabId] = useState("");

  // Track 3 additions: Dual-Path M-Pesa Engine (STK Push & Manual Till Fallback)
  const [mpesaCustomerPhone, setMpesaCustomerPhone] = useState("");
  const [mpesaRef, setMpesaRef] = useState("");
  const [isMpesaVerified, setIsMpesaVerified] = useState(false);
  const [showManualMpesa, setShowManualMpesa] = useState(false);
  const [showStkModal, setShowStkModal] = useState(false);
  const [stkReference, setStkReference] = useState("");
  const [stkTimeLeft, setStkTimeLeft] = useState(45);
  const [stkStatusMessage, setStkStatusMessage] = useState("Waiting for customer PIN entry...");
  const [isTriggeringStk, setIsTriggeringStk] = useState(false);
  const [isManualCheckingStatus, setIsManualCheckingStatus] = useState(false);

  // Check STK status helper
  const checkMpesaStatus = async (refToCheck: string, isManual = false) => {
    if (!refToCheck) return;
    if (isManual) setIsManualCheckingStatus(true);
    try {
      const res = await fetch(`/api/vendor/mpesa/status?reference=${encodeURIComponent(refToCheck)}`);
      const data = await res.json();
      if (data.success && data.status === "SUCCESS") {
        HapticFeedback.trigger("success");
        const verifiedCode = data.mpesa_code || refToCheck;
        setMpesaRef(verifiedCode);
        setIsMpesaVerified(true);
        setShowStkModal(false);
      } else if (data.status === "FAILED" || data.status === "CANCELLED" || data.status === "TIMEOUT") {
        HapticFeedback.trigger("error");
        setStkStatusMessage(data.message || `Payment ${data.status.toLowerCase()}.`);
      } else {
        if (data.message) {
          setStkStatusMessage(data.message);
        }
      }
    } catch (e: any) {
      console.error("STK status poll error:", e);
    } finally {
      if (isManual) setIsManualCheckingStatus(false);
    }
  };

  // STK Trigger function
  const triggerStkPush = async () => {
    const cleanPhone = mpesaCustomerPhone.trim();
    if (!cleanPhone) {
      alert("Please enter customer phone number for STK Push");
      return;
    }
    const amountToCharge = Number(mpesaAmount);
    if (!amountToCharge || amountToCharge <= 0) {
      alert("Please enter a valid M-Pesa amount to charge");
      return;
    }

    setIsTriggeringStk(true);
    HapticFeedback.trigger("confirmation");
    try {
      const res = await fetch("/api/vendor/mpesa/stk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          amount: amountToCharge,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.reference) {
        HapticFeedback.trigger("confirmation");
        setStkReference(data.reference);
        setStkTimeLeft(45);
        setStkStatusMessage("Prompt sent! Waiting for customer PIN entry...");
        setShowStkModal(true);
      } else {
        HapticFeedback.trigger("error");
        alert(data.message || "Failed to trigger STK Push");
      }
    } catch (e: any) {
      HapticFeedback.trigger("error");
      alert("Network error triggering STK Push");
    } finally {
      setIsTriggeringStk(false);
    }
  };

  // STK Countdown & Polling effect
  useEffect(() => {
    if (!showStkModal || !stkReference) return;

    let isTerminal = false;

    // 1-second countdown timer
    const timerInterval = setInterval(() => {
      setStkTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          clearInterval(pollInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // 2.5-second polling interval (stops automatically on terminal status or timeout)
    const pollInterval = setInterval(async () => {
      if (isTerminal) {
        clearInterval(pollInterval);
        return;
      }
      try {
        const res = await fetch(`/api/vendor/mpesa/status?reference=${encodeURIComponent(stkReference)}`);
        const data = await res.json();
        if (data.success && data.status === "SUCCESS") {
          isTerminal = true;
          clearInterval(pollInterval);
          clearInterval(timerInterval);
          HapticFeedback.trigger("success");
          const verifiedCode = data.mpesa_code || stkReference;
          setMpesaRef(verifiedCode);
          setIsMpesaVerified(true);
          setShowStkModal(false);
        } else if (data.status === "FAILED" || data.status === "CANCELLED" || data.status === "TIMEOUT") {
          isTerminal = true;
          clearInterval(pollInterval);
          HapticFeedback.trigger("error");
          setStkStatusMessage(data.message || `Payment ${data.status.toLowerCase()}.`);
        } else if (data.message) {
          setStkStatusMessage(data.message);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2500);

    return () => {
      clearInterval(timerInterval);
      clearInterval(pollInterval);
    };
  }, [showStkModal, stkReference]);

  const loadTabs = () => {
    fetch("/api/vendor/tabs")
      .then(res => res.json())
      .then(data => {
        const rawTabs = Array.isArray(data) ? data : (data?.tabs || []);
        setTabs(rawTabs.filter((t: any) => t.status === 'open'));
      })
      .catch(err => {
        console.error("Error loading vendor tabs:", err);
      });
  };

  const loadRecentSales = () => {
    setLoadingRecentSales(true);
    fetch("/api/vendor/sales")
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.sales)) {
          setRecentSalesList(data.sales);
        }
      })
      .catch(err => {
        console.error("Error loading vendor sales:", err);
      })
      .finally(() => {
        setLoadingRecentSales(false);
      });
  };

  const handleCreateNewTab = async (remainderToFill?: number) => {
    if (!newTabName.trim()) {
      alert("Please enter a customer or staff name");
      return;
    }
    try {
      const limitToSet = Number(newTabLimit) || 5000;
      const res = await fetch("/api/vendor/tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: newTabName.trim(),
          customer_phone: newTabPhone.trim(),
          credit_limit: limitToSet
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.tab) {
        HapticFeedback.trigger("success");
        setTabs(prev => [data.tab, ...prev]);
        setTabId(data.tab.id.toString());
        setShowNewTabModal(false);
        setNewTabName("");
        setNewTabPhone("");
        setNewTabLimit("5000");

        // If created from remainder modal or auto-fill requested
        if (remainderToFill !== undefined && remainderToFill > 0) {
          const avail = limitToSet;
          const fillAmt = Math.max(0, Math.min(remainderToFill, avail));
          setTabAmount(fillAmt.toString());
          setShowRemainderModal(false);
        }
      } else {
        alert(data.message || "Failed to create tab");
      }
    } catch {
      alert("Error creating tab");
    }
  };

  const loadCustomers = (searchQuery = "") => {
    setIsLoadingCustomers(true);
    const q = searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : "";
    fetch(`/api/vendor/customers${q}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.customers)) {
          setEventCustomers(data.customers);
        }
      })
      .catch(err => {
        console.error("Error loading event customers:", err);
      })
      .finally(() => {
        setIsLoadingCustomers(false);
      });
  };

  const handleSelectCustomer = async (cust: any) => {
    // Check if this customer already has an open tab
    const cleanCustPhone = (cust.phone_number || "").replace(/\D/g, "");
    const existingTab = tabs.find(t => {
      const tabPhone = (t.customer_phone || "").replace(/\D/g, "");
      if (cleanCustPhone && tabPhone && cleanCustPhone.length >= 9 && tabPhone.length >= 9) {
        if (tabPhone.endsWith(cleanCustPhone.slice(-9)) || cleanCustPhone.endsWith(tabPhone.slice(-9))) {
          return true;
        }
      }
      return t.customer_name.trim().toLowerCase() === cust.buyer_name.trim().toLowerCase();
    });

    if (existingTab) {
      handleTabSelect(existingTab.id.toString());
      setCustomerSearchQuery("");
      setIsSearchDropdownOpen(false);
      return;
    }

    // Auto-create an open tab for this attendee
    setIsCreatingTabForCustomer(true);
    try {
      const phoneToUse = cust.phone_number?.trim() || cust.whatsapp_number?.trim() || "";
      const res = await fetch("/api/vendor/tabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: cust.buyer_name.trim(),
          customer_phone: phoneToUse,
          credit_limit: 5000
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.tab) {
        HapticFeedback.trigger("success");
        const newTab = data.tab;
        setTabs(prev => [newTab, ...prev]);
        setTabId(newTab.id.toString());

        // Auto-fill amount based on new tab's available credit limit
        const unpaidDue = Math.max(0, total - (numCash + numMpesa));
        const availableCredit = Number(newTab.credit_limit) - Number(newTab.balance || 0);
        const fillAmount = Math.max(0, Math.min(unpaidDue, availableCredit));
        setTabAmount(fillAmount > 0 ? fillAmount.toString() : "");

        if (phoneToUse && !mpesaCustomerPhone) {
          setMpesaCustomerPhone(phoneToUse);
        }
        setCustomerSearchQuery("");
        setIsSearchDropdownOpen(false);
      } else {
        HapticFeedback.trigger("error");
        alert(data.message || "Failed to open tab for attendee");
      }
    } catch {
      HapticFeedback.trigger("error");
      alert("Error creating tab for attendee");
    } finally {
      setIsCreatingTabForCustomer(false);
    }
  };

  const loadItems = () => {
    fetch("/api/vendor/items")
      .then(res => res.json())
      .then(data => {
        const rawItems = Array.isArray(data) ? data : (data?.items || []);
        setItems(rawItems.filter((i: any) => i.is_available));
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading vendor items:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadItems();
    loadTabs();
    loadCustomers();
    loadRecentSales();

    // Background sync every 10 seconds for real-time multi-cashier stock updates
    const syncInterval = setInterval(() => {
      loadItems();
      loadTabs();
    }, 10000);

    return () => clearInterval(syncInterval);
  }, []);

  const handleAuditSettleTab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditSettleTab) return;
    const amt = Number(auditSettleAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Please enter a valid payment amount");
      return;
    }
    setIsSettlingTab(true);
    try {
      const res = await fetch(`/api/vendor/tabs/${auditSettleTab.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          method: auditSettleMethod
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger("success");
        alert(data.message || "Tab payment recorded successfully!");
        setAuditSettleTab(null);
        setAuditSettleAmount("");
        loadTabs();
        loadCustomers();
        if (selectedCustomerAudit) {
          fetch(`/api/vendor/customers?q=${encodeURIComponent(selectedCustomerAudit.phone_number || selectedCustomerAudit.buyer_name)}`)
            .then(r => r.json())
            .then(d => {
              if (d.success && d.customers?.[0]) setSelectedCustomerAudit(d.customers[0]);
            })
            .catch(() => {});
        }
      } else {
        HapticFeedback.trigger("error");
        alert(data.message || "Failed to record payment");
      }
    } catch {
      HapticFeedback.trigger("error");
      alert("Network error processing payment");
    } finally {
      setIsSettlingTab(false);
    }
  };

  const handleAuditSendReminder = async (tabId: number, custPhone?: string) => {
    if (!custPhone) {
      alert("This customer has no phone number on record");
      return;
    }
    setIsRemindingTab(tabId);
    try {
      const res = await fetch(`/api/vendor/tabs/${tabId}/remind`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger("success");
        alert(data.message || `WhatsApp statement and payment link sent to ${custPhone}!`);
      } else {
        HapticFeedback.trigger("error");
        alert(data.message || "Failed to send WhatsApp reminder");
      }
    } catch {
      HapticFeedback.trigger("error");
      alert("Network error sending reminder");
    } finally {
      setIsRemindingTab(null);
    }
  };

  const handleDownloadDocketTxt = (cust: any) => {
    if (!cust) return;
    const lines = [
      "========================================",
      "       GOODLIFE STALL CUSTOMER DOCKET   ",
      "========================================",
      `CUSTOMER: ${cust.buyer_name || cust.name || "Attendee"}`,
      `PHONE:    ${cust.phone_number || cust.phoneRaw || "N/A"}`,
      `DATE:     ${new Date().toLocaleString("en-KE")}`,
      "----------------------------------------",
      `TOTAL STALL SPEND:  KES ${Number(cust.total_spent || 0).toLocaleString()}`,
      `TICKET SPEND:       KES ${Number(cust.ticket_spend || 0).toLocaleString()}`,
      `OUTSTANDING TAB:    KES ${Number(cust.tab_balance_due || 0).toLocaleString()}`,
      "----------------------------------------",
      "STALL ORDERS BREAKDOWN:",
    ];
    if ((cust.orders || []).length === 0) {
      lines.push("  (No stall orders recorded)");
    } else {
      for (const ord of cust.orders) {
        lines.push(`  Order #${ord.id} - ${new Date(ord.created_at).toLocaleTimeString()} - KES ${Number(ord.total).toLocaleString()} (${ord.payment_method})`);
        for (const it of ord.items || []) {
          lines.push(`    - ${it.quantity}x ${it.item_name} @ KES ${Number(it.price || 0).toLocaleString()}`);
        }
      }
    }
    lines.push("----------------------------------------");
    lines.push("EVENT TICKETS:");
    if ((cust.tickets || []).length === 0) {
      lines.push("  (No event tickets recorded)");
    } else {
      for (const t of cust.tickets) {
        lines.push(`  Ticket ${t.id}: ${t.ticket_type} (KES ${Number(t.amount_paid || 0).toLocaleString()}) - ${t.is_scanned ? "SCANNED" : "UNSCANNED"}`);
      }
    }
    lines.push("----------------------------------------");
    lines.push("PAYMENTS & SETTLEMENTS RECEIVED:");
    if ((cust.payments || []).length === 0) {
      lines.push("  (No payments recorded yet)");
    } else {
      for (const p of cust.payments) {
        const refStr = p.mpesa_ref ? ` [ref: ${p.mpesa_ref}]` : "";
        const opStr = p.operator_name ? ` (by ${p.operator_name})` : "";
        lines.push(`  Payment #${p.id} - ${new Date(p.created_at).toLocaleString()} - PAID KES ${Number(p.amount).toLocaleString()} (${p.method.toUpperCase()}${refStr}${opStr}) -> Tab #${p.tab_id}`);
      }
    }
    lines.push("----------------------------------------");
    lines.push(`TOTAL ORDERS:       KES ${Number(cust.total_spent || 0).toLocaleString()}`);
    lines.push(`TOTAL PAID:         KES ${Number(cust.total_paid || 0).toLocaleString()}`);
    lines.push(`OUTSTANDING DUE:    KES ${Number(cust.tab_balance_due || 0).toLocaleString()}`);
    lines.push("========================================");
    lines.push("         THANK YOU FOR YOUR PATRONAGE   ");
    lines.push("========================================");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `docket-${(cust.buyer_name || "customer").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Debounced search for event customers
  useEffect(() => {
    if (!customerSearchQuery.trim()) return;
    const timer = setTimeout(() => {
      fetch(`/api/vendor/customers?q=${encodeURIComponent(customerSearchQuery.trim())}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.customers)) {
            setEventCustomers(prev => {
              const map = new Map();
              prev.forEach(c => map.set(c.id, c));
              data.customers.forEach((c: any) => map.set(c.id, c));
              return Array.from(map.values());
            });
          }
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearchQuery]);

  const addToCart = (item: any) => {
    const hasCountedStock = item.stock_qty !== null && item.stock_qty !== undefined;
    const available = hasCountedStock ? Number(item.stock_qty) : Infinity;

    if (hasCountedStock && available <= 0) {
      HapticFeedback.trigger("error");
      alert(`"${item.name}" is OUT OF STOCK.`);
      return;
    }

    const existing = cart.find(i => i.id === item.id);
    if (existing && hasCountedStock && (existing.quantity + 1 > available)) {
      HapticFeedback.trigger("error");
      alert(`Cannot add more. Only ${available} units available in stock for "${item.name}".`);
      return;
    }

    HapticFeedback.trigger("confirmation");
    setCart(prev => {
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: number, delta: number) => {
    const itemInCatalog = items.find(i => i.id === id);
    const existing = cart.find(i => i.id === id);
    if (delta > 0 && itemInCatalog && existing) {
      const hasCountedStock = itemInCatalog.stock_qty !== null && itemInCatalog.stock_qty !== undefined;
      const available = hasCountedStock ? Number(itemInCatalog.stock_qty) : Infinity;
      if (hasCountedStock && existing.quantity + delta > available) {
        HapticFeedback.trigger("error");
        alert(`Cannot exceed available stock (${available} units).`);
        return;
      }
    }

    HapticFeedback.trigger("confirmation");
    setCart(prev => {
      return prev.map(i => {
        if (i.id === id) {
          const newQ = Math.max(0, i.quantity + delta);
          return { ...i, quantity: newQ };
        }
        return i;
      }).filter(i => i.quantity > 0);
    });
  };

  const total = cart.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);

  const numCash = Number(cashAmount) || 0;
  const numMpesa = Number(mpesaAmount) || 0;
  const numTab = Number(tabAmount) || 0;
  const currentPaid = numCash + numMpesa + numTab;
  const remainingDue = Math.max(0, total - currentPaid);
  const changeDue = Math.max(0, currentPaid - total);

  const fillRemaining = (type: 'cash' | 'mpesa' | 'tab') => {
    HapticFeedback.trigger("confirmation");
    const diff = Math.max(0, total - (currentPaid - (type === 'cash' ? numCash : type === 'mpesa' ? numMpesa : numTab)));
    if (type === 'cash') setCashAmount(diff > 0 ? diff.toString() : "");
    if (type === 'mpesa') setMpesaAmount(diff > 0 ? diff.toString() : "");
    if (type === 'tab') setTabAmount(diff > 0 ? diff.toString() : "");
  };

  const handleTabSelect = (selectedId: string) => {
    setTabId(selectedId);
    if (!selectedId) {
      setTabAmount("");
      return;
    }
    const selectedTab = tabs.find(t => t.id === Number(selectedId));
    if (selectedTab) {
      // Calculate unpaid due without existing tabAmount
      const unpaidDue = Math.max(0, total - (numCash + numMpesa));
      const availableCredit = Number(selectedTab.credit_limit) - Number(selectedTab.balance);
      const fillAmount = Math.max(0, Math.min(unpaidDue, availableCredit));
      setTabAmount(fillAmount > 0 ? fillAmount.toString() : "");

      // Auto-fill customer phone from selected tab if tab has phone and phone is empty
      if (selectedTab.customer_phone && !mpesaCustomerPhone) {
        setMpesaCustomerPhone(selectedTab.customer_phone);
      }
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || submittingSale) return;
    const splitPayments = [];
    if (Number(cashAmount) > 0) splitPayments.push({ method: "cash", amount: Number(cashAmount) });
    if (Number(mpesaAmount) > 0) {
      splitPayments.push({
        method: "mpesa",
        amount: Number(mpesaAmount),
        mpesa_ref: mpesaRef.trim() || undefined,
        payer_phone: mpesaCustomerPhone.trim() || undefined,
      });
    }
    if (Number(tabAmount) > 0 && tabId) splitPayments.push({ method: "tab", amount: Number(tabAmount), tab_id: Number(tabId) });

    const totalPaid = splitPayments.reduce((s, p) => s + p.amount, 0);
    if (totalPaid < total) {
      // Trigger Smart Unpaid Remainder Intercept Modal instead of hard blocking or alert
      HapticFeedback.trigger("error");
      setRemainderTabId(tabId || (tabs.length > 0 ? tabs[0].id.toString() : ""));
      setShowRemainderModal(true);
      return;
    }

    if (Number(tabAmount) > 0 && tabId) {
      const selectedTab = tabs.find(t => t.id === Number(tabId));
      if (selectedTab) {
        const available = Number(selectedTab.credit_limit) - Number(selectedTab.balance);
        if (Number(tabAmount) > available) {
          alert(`Selected tab only has KES ${available.toLocaleString()} available credit remaining!`);
          return;
        }
      }
    }

    setSubmittingSale(true);
    HapticFeedback.trigger("confirmation");
    try {
      const payload = {
        subtotal: total,
        total: totalPaid,
        items: cart.map(i => ({ item_id: i.id, item_name: i.name, quantity: i.quantity, unit_price: i.price, line_total: i.price * i.quantity })),
        splitPayments
      };
      const res = await fetch("/api/vendor/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger("success");

        // 1. Instant optimistic update so numbers like '45 LEFT' update in 0ms!
        const soldItems = [...cart];
        setItems(prev => prev.map(item => {
          const sold = soldItems.find(c => c.id === item.id);
          if (sold && item.stock_qty !== null && item.stock_qty !== undefined) {
            const newQty = Math.max(0, Number(item.stock_qty) - sold.quantity);
            return {
              ...item,
              stock_qty: newQty,
            };
          }
          return item;
        }));

        loadItems(); // Server-verified stock sync
        loadTabs(); // Immediate refresh to avoid stale credit limits
        loadRecentSales();
        setCompletedSale({
          saleId: data.saleId,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          items: [...cart],
          total,
          totalPaid,
          changeDue,
          payments: splitPayments
        });
        setCart([]);
        setShowCheckout(false);
        setCashAmount(""); setMpesaAmount(""); setTabAmount(""); setTabId("");
        setMpesaRef(""); setIsMpesaVerified(false); setMpesaCustomerPhone(""); setShowManualMpesa(false);
        setCustomerSearchQuery(""); setIsSearchDropdownOpen(false);
      } else {
        HapticFeedback.trigger("error");
        alert(data.message || "Checkout failed");
      }
    } catch (e) {
      HapticFeedback.trigger("error");
      alert("Checkout network error");
    } finally {
      setSubmittingSale(false);
    }
  };

  const selectedTab = tabs.find(t => t.id === Number(tabId));
  const query = customerSearchQuery.trim().toLowerCase();
  const cleanQueryPhone = customerSearchQuery.replace(/\D/g, "");

  const filteredTabs = tabs.filter(t => {
    if (t.status !== 'open') return false;
    if (!query) return true;
    const nameMatch = t.customer_name?.toLowerCase().includes(query);
    const phoneMatch = t.customer_phone?.toLowerCase().includes(query) || (cleanQueryPhone && (t.customer_phone || "").replace(/\D/g, "").includes(cleanQueryPhone));
    return nameMatch || phoneMatch;
  });

  const filteredCustomers = eventCustomers.filter(c => {
    if (!query) return false;
    const nameMatch = c.buyer_name?.toLowerCase().includes(query);
    const phoneMatch = c.phone_number?.toLowerCase().includes(query) || (c.whatsapp_number && c.whatsapp_number.toLowerCase().includes(query)) || (cleanQueryPhone && (c.phone_number || "").replace(/\D/g, "").includes(cleanQueryPhone));
    const ticketMatch = c.id?.toLowerCase().includes(query) || c.ticket_type?.toLowerCase().includes(query);
    return nameMatch || phoneMatch || ticketMatch;
  });

  const categories = Array.from(new Set(items.map((i: any) => i.category || "General").filter(Boolean))) as string[];
  const filteredItems = items.filter((i: any) => {
    const matchesCategory = selectedCategory === "ALL" || (i.category || "General").toLowerCase() === selectedCategory.toLowerCase();
    const query = catalogSearchQuery.trim().toLowerCase();
    const matchesSearch = !query ||
      (i.name && i.name.toLowerCase().includes(query)) ||
      (i.category && i.category.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="w-full min-h-full flex flex-col md:flex-row bg-brand-off-white">
      {/* Items Grid */}
      <div className="flex-1 p-3 md:p-6 pb-32 md:pb-6 md:overflow-y-auto">
        <div className="flex justify-between items-center mb-3 pb-2 border-b-2 border-brand-navy/20">
          <div>
            <h2 className="font-display text-lg uppercase tracking-wider text-brand-navy">Menu Catalog</h2>
            <p className="text-[10px] font-mono text-brand-navy/60 font-bold uppercase">Tap items to add to order</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                loadCustomers();
                setShowCustomerAuditDrawer(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-brand-accent text-brand-navy border-2 border-brand-navy font-mono text-xs font-black uppercase transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-brand-navy" />
              <span>Customer Audit ({eventCustomers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                loadRecentSales();
                setShowRecentSalesDrawer(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-brand-accent text-brand-navy border-2 border-brand-navy font-mono text-xs font-black uppercase transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5 text-brand-navy" />
              <span>Recent Sales ({recentSalesList.length})</span>
            </button>
          </div>
        </div>

        {/* Search catalog items */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy/50" />
          <input
            type="text"
            value={catalogSearchQuery}
            onChange={(e) => setCatalogSearchQuery(e.target.value)}
            placeholder="Search menu (e.g. Tusker, Burger)..."
            className="w-full pl-9 pr-8 py-2 bg-white border-2 border-brand-navy text-xs font-mono font-bold focus:outline-none uppercase placeholder:normal-case shadow-(--shadow-brut-xs)"
          />
          {catalogSearchQuery && (
            <button
              type="button"
              onClick={() => setCatalogSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-brand-navy/50 hover:text-brand-navy cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category filter pills */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 mb-2 custom-scrollbar items-center">
            <button
              onClick={() => {
                HapticFeedback.trigger("confirmation");
                setSelectedCategory("ALL");
              }}
              className={`px-3 py-1 text-xs font-bold font-mono uppercase border-2 border-brand-navy transition-colors cursor-pointer whitespace-nowrap ${
                selectedCategory === "ALL"
                  ? "bg-brand-navy text-brand-accent shadow-(--shadow-brut-xs)"
                  : "bg-white text-brand-navy hover:bg-stone-100"
              }`}
            >
              ALL ({items.length})
            </button>
            {categories.map(cat => {
              const count = items.filter((i: any) => (i.category || "General").toLowerCase() === cat.toLowerCase()).length;
              const isActive = selectedCategory.toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  onClick={() => {
                    HapticFeedback.trigger("confirmation");
                    setSelectedCategory(isActive ? "ALL" : cat);
                  }}
                  className={`px-3 py-1 text-xs font-bold font-mono uppercase border-2 border-brand-navy transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-brand-navy text-brand-accent shadow-(--shadow-brut-xs)"
                      : "bg-white text-brand-navy hover:bg-stone-100"
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="animate-pulse font-bold uppercase text-brand-navy">Loading Menu...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center border-2 border-brand-navy bg-white font-mono text-xs uppercase font-bold text-brand-navy/60">
            No matching items found. Try another search.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-5 pb-32 md:pb-0">
            {filteredItems.map(item => {
              const hasCountedStock = item.stock_qty !== null && item.stock_qty !== undefined;
              const isOutOfStock = hasCountedStock && Number(item.stock_qty) <= 0;
              return (
                <button 
                  key={item.id}
                  disabled={isOutOfStock}
                  onClick={() => addToCart(item)}
                  className={`flex flex-col items-start p-2.5 sm:p-3 border-2 sm:border-4 border-brand-navy text-left justify-between transition-all group overflow-hidden ${
                    isOutOfStock 
                      ? "bg-gray-100 opacity-60 cursor-not-allowed border-gray-400" 
                      : "bg-white hover:bg-brand-accent/20 active:scale-[0.98] shadow-(--shadow-brut-xs) sm:shadow-(--shadow-brut-sm)"
                  }`}
                >
                  {/* Prominent Product Image if present */}
                  {item.image_url ? (
                    <div className="w-full h-24 sm:h-28 border border-brand-navy overflow-hidden bg-brand-navy/5 mb-2 relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      {hasCountedStock && (
                        <span className={`absolute top-1 right-1 text-[8px] sm:text-[9px] font-mono px-1 py-0.5 border font-black uppercase shadow-xs ${
                          Number(item.stock_qty) <= 0 
                            ? "bg-red-600 text-white border-red-700" 
                            : Number(item.stock_qty) <= (item.low_stock_threshold || 5)
                              ? "bg-amber-400 text-brand-navy border-brand-navy"
                              : "bg-brand-navy text-brand-off-white border-brand-navy"
                        }`}>
                          {Number(item.stock_qty) <= 0 ? "0 LEFT" : `${item.stock_qty} LEFT`}
                        </span>
                      )}
                    </div>
                  ) : null}

                  <div className="w-full flex justify-between items-start gap-1 mb-2">
                    <span className="font-display text-base md:text-lg leading-tight uppercase line-clamp-2">{item.name}</span>
                    {!item.image_url && hasCountedStock && (
                      <span className={`text-[8px] sm:text-[9px] font-mono px-1 py-0.5 border font-bold uppercase whitespace-nowrap shrink-0 ${
                        Number(item.stock_qty) <= 0 
                          ? "bg-red-600 text-white border-red-700" 
                          : Number(item.stock_qty) <= (item.low_stock_threshold || 5)
                            ? "bg-amber-400 text-brand-navy border-brand-navy"
                            : "bg-brand-navy text-brand-off-white border-brand-navy"
                      }`}>
                        {Number(item.stock_qty) <= 0 ? "0 LEFT" : `${item.stock_qty} LEFT`}
                      </span>
                    )}
                  </div>

                  <span className="font-mono font-bold text-xs sm:text-base text-brand-accent bg-brand-navy px-2 py-0.5 sm:py-1 shadow-(--shadow-brut-xs)">
                    KES {Number(item.price).toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile Floating Cart Summary Bar (When Drawer Closed) */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 bg-brand-navy border-t-4 border-brand-accent p-3 shadow-(--shadow-brut-xl-strong) flex items-center justify-between">
        <button 
          onClick={() => {
            HapticFeedback.trigger("confirmation");
            setMobileCartOpen(true);
          }}
          className="flex items-center gap-3 text-left"
        >
          <div className="relative bg-brand-accent text-brand-navy p-2 border-2 border-brand-navy">
            <ShoppingCart className="w-5 h-5" />
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-white text-brand-navy font-mono text-[10px] font-bold px-1.5 py-0.2 border border-brand-navy rounded-full">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-brand-accent flex items-center gap-1">
              Order Ticket <ChevronUp className="w-3 h-3" />
            </div>
            <div className="text-sm font-mono font-bold text-white">KES {total.toLocaleString()}</div>
          </div>
        </button>

        <button 
          disabled={cart.length === 0}
          onClick={() => {
            HapticFeedback.trigger("confirmation");
            setShowCheckout(true);
          }}
          className="bg-brand-accent text-brand-navy font-display text-lg uppercase px-5 py-2.5 border-2 border-brand-navy shadow-(--shadow-brut-xs) active:scale-95 disabled:opacity-40 disabled:scale-100 transition-all"
        >
          Charge
        </button>
      </div>

      {/* Cart Panel (Desktop Sidebar / Mobile Expandable Drawer) */}
      <div className={`
        w-full md:w-80 lg:w-96 bg-white border-l-4 border-brand-navy flex flex-col z-40
        ${mobileCartOpen 
          ? "fixed inset-x-0 bottom-0 top-16 md:relative md:inset-auto md:h-full z-50 shadow-(--shadow-brut-xl-strong)" 
          : "hidden md:flex md:relative md:h-full md:shadow-none"
        }
      `}>
        <div className="p-4 border-b-4 border-brand-navy bg-brand-accent text-brand-navy font-display text-xl uppercase flex justify-between items-center">
          <span className="flex items-center gap-2"><ShoppingCart className="w-6 h-6"/> Ticket ({cart.length})</span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setMobileCartOpen(false)}
              className="md:hidden p-1.5 bg-brand-navy text-white border-2 border-brand-navy hover:bg-brand-navy/80"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('/noise.png')]">
          {cart.map(item => (
            <div key={item.id} className="flex flex-col border-b-2 border-dashed border-brand-navy/30 pb-2">
              <div className="flex items-center gap-2 mb-2">
                {item.image_url && (
                  <div className="w-9 h-9 border border-brand-navy shrink-0 overflow-hidden bg-white shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex justify-between items-start font-bold uppercase text-xs sm:text-sm flex-1">
                  <span className="line-clamp-2">{item.name}</span>
                  <span className="shrink-0 ml-1">KES {(item.price * item.quantity).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs opacity-60">KES {Number(item.price).toLocaleString()} ea</span>
                <div className="flex items-center gap-3 bg-brand-navy text-brand-off-white p-1">
                  <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:text-brand-accent"><Minus className="w-4 h-4"/></button>
                  <span className="font-mono font-bold w-6 text-center">{item.quantity}</span>
                  <button 
                    disabled={item.stock_qty !== null && item.stock_qty !== undefined && item.quantity >= Number(item.stock_qty)}
                    onClick={() => updateQuantity(item.id, 1)} 
                    className="p-1 hover:text-brand-accent disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Plus className="w-4 h-4"/>
                  </button>
                </div>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="h-full flex items-center justify-center text-center opacity-40 font-bold uppercase p-8">Cart is empty. Tap items to add.</div>
          )}
        </div>

        <div className="p-4 bg-brand-navy text-brand-off-white flex flex-col gap-4">
          <div className="flex justify-between items-end">
            <span className="font-bold uppercase text-sm text-brand-accent">Total</span>
            <span className="font-mono text-3xl md:text-4xl">KES {total.toLocaleString()}</span>
          </div>
          <button 
            disabled={cart.length === 0}
            onClick={() => {
              setMobileCartOpen(false);
              setShowCheckout(true);
            }}
            className="w-full bg-brand-accent text-brand-navy font-display text-2xl uppercase py-4 border-2 border-brand-navy shadow-(--shadow-brut-md) hover:bg-white active:translate-y-1 active:shadow-none transition-all disabled:opacity-50"
          >
            Charge
          </button>
        </div>
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 bg-brand-navy/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-brand-off-white w-full max-w-lg border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent) flex flex-col h-[90vh] md:h-auto overflow-y-auto">
            <h2 className="font-display text-3xl uppercase mb-6 border-b-4 border-brand-navy pb-4 flex justify-between items-center">
              Split Payment <span className="font-mono text-brand-accent bg-brand-navy px-3 py-1">KES {total.toLocaleString()}</span>
            </h2>
            
            <div className="space-y-4 flex-1">
              {/* Payment Summary Live Bar */}
              <div className="p-3 border-2 border-brand-navy bg-brand-navy text-brand-off-white flex justify-between items-center text-xs font-mono">
                <div>
                  <span className="opacity-70">TOTAL DUE:</span>{" "}
                  <span className="font-bold text-brand-accent">KES {total.toLocaleString()}</span>
                </div>
                <div>
                  <span className="opacity-70">ENTERED:</span>{" "}
                  <span className="font-bold">KES {currentPaid.toLocaleString()}</span>
                </div>
                <div>
                  {remainingDue > 0 ? (
                    <span className="text-red-400 font-bold">DUE: KES {remainingDue.toLocaleString()}</span>
                  ) : (
                    <span className="text-green-400 font-bold">READY {changeDue > 0 ? `(CHANGE: KES ${changeDue})` : ''}</span>
                  )}
                </div>
              </div>

              {/* Cash Input */}
              <div className="border-4 border-brand-navy p-4 bg-white relative">
                <Banknote className="absolute -top-4 -left-4 w-8 h-8 bg-brand-accent border-2 border-brand-navy p-1 text-brand-navy" />
                <div className="flex justify-between items-center mb-1 ml-4">
                  <label className="text-xs font-bold uppercase">1. Cash</label>
                  {remainingDue > 0 && (
                    <button
                      type="button"
                      onClick={() => fillRemaining('cash')}
                      className="text-[10px] bg-brand-navy text-brand-accent px-2 py-0.5 font-bold uppercase hover:bg-brand-accent hover:text-brand-navy transition-colors border border-brand-navy"
                    >
                      Fill Due (+{remainingDue})
                    </button>
                  )}
                </div>
                <input 
                  type="number" 
                  placeholder="0" 
                  value={cashAmount} 
                  onChange={e => setCashAmount(e.target.value)} 
                  className="w-full text-2xl font-mono p-2 border-2 border-brand-navy bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none" 
                />
              </div>

              {/* M-Pesa Input */}
              <div className="border-4 border-brand-navy p-4 bg-white relative">
                <CreditCard className="absolute -top-4 -left-4 w-8 h-8 bg-[#25D366] border-2 border-brand-navy p-1 text-brand-navy" />
                <div className="flex justify-between items-center mb-1 ml-4">
                  <label className="text-xs font-bold uppercase">2. M-Pesa</label>
                  {remainingDue > 0 && (
                    <button
                      type="button"
                      onClick={() => fillRemaining('mpesa')}
                      className="text-[10px] bg-brand-navy text-brand-accent px-2 py-0.5 font-bold uppercase hover:bg-brand-accent hover:text-brand-navy transition-colors border border-brand-navy"
                    >
                      Fill Due (+{remainingDue})
                    </button>
                  )}
                </div>
                <input 
                  type="number" 
                  placeholder="0" 
                  value={mpesaAmount} 
                  onChange={e => {
                    setMpesaAmount(e.target.value);
                    if (Number(e.target.value) <= 0) {
                      setIsMpesaVerified(false);
                      setMpesaRef("");
                    }
                  }} 
                  className="w-full text-2xl font-mono p-2 border-2 border-brand-navy bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none" 
                />

                {/* Sub-section when M-Pesa amount is entered */}
                {numMpesa > 0 && (
                  <div className="mt-3 pt-3 border-t-2 border-dashed border-brand-navy/30 space-y-3">
                    {/* Verified Green Banner */}
                    {isMpesaVerified && mpesaRef ? (
                      <div className="p-2.5 bg-green-100 border-2 border-green-700 text-green-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0" />
                          <div className="text-xs font-bold">
                            <span>✓ M-Pesa Verified </span>
                            <span className="font-mono bg-white px-1.5 py-0.5 border border-green-700 ml-1">
                              {mpesaRef}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsMpesaVerified(false);
                            setMpesaRef("");
                          }}
                          className="text-[10px] font-bold underline hover:text-red-700 uppercase"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* STK Push Area */}
                        {!showManualMpesa ? (
                          <div className="space-y-2 bg-brand-off-white p-2.5 border-2 border-brand-navy">
                            <label className="block text-[11px] font-bold uppercase text-brand-navy">
                              Customer Phone (for STK Push)
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="tel"
                                placeholder="07XXXXXXXX or 254..."
                                value={mpesaCustomerPhone}
                                onChange={e => setMpesaCustomerPhone(e.target.value)}
                                className="flex-1 p-2 text-sm font-mono border-2 border-brand-navy bg-white focus:ring-2 focus:ring-brand-accent outline-none"
                              />
                              <button
                                type="button"
                                disabled={isTriggeringStk || !mpesaCustomerPhone.trim()}
                                onClick={triggerStkPush}
                                className="bg-[#25D366] text-brand-navy border-2 border-brand-navy px-3 py-2 font-display text-sm uppercase flex items-center gap-1 hover:bg-[#20ba59] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-(--shadow-brut-xs)"
                              >
                                <Zap className="w-4 h-4 fill-brand-navy" />
                                {isTriggeringStk ? "Sending..." : "Prompt Phone"}
                              </button>
                            </div>
                            <div className="pt-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => setShowManualMpesa(true)}
                                className="text-[10px] font-bold uppercase underline text-brand-navy hover:text-brand-accent transition-colors"
                              >
                                Or Customer Paid Till Directly? Enter Code Manually
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Manual Till Fallback Area */
                          <div className="space-y-2 bg-brand-off-white p-2.5 border-2 border-brand-navy">
                            <div className="flex justify-between items-center">
                              <label className="block text-[11px] font-bold uppercase text-brand-navy">
                                M-Pesa Reference / Transaction Code
                              </label>
                              <button
                                type="button"
                                onClick={() => setShowManualMpesa(false)}
                                className="text-[10px] font-bold uppercase underline text-brand-navy hover:text-brand-accent transition-colors"
                              >
                                Switch to STK Push
                              </button>
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="e.g. QKH71829..."
                                value={mpesaRef}
                                onChange={e => {
                                  const val = e.target.value.toUpperCase();
                                  setMpesaRef(val);
                                  setIsMpesaVerified(val.trim().length >= 8);
                                }}
                                className="flex-1 p-2 text-sm font-mono uppercase border-2 border-brand-navy bg-white focus:ring-2 focus:ring-brand-accent outline-none"
                              />
                              {mpesaRef.trim().length >= 8 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsMpesaVerified(true);
                                    HapticFeedback.trigger("confirmation");
                                  }}
                                  className="bg-brand-navy text-brand-accent border-2 border-brand-navy px-3 py-2 font-bold text-xs uppercase hover:bg-brand-accent hover:text-brand-navy transition-colors"
                                >
                                  Confirm
                                </button>
                              )}
                            </div>
                            {mpesaRef && mpesaRef.trim().length < 8 && (
                              <p className="text-[10px] text-amber-700 font-bold uppercase">
                                Format: Valid M-Pesa receipt code is typically 10 characters (e.g. QKH71829XX)
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Staff / Customer Tab Input */}
              <div className="border-4 border-brand-navy p-4 bg-white relative">
                <Users className="absolute -top-4 -left-4 w-8 h-8 bg-brand-navy border-2 border-brand-navy p-1 text-brand-off-white" />
                <div className="flex justify-between items-center mb-1 ml-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold uppercase">3. Staff / VIP Tab</label>
                    <button
                      type="button"
                      onClick={() => setShowNewTabModal(true)}
                      className="text-[10px] bg-brand-accent text-brand-navy px-1.5 py-0.5 border border-brand-navy font-bold uppercase hover:bg-brand-navy hover:text-brand-accent transition-colors"
                    >
                      + New Person
                    </button>
                  </div>
                  {remainingDue > 0 && tabId && (
                    <button
                      type="button"
                      onClick={() => fillRemaining('tab')}
                      className="text-[10px] bg-brand-navy text-brand-accent px-2 py-0.5 font-bold uppercase hover:bg-brand-accent hover:text-brand-navy transition-colors border border-brand-navy"
                    >
                      Fill Due (+{remainingDue})
                    </button>
                  )}
                </div>
                {/* Selected Tab Card or Search Input */}
                {selectedTab ? (
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                    <div className="flex-1 bg-brand-accent/15 border-2 border-brand-navy p-2.5 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-display text-sm uppercase text-brand-navy truncate">
                            {selectedTab.customer_name}
                          </span>
                          <span className="text-[10px] font-mono bg-brand-navy text-brand-accent px-1.5 py-0.5 font-bold uppercase">
                            {selectedTab.customer_phone || "NO PHONE"}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-brand-navy/80 mt-1 flex items-center gap-2">
                          <span>
                            AVAIL: <strong className="text-green-700">KES {(Number(selectedTab.credit_limit) - Number(selectedTab.balance)).toLocaleString()}</strong>
                          </span>
                          <span className="text-brand-navy/60">
                            (LIMIT: KES {Number(selectedTab.credit_limit).toLocaleString()})
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTabId("");
                          setTabAmount("");
                          setCustomerSearchQuery("");
                          setIsSearchDropdownOpen(false);
                        }}
                        className="text-xs font-bold text-brand-navy border-2 border-brand-navy px-2.5 py-1 bg-white uppercase hover:bg-brand-navy hover:text-white transition-colors shrink-0 shadow-(--shadow-brut-xs)"
                      >
                        Change
                      </button>
                    </div>
                    <input 
                      type="number" 
                      placeholder="0" 
                      value={tabAmount} 
                      onChange={e => setTabAmount(e.target.value)} 
                      className="w-full sm:w-28 text-xl font-mono p-2 border-2 border-brand-navy bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none" 
                    />
                  </div>
                ) : (
                  <div className="relative">
                    {/* Backdrop to dismiss search dropdown on click-away */}
                    {isSearchDropdownOpen && (
                      <div 
                        className="fixed inset-0 z-20" 
                        onClick={() => setIsSearchDropdownOpen(false)} 
                      />
                    )}

                    <div className="relative z-30 flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-3 text-brand-navy/50 pointer-events-none" />
                        <input
                          type="text"
                          value={customerSearchQuery}
                          onChange={e => {
                            setCustomerSearchQuery(e.target.value);
                            setIsSearchDropdownOpen(true);
                          }}
                          onFocus={() => setIsSearchDropdownOpen(true)}
                          placeholder="Search open tab or event customer (name/phone)..."
                          className="w-full pl-9 pr-8 py-2 text-xs font-mono border-2 border-brand-navy bg-brand-off-white focus:bg-white focus:ring-2 focus:ring-brand-accent outline-none uppercase"
                        />
                        {customerSearchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerSearchQuery("");
                              setIsSearchDropdownOpen(true);
                            }}
                            className="absolute right-2.5 top-2.5 text-brand-navy/60 hover:text-brand-navy p-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <input 
                        type="number" 
                        placeholder="0" 
                        disabled 
                        value="" 
                        title="Search and select a tab or attendee first"
                        className="w-full sm:w-28 text-xl font-mono p-2 border-2 border-brand-navy bg-gray-100 text-gray-400 outline-none cursor-not-allowed" 
                      />
                    </div>

                    {/* Autocomplete / Search Dropdown Menu */}
                    {isSearchDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border-4 border-brand-navy shadow-(--shadow-brut-lg) max-h-64 overflow-y-auto">
                        {isCreatingTabForCustomer && (
                          <div className="p-3 bg-brand-accent/20 border-b-2 border-brand-navy flex items-center justify-center gap-2 text-xs font-bold text-brand-navy uppercase">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Opening tab for attendee...
                          </div>
                        )}

                        {/* Active Open Tabs Section */}
                        {filteredTabs.length > 0 && (
                          <div>
                            <div className="px-3 py-1.5 bg-brand-navy text-brand-accent text-[10px] font-mono font-bold uppercase tracking-wider flex justify-between items-center sticky top-0 z-10">
                              <span>Open Tabs ({filteredTabs.length})</span>
                              <span className="text-[9px] opacity-75">Active Tab</span>
                            </div>
                            <div className="divide-y divide-brand-navy/10">
                              {filteredTabs.slice(0, 8).map(t => {
                                const avail = Number(t.credit_limit) - Number(t.balance);
                                return (
                                  <button
                                    key={`tab-${t.id}`}
                                    type="button"
                                    onClick={() => {
                                      handleTabSelect(t.id.toString());
                                      setCustomerSearchQuery("");
                                      setIsSearchDropdownOpen(false);
                                    }}
                                    className="w-full p-2.5 text-left hover:bg-brand-accent/20 active:bg-brand-accent/30 transition-colors flex items-center justify-between gap-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-bold text-xs uppercase text-brand-navy truncate">
                                          {t.customer_name}
                                        </span>
                                        <span className="text-[9px] font-mono bg-brand-navy text-brand-off-white px-1 py-0.2 font-bold uppercase">
                                          TAB
                                        </span>
                                        {t.customer_phone && (
                                          <span className="text-[10px] font-mono text-brand-navy/60">
                                            {t.customer_phone}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0 flex items-center gap-1.5">
                                      <span className="font-mono text-xs font-bold text-green-700 block">
                                        KES {avail.toLocaleString()} left
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const matchingCust = eventCustomers.find(c => {
                                            const cPhone = (c.phone_number || "").replace(/\D/g, "");
                                            const tPhone = (t.customer_phone || "").replace(/\D/g, "");
                                            return (cPhone && tPhone && cPhone.slice(-9) === tPhone.slice(-9)) || c.buyer_name.toLowerCase() === t.customer_name.toLowerCase();
                                          });
                                          setSelectedCustomerAudit(matchingCust || {
                                            buyer_name: t.customer_name,
                                            phone_number: t.customer_phone,
                                            tab_id: t.id,
                                            tab_balance_due: Number(t.balance || 0),
                                            tabs: [t],
                                            orders: [],
                                            tickets: [],
                                          });
                                          setShowCustomerAuditDrawer(true);
                                          setIsSearchDropdownOpen(false);
                                        }}
                                        className="p-1 hover:bg-brand-navy hover:text-white border border-brand-navy text-[10px] font-mono font-bold uppercase transition-colors shrink-0 flex items-center gap-1 bg-white cursor-pointer"
                                        title="View Customer Audit Docket"
                                      >
                                        <FileText className="w-3 h-3" />
                                        <span>Audit</span>
                                      </button>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Event Attendees Section (When user searches) */}
                        {filteredCustomers.length > 0 && (
                          <div className={filteredTabs.length > 0 ? "border-t-2 border-brand-navy" : ""}>
                            <div className="px-3 py-1.5 bg-brand-accent text-brand-navy text-[10px] font-mono font-bold uppercase tracking-wider flex justify-between items-center sticky top-0 z-10">
                              <span>Current Event Attendees ({filteredCustomers.length})</span>
                              <span className="text-[9px] font-bold">Tap to Select / Open Tab</span>
                            </div>
                            <div className="divide-y divide-brand-navy/10">
                              {filteredCustomers.slice(0, 10).map((cust, idx) => {
                                const cleanCustPhone = (cust.phone_number || "").replace(/\D/g, "");
                                const hasExistingTab = tabs.some(t => {
                                  const tabPhone = (t.customer_phone || "").replace(/\D/g, "");
                                  if (cleanCustPhone && tabPhone && cleanCustPhone.length >= 9 && tabPhone.length >= 9) {
                                    return tabPhone.endsWith(cleanCustPhone.slice(-9)) || cleanCustPhone.endsWith(tabPhone.slice(-9));
                                  }
                                  return t.customer_name.trim().toLowerCase() === cust.buyer_name.trim().toLowerCase();
                                });

                                return (
                                  <button
                                    key={`cust-${cust.id}-${idx}`}
                                    type="button"
                                    onClick={() => handleSelectCustomer(cust)}
                                    className="w-full p-2.5 text-left hover:bg-brand-accent/20 active:bg-brand-accent/30 transition-colors flex items-center justify-between gap-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <Ticket className="w-3.5 h-3.5 text-brand-navy shrink-0" />
                                        <span className="font-bold text-xs uppercase text-brand-navy truncate">
                                          {cust.buyer_name}
                                        </span>
                                        <span className="text-[9px] font-mono bg-brand-navy/15 text-brand-navy px-1 py-0.2 font-bold uppercase border border-brand-navy/30">
                                          {cust.ticket_type || "TICKET"}
                                        </span>
                                      </div>
                                      <div className="text-[10px] font-mono text-brand-navy/70 mt-0.5">
                                        {cust.phone_number || "No Phone"} {cust.ticket_count > 1 ? `(${cust.ticket_count} tickets)` : ""}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0 flex items-center gap-1.5">
                                      {cust.tab_balance_due > 0 && (
                                        <span className="text-[9px] font-mono font-black bg-red-600 text-white px-1.5 py-0.5 uppercase">
                                          DUE KES {Number(cust.tab_balance_due).toLocaleString()}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedCustomerAudit(cust);
                                          setShowCustomerAuditDrawer(true);
                                          setIsSearchDropdownOpen(false);
                                        }}
                                        className="p-1 hover:bg-brand-navy hover:text-white border border-brand-navy text-[10px] font-mono font-bold uppercase transition-colors shrink-0 flex items-center gap-1 bg-white cursor-pointer"
                                        title="View Customer Audit Docket"
                                      >
                                        <FileText className="w-3 h-3" />
                                        <span>Audit</span>
                                      </button>
                                      <span className="text-[10px] font-mono font-bold text-brand-navy bg-brand-accent/30 border border-brand-navy/40 px-1.5 py-0.5 uppercase">
                                        {hasExistingTab ? "Has Tab" : "+ Open Tab"}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Hint when query is empty */}
                        {!customerSearchQuery.trim() && (
                          <div className="p-2.5 bg-brand-off-white border-t border-brand-navy/20 text-[10px] font-mono text-brand-navy/70 text-center flex items-center justify-center gap-1">
                            <Search className="w-3 h-3 text-brand-navy/50" />
                            Type name or phone to search all event ticket attendees
                          </div>
                        )}

                        {/* Empty State */}
                        {customerSearchQuery.trim() && filteredTabs.length === 0 && filteredCustomers.length === 0 && (
                          <div className="p-4 text-center space-y-2">
                            <p className="text-xs font-mono text-brand-navy/80">
                              No open tabs or event attendees match "{customerSearchQuery}"
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setShowNewTabModal(true);
                                setNewTabName(customerSearchQuery);
                                setIsSearchDropdownOpen(false);
                              }}
                              className="px-3 py-1.5 bg-brand-accent text-brand-navy border-2 border-brand-navy font-bold text-xs uppercase hover:bg-brand-navy hover:text-brand-accent transition-colors shadow-(--shadow-brut-xs)"
                            >
                              + Open New Tab for "{customerSearchQuery}"
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button 
                onClick={() => {
                  setShowCheckout(false);
                  setIsSearchDropdownOpen(false);
                  setCustomerSearchQuery("");
                }} 
                className="flex-1 bg-transparent border-4 border-brand-navy font-bold uppercase p-3 hover:bg-brand-navy/10 text-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                disabled={submittingSale}
                onClick={handleCheckout} 
                className="flex-1 bg-brand-navy text-brand-accent border-4 border-brand-navy font-display uppercase p-3 hover:bg-brand-accent hover:text-brand-navy text-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submittingSale ? "Processing Sale..." : "Confirm & Pay"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Unpaid Remainder Intercept Modal */}
      {showRemainderModal && (
        <div className="fixed inset-0 z-50 bg-brand-navy/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent) text-brand-navy relative">
            <div className="flex justify-between items-center border-b-4 border-brand-navy pb-3 mb-4">
              <h3 className="font-display text-2xl uppercase tracking-wider flex items-center gap-2">
                <Users className="w-6 h-6 text-brand-navy" /> Unpaid Balance
              </h3>
              <button 
                onClick={() => setShowRemainderModal(false)}
                className="border-2 border-brand-navy p-1 hover:bg-brand-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-brand-off-white border-2 border-brand-navy mb-4">
              <p className="text-xs font-bold uppercase opacity-80">Remaining unpaid balance:</p>
              <p className="font-mono text-2xl font-bold text-red-600">KES {remainingDue.toLocaleString()}</p>
            </div>

            <p className="text-xs font-bold uppercase opacity-75 mb-4">
              Put remaining KES {remainingDue.toLocaleString()} on a customer or staff tab?
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Select Existing Tab</label>
                <select 
                  value={remainderTabId} 
                  onChange={e => setRemainderTabId(e.target.value)} 
                  className="w-full border-2 border-brand-navy p-2.5 bg-brand-off-white font-mono text-xs focus:ring-4 focus:ring-brand-accent outline-none"
                >
                  <option value="">Select Tab...</option>
                  {tabs.map(t => {
                    const avail = Number(t.credit_limit) - Number(t.balance);
                    const phoneMask = t.customer_phone ? `...${t.customer_phone.slice(-4)}` : "No Phone";
                    return (
                      <option key={t.id} value={t.id}>
                        {t.customer_name} ({phoneMask}) — KES {avail.toLocaleString()} left
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRemainderModal(false);
                    setShowNewTabModal(true);
                  }}
                  className="w-full py-2 bg-brand-accent text-brand-navy border-2 border-brand-navy font-bold uppercase text-xs flex items-center justify-center gap-2 hover:bg-brand-navy hover:text-brand-accent transition-colors shadow-(--shadow-brut-xs)"
                >
                  <Plus className="w-4 h-4" /> + Open New Tab
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t-2 border-brand-navy">
              <button 
                type="button"
                onClick={() => setShowRemainderModal(false)}
                className="flex-1 py-3 border-2 border-brand-navy font-bold uppercase text-xs hover:bg-brand-navy/10 transition-colors"
              >
                Back to Payment
              </button>
              <button 
                type="button"
                disabled={!remainderTabId}
                onClick={() => {
                  const selected = tabs.find(t => t.id === Number(remainderTabId));
                  if (selected) {
                    const avail = Number(selected.credit_limit) - Number(selected.balance);
                    const fillAmt = Math.max(0, Math.min(remainingDue, avail));
                    setTabId(remainderTabId);
                    setTabAmount(fillAmt.toString());
                    setShowRemainderModal(false);
                    HapticFeedback.trigger("confirmation");
                  }
                }}
                className="flex-1 py-3 bg-brand-navy text-brand-accent border-2 border-brand-navy font-display uppercase text-lg hover:bg-brand-accent hover:text-brand-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Put on Tab
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Person / Tab Modal */}
      {showNewTabModal && (
        <div className="fixed inset-0 z-50 bg-brand-navy/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent) text-brand-navy relative">
            <div className="flex justify-between items-center border-b-4 border-brand-navy pb-3 mb-4">
              <h3 className="font-display text-2xl uppercase tracking-wider flex items-center gap-2">
                <Users className="w-6 h-6" /> Open Customer Tab
              </h3>
              <button 
                onClick={() => setShowNewTabModal(false)}
                className="border-2 border-brand-navy p-1 hover:bg-brand-accent transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs font-bold uppercase opacity-75 mb-4">
              Create a custom name & credit limit for anyone taking items on credit (VIP, staff, or trusted guest).
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Customer / Staff Name *</label>
                <input 
                  type="text"
                  placeholder="e.g. DJ Pierra, MC Dave, Brian"
                  value={newTabName}
                  onChange={e => setNewTabName(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2.5 font-bold uppercase text-sm bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-1">Phone Number (Optional)</label>
                <input 
                  type="tel"
                  placeholder="e.g. 0712345678"
                  value={newTabPhone}
                  onChange={e => setNewTabPhone(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2.5 font-mono text-sm bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-1">Credit Limit (KES)</label>
                <input 
                  type="number"
                  placeholder="5000"
                  value={newTabLimit}
                  onChange={e => setNewTabLimit(e.target.value)}
                  className="w-full border-2 border-brand-navy p-2.5 font-mono text-sm bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none"
                />
                <div className="flex gap-2 mt-2">
                  {[2000, 5000, 10000, 20000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setNewTabLimit(amt.toString())}
                      className="text-[10px] font-mono font-bold border border-brand-navy px-2 py-0.5 bg-brand-off-white hover:bg-brand-accent transition-colors"
                    >
                      {amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t-2 border-brand-navy">
              <button 
                type="button"
                onClick={() => setShowNewTabModal(false)}
                className="flex-1 py-3 border-2 border-brand-navy font-bold uppercase text-xs hover:bg-brand-navy/10 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={() => handleCreateNewTab(remainingDue > 0 ? remainingDue : undefined)}
                className="flex-1 py-3 bg-brand-navy text-brand-accent border-2 border-brand-navy font-display uppercase text-lg hover:bg-brand-accent hover:text-brand-navy transition-colors"
              >
                Save & Select Tab
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STK Waiting Modal */}
      {showStkModal && (
        <div className="fixed inset-0 z-50 bg-brand-navy/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent) text-brand-navy text-center relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowStkModal(false)}
              className="absolute top-4 right-4 border-2 border-brand-navy p-1 hover:bg-brand-accent transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Pulsing ring indicator */}
            <div className="flex justify-center items-center my-6">
              <div className="relative flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-[#25D366]/20 animate-ping absolute" />
                <div className="w-20 h-20 rounded-full border-4 border-[#25D366] bg-[#25D366]/10 flex items-center justify-center relative">
                  <Zap className="w-10 h-10 text-[#25D366] fill-[#25D366]" />
                </div>
              </div>
            </div>

            <h3 className="font-display text-2xl uppercase tracking-wider mb-1">
              M-Pesa STK Prompt Sent
            </h3>
            <p className="text-xs uppercase font-bold text-gray-500 mb-4">
              Ask customer to check phone & enter M-Pesa PIN
            </p>

            <div className="p-3 bg-brand-off-white border-2 border-brand-navy mb-4 text-left font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="opacity-70">PHONE NUMBER:</span>
                <span className="font-bold">{mpesaCustomerPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">AMOUNT DUE:</span>
                <span className="font-bold text-brand-navy text-sm">KES {numMpesa.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">REFERENCE:</span>
                <span className="font-bold">{stkReference}</span>
              </div>
            </div>

            {/* 45s countdown & status */}
            <div className="mb-4">
              <div className="flex items-center justify-center gap-2 mb-2 font-mono">
                <span className="text-xs font-bold uppercase opacity-75">Auto-checking:</span>
                <span className={`text-base font-bold px-2 py-0.5 border-2 border-brand-navy ${
                  stkTimeLeft <= 10 ? "bg-red-500 text-white animate-pulse" : "bg-brand-accent text-brand-navy"
                }`}>
                  {stkTimeLeft}s remaining
                </span>
              </div>
              <p className="text-xs font-bold uppercase text-brand-navy bg-brand-navy/5 py-1.5 px-3 border border-brand-navy/20">
                {stkStatusMessage}
              </p>
            </div>

            {/* Actions: Manual check again + Switch to manual till code */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={isManualCheckingStatus}
                onClick={() => checkMpesaStatus(stkReference, true)}
                className="w-full py-2.5 bg-brand-navy text-brand-accent border-2 border-brand-navy font-bold uppercase text-xs flex items-center justify-center gap-2 hover:bg-brand-accent hover:text-brand-navy transition-colors disabled:opacity-50"
              >
                <RotateCw className={`w-4 h-4 ${isManualCheckingStatus ? "animate-spin" : ""}`} />
                {isManualCheckingStatus ? "Checking PayHero..." : "🔄 Check Status Again"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowStkModal(false);
                  setShowManualMpesa(true);
                }}
                className="w-full py-2.5 bg-brand-off-white text-brand-navy border-2 border-brand-navy font-bold uppercase text-xs flex items-center justify-center gap-2 hover:bg-white transition-colors"
              >
                <FileText className="w-4 h-4" />
                📝 Switch to Manual Till Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Digital Receipt Modal */}
      {completedSale && (
        <div className="fixed inset-0 z-50 bg-brand-navy/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent) text-brand-navy font-mono relative">
            <div className="text-center border-b-4 border-brand-navy pb-3 mb-4">
              <h3 className="font-display text-2xl uppercase tracking-wider">GOODLIFE TICKET & POS</h3>
              <p className="text-[11px] font-bold text-gray-500 uppercase">OFFICIAL ORDER RECEIPT</p>
              <div className="text-xs font-mono font-bold mt-1 bg-brand-accent px-2 py-0.5 inline-block border border-brand-navy">
                {completedSale.saleId}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">{completedSale.time}</div>
            </div>

            {/* Line Items */}
            <div className="space-y-2 border-b-2 border-dashed border-brand-navy/40 pb-3 mb-3 text-xs">
              {completedSale.items.map((it: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center">
                  <span>{it.quantity}x {it.name}</span>
                  <span className="font-bold">KES {(it.price * it.quantity).toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1 text-xs border-b-4 border-brand-navy pb-3 mb-3">
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL CHARGED</span>
                <span className="font-mono text-base">KES {completedSale.total.toLocaleString()}</span>
              </div>
              <div className="pt-2 text-[11px] opacity-80 uppercase font-bold">Payment Methods Breakdown:</div>
              {completedSale.payments.map((p: any, idx: number) => (
                <div key={idx} className="flex justify-between text-[11px] pl-2">
                  <div className="flex flex-col">
                    <span className="uppercase">• {p.method === 'mpesa' ? 'M-Pesa' : p.method === 'cash' ? 'Cash' : 'Staff Tab'}</span>
                    {p.method === 'mpesa' && p.mpesa_ref && (
                      <span className="text-[10px] font-mono text-green-700 pl-2">
                        Ref: {p.mpesa_ref}
                      </span>
                    )}
                  </div>
                  <span>KES {Number(p.amount).toLocaleString()}</span>
                </div>
              ))}
              {completedSale.changeDue > 0 && (
                <div className="flex justify-between text-xs font-bold text-green-700 pt-1">
                  <span>CHANGE DUE:</span>
                  <span>KES {completedSale.changeDue.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button 
                onClick={() => {
                  HapticFeedback.trigger("confirmation");
                  const receiptText = `
========================================
         GOODLIFE FESTIVAL POS
         OFFICIAL ORDER RECEIPT
========================================
Receipt ID: ${completedSale.saleId}
Date/Time:  ${completedSale.time}
----------------------------------------
ITEMS PURCHASED:
${completedSale.items.map((i: any) => `${i.quantity}x ${i.name.padEnd(20)} KES ${(i.price * i.quantity).toLocaleString()}`).join('\n')}
----------------------------------------
TOTAL CHARGED:      KES ${completedSale.total.toLocaleString()}
${completedSale.changeDue > 0 ? `CHANGE DUE:         KES ${completedSale.changeDue.toLocaleString()}\n` : ''}
PAYMENT BREAKDOWN:
${completedSale.payments.map((p: any) => `• ${p.method.toUpperCase().padEnd(16)} KES ${Number(p.amount).toLocaleString()}${p.mpesa_ref ? ` (Ref: ${p.mpesa_ref})` : ''}`).join('\n')}
========================================
      Thank you for partying with us!
          goodlife.smwhr.space
========================================
                  `.trim();

                  const blob = new Blob([receiptText], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `Receipt-${completedSale.saleId}.txt`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="w-full bg-brand-accent text-brand-navy border-2 border-brand-navy py-2.5 font-bold uppercase text-xs flex items-center justify-center gap-2 hover:bg-white transition-colors"
              >
                <Download className="w-4 h-4" /> Download Digital Receipt (.txt)
              </button>
              
              <button 
                onClick={() => setCompletedSale(null)}
                className="w-full bg-brand-navy text-brand-accent border-2 border-brand-navy py-3 font-display uppercase text-lg hover:bg-brand-accent hover:text-brand-navy transition-colors"
              >
                Done / Next Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK RECENT SALES DRAWER */}
      {showRecentSalesDrawer && (
        <div className="fixed inset-0 bg-brand-navy/70 z-50 flex justify-end">
          <div className="w-full max-w-md bg-brand-off-white h-full border-l-4 border-brand-navy p-4 flex flex-col font-mono shadow-(--shadow-brut-lg) animate-in slide-in-from-right duration-200">
            <div className="flex justify-between items-center border-b-3 border-brand-navy pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-brand-navy" />
                <h3 className="font-display text-xl uppercase tracking-wider">Recent Register Sales</h3>
              </div>
              <button 
                onClick={() => setShowRecentSalesDrawer(false)}
                className="p-1 hover:bg-red-500 hover:text-white border-2 border-brand-navy transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold uppercase text-brand-navy/70">
                Last {recentSalesList.length} Transactions
              </span>
              <Link 
                href="/vendor/sales"
                className="text-xs font-black text-brand-navy hover:text-brand-accent underline flex items-center gap-1 uppercase"
              >
                Full Ledger & CSV <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {loadingRecentSales ? (
                <div className="p-8 text-center text-xs font-bold uppercase animate-pulse">Loading recent receipts...</div>
              ) : recentSalesList.length === 0 ? (
                <div className="p-8 text-center text-xs text-brand-navy/60 uppercase">No sales recorded yet this session.</div>
              ) : (
                recentSalesList.slice(0, 20).map((s) => (
                  <div key={s.id} className="p-3 bg-white border-2 border-brand-navy shadow-(--shadow-brut-xs) space-y-1.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-black text-xs uppercase block">{s.id}</span>
                        <span className="text-[10px] text-brand-navy/60">
                          {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Op: {s.operator_name}
                        </span>
                      </div>
                      <span className="font-black text-sm text-brand-navy">KES {s.total.toLocaleString()}</span>
                    </div>

                    <div className="text-[11px] text-brand-navy/80 truncate">
                      {s.items_summary || "—"}
                    </div>

                    <div className="flex flex-wrap gap-1 pt-1 border-t border-gray-100">
                      {s.payments.map((p: any, idx: number) => (
                        <span key={idx} className="text-[9px] font-black px-1.5 py-0.2 bg-brand-navy/10 text-brand-navy uppercase border border-brand-navy/20">
                          {p.method}: KES {Number(p.amount).toLocaleString()}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t-2 border-brand-navy mt-auto">
              <Link
                href="/vendor/sales"
                className="w-full py-2.5 bg-brand-accent text-brand-navy border-2 border-brand-navy font-mono text-xs font-black uppercase flex items-center justify-center gap-2 hover:bg-brand-navy hover:text-white transition-colors shadow-(--shadow-brut-xs)"
              >
                <span>Open Sales Page & Export CSV</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Customer Audit Drawer */}
      {showCustomerAuditDrawer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-4xl bg-brand-off-white h-full border-l-4 border-brand-navy flex flex-col p-4 md:p-6 shadow-(--shadow-brut-xl) animate-in slide-in-from-right duration-200 overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b-2 border-brand-navy">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-navy" />
                <div>
                  <h3 className="font-display text-xl uppercase tracking-wider text-brand-navy">Customer Audit & Dockets</h3>
                  <p className="text-[10px] font-mono text-brand-navy/60 font-bold uppercase">
                    Unified attendee tickets, POS orders & credit tabs
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowCustomerAuditDrawer(false)}
                className="p-1.5 hover:bg-red-500 hover:text-white border-2 border-brand-navy bg-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main content: Responsive Split Layout */}
            <div className="flex-1 flex flex-col md:flex-row gap-4 pt-3 overflow-hidden">
              {/* Left Pane: Customer List & Search */}
              <div className={`w-full md:w-80 flex flex-col shrink-0 border-2 border-brand-navy bg-white p-3 shadow-(--shadow-brut-xs) ${selectedCustomerAudit ? "hidden md:flex" : "flex"}`}>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-navy/50 pointer-events-none" />
                  <input
                    type="text"
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    placeholder="Search attendee / phone..."
                    className="w-full pl-8 pr-2 py-1.5 text-xs font-mono border-2 border-brand-navy bg-brand-off-white outline-none uppercase"
                  />
                </div>

                <div className="text-[10px] font-mono text-brand-navy/70 font-bold mb-1 flex justify-between">
                  <span>Attendees ({eventCustomers.length})</span>
                  <span>Spend / Due</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 divide-y divide-brand-navy/10 pr-1">
                  {eventCustomers
                    .filter((c) => {
                      if (!auditSearchQuery.trim()) return true;
                      const q = auditSearchQuery.toLowerCase();
                      return (
                        (c.buyer_name || "").toLowerCase().includes(q) ||
                        (c.phone_number || "").includes(q) ||
                        (c.ticket_type || "").toLowerCase().includes(q)
                      );
                    })
                    .map((c, i) => {
                      const isSelected = selectedCustomerAudit?.phone_number === c.phone_number || selectedCustomerAudit?.id === c.id;
                      return (
                        <div
                          key={c.id || i}
                          onClick={() => setSelectedCustomerAudit(c)}
                          className={`p-2 cursor-pointer transition-colors text-left flex justify-between items-center gap-2 border ${
                            isSelected
                              ? "bg-brand-accent/30 border-brand-navy shadow-(--shadow-brut-xs)"
                              : "hover:bg-brand-navy/5 border-transparent"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-black text-xs uppercase text-brand-navy truncate">
                              {c.buyer_name || c.name || "Attendee"}
                            </div>
                            <div className="text-[10px] font-mono text-brand-navy/70 truncate">
                              {c.phone_number || c.phoneRaw || "No phone"}
                            </div>
                            <div className="flex gap-1 mt-0.5">
                              {c.ticket_count > 0 && (
                                <span className="text-[8px] font-mono font-bold bg-brand-navy/10 text-brand-navy px-1 py-0.2 uppercase">
                                  {c.ticket_count} Tix
                                </span>
                              )}
                              {(c.order_count || 0) > 0 && (
                                <span className="text-[8px] font-mono font-bold bg-green-100 text-green-800 px-1 py-0.2 uppercase">
                                  {c.order_count} Orders
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {c.tab_balance_due > 0 ? (
                              <span className="text-[9px] font-mono font-black bg-red-600 text-white px-1.5 py-0.5 uppercase block">
                                DUE KES {Number(c.tab_balance_due).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono font-black text-brand-navy block">
                                KES {Number(c.combined_spend || 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Right Pane: Selected Customer Detailed Docket */}
              <div className={`flex-1 flex flex-col border-2 border-brand-navy bg-white p-4 shadow-(--shadow-brut-xs) overflow-y-auto ${!selectedCustomerAudit ? "hidden md:flex items-center justify-center text-center" : "flex"}`}>
                {!selectedCustomerAudit ? (
                  <div className="text-center p-8 space-y-2">
                    <FileText className="w-12 h-12 text-brand-navy/30 mx-auto" />
                    <p className="font-display text-lg uppercase text-brand-navy/60">Select an attendee from the list</p>
                    <p className="text-xs font-mono text-brand-navy/50 max-w-sm mx-auto">
                      View full combined history: bar orders, drinks breakdown, tickets, and settle open tabs directly.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Back button on mobile */}
                    <div className="md:hidden flex items-center justify-between pb-2 border-b border-brand-navy/20">
                      <button
                        onClick={() => setSelectedCustomerAudit(null)}
                        className="flex items-center gap-1 text-xs font-black uppercase text-brand-navy py-1 px-2 border border-brand-navy bg-brand-off-white"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back to list</span>
                      </button>
                    </div>

                    {/* Customer Profile Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-brand-navy">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-display text-2xl uppercase tracking-wider text-brand-navy">
                            {selectedCustomerAudit.buyer_name || selectedCustomerAudit.name || "Attendee"}
                          </h4>
                          {selectedCustomerAudit.is_scanned && (
                            <span className="text-[9px] font-mono font-bold bg-green-600 text-white px-1.5 py-0.5 uppercase">
                              ADMITTED
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono text-brand-navy/70 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            {selectedCustomerAudit.phone_number || selectedCustomerAudit.phoneRaw || "No phone"}
                          </span>
                          {selectedCustomerAudit.whatsapp_number && (
                            <a
                              href={`https://wa.me/${selectedCustomerAudit.whatsapp_number.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-700 hover:underline flex items-center gap-1 font-bold"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              WhatsApp
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadDocketTxt(selectedCustomerAudit)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-off-white hover:bg-brand-navy hover:text-white border-2 border-brand-navy font-mono text-xs font-black uppercase transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Docket</span>
                        </button>
                      </div>
                    </div>

                    {/* KPI Metric Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      <div className="p-2.5 bg-brand-off-white border-2 border-brand-navy">
                        <span className="text-[9px] font-mono font-bold uppercase text-brand-navy/60 block">Stall Spend</span>
                        <span className="text-base font-black text-brand-navy font-mono">
                          KES {Number(selectedCustomerAudit.total_spent || 0).toLocaleString()}
                        </span>
                        <span className="text-[9px] font-mono text-brand-navy/60 block">
                          {selectedCustomerAudit.order_count || (selectedCustomerAudit.orders || []).length} orders
                        </span>
                      </div>

                      <div className="p-2.5 bg-green-50 border-2 border-green-800">
                        <span className="text-[9px] font-mono font-bold uppercase text-green-800 block">Total Paid</span>
                        <span className="text-base font-black text-green-900 font-mono">
                          KES {Number(selectedCustomerAudit.total_paid || 0).toLocaleString()}
                        </span>
                        <span className="text-[9px] font-mono text-green-700 block">
                          {(selectedCustomerAudit.payments || []).length} settlements
                        </span>
                      </div>

                      <div className={`p-2.5 border-2 border-brand-navy ${
                        selectedCustomerAudit.tab_balance_due > 0 ? "bg-red-500 text-white" : "bg-green-100 text-green-950"
                      }`}>
                        <span className="text-[9px] font-mono font-bold uppercase block opacity-80">Balance Due</span>
                        <span className="text-base font-black font-mono">
                          KES {Number(selectedCustomerAudit.tab_balance_due || 0).toLocaleString()}
                        </span>
                        <span className="text-[9px] font-mono block opacity-80">
                          {selectedCustomerAudit.tab_balance_due > 0 ? "Open Tabs" : "Fully Settled"}
                        </span>
                      </div>

                      <div className="p-2.5 bg-brand-off-white border-2 border-brand-navy">
                        <span className="text-[9px] font-mono font-bold uppercase text-brand-navy/60 block">Ticket Spend</span>
                        <span className="text-base font-black text-brand-navy font-mono">
                          KES {Number(selectedCustomerAudit.ticket_spend || 0).toLocaleString()}
                        </span>
                        <span className="text-[9px] font-mono text-brand-navy/60 block">
                          {selectedCustomerAudit.ticket_count || (selectedCustomerAudit.tickets || []).length} passes
                        </span>
                      </div>

                      <div className="p-2.5 bg-brand-off-white border-2 border-brand-navy col-span-2 sm:col-span-1">
                        <span className="text-[9px] font-mono font-bold uppercase text-brand-navy/60 block">Combined Total</span>
                        <span className="text-base font-black text-brand-navy font-mono">
                          KES {Number(selectedCustomerAudit.combined_spend || (Number(selectedCustomerAudit.total_spent || 0) + Number(selectedCustomerAudit.ticket_spend || 0))).toLocaleString()}
                        </span>
                        <span className="text-[9px] font-mono text-brand-navy/60 block">All Systems</span>
                      </div>
                    </div>

                    {/* Items Bought Chips (Issue 1 & 2) */}
                    {(selectedCustomerAudit.items_bought || []).length > 0 && (
                      <div className="p-3 bg-brand-off-white border-2 border-brand-navy space-y-1.5">
                        <span className="text-[10px] font-mono font-bold uppercase text-brand-navy/70 flex items-center gap-1">
                          <ShoppingBag className="w-3 h-3" />
                          Favorite Items Ordered at Stalls
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedCustomerAudit.items_bought.map((it: any, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-white border border-brand-navy text-[11px] font-mono font-bold text-brand-navy flex items-center gap-1 shadow-(--shadow-brut-xs)"
                            >
                              <span>{it.name}</span>
                              <span className="bg-brand-navy text-white text-[9px] px-1 font-bold">x{it.quantity}</span>
                              <span className="text-green-700 font-normal">KES {Number(it.revenue).toLocaleString()}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Customer Tabs Section with direct Settle & Remind (Issues 3, 4, 5) */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center pb-1 border-b border-brand-navy/20">
                        <span className="font-display text-sm uppercase tracking-wider text-brand-navy flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4" />
                          Customer Credit Tabs ({(selectedCustomerAudit.tabs || []).length})
                        </span>
                      </div>

                      {(selectedCustomerAudit.tabs || []).length === 0 ? (
                        <div className="p-3 text-center text-xs font-mono text-brand-navy/50 bg-brand-off-white border border-dashed border-brand-navy/30">
                          No credit tabs opened for this customer.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedCustomerAudit.tabs.map((tab: any) => {
                            const isOutstanding = tab.status !== "settled" && tab.status !== "written_off" && Number(tab.balance || 0) > 0;
                            return (
                              <div
                                key={tab.id}
                                className={`p-3 border-2 border-brand-navy flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                  isOutstanding ? "bg-red-50" : "bg-brand-off-white"
                                }`}
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-xs uppercase font-mono">Tab #{tab.id}</span>
                                    <span className={`text-[9px] font-mono font-black px-1.5 py-0.2 uppercase border ${
                                      tab.status === "open"
                                        ? "bg-green-100 text-green-900 border-green-800"
                                        : "bg-gray-200 text-gray-700 border-gray-400"
                                    }`}>
                                      {tab.status}
                                    </span>
                                  </div>
                                  <div className="text-xs font-mono mt-1 space-x-2">
                                    <span>Balance: <strong className={Number(tab.balance) > 0 ? "text-red-600" : "text-green-700"}>KES {Number(tab.balance || 0).toLocaleString()}</strong></span>
                                    <span className="text-brand-navy/50">|</span>
                                    <span>Limit: KES {Number(tab.credit_limit || 0).toLocaleString()}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isOutstanding && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAuditSettleTab(tab);
                                          setAuditSettleAmount(String(tab.balance || ""));
                                          setAuditSettleMethod("cash");
                                        }}
                                        className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white border border-brand-navy text-xs font-mono font-black uppercase transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
                                      >
                                        Settle Tab
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isRemindingTab === tab.id}
                                        onClick={() => handleAuditSendReminder(tab.id, selectedCustomerAudit.phone_number)}
                                        className="px-2 py-1 bg-white hover:bg-brand-accent text-brand-navy border border-brand-navy text-xs font-mono font-bold uppercase transition-colors shadow-(--shadow-brut-xs) flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                      >
                                        {isRemindingTab === tab.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <MessageSquare className="w-3 h-3 text-green-700" />
                                        )}
                                        <span>Remind</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Customer Payments & Settlements Section */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center pb-1 border-b border-brand-navy/20">
                        <span className="font-display text-sm uppercase tracking-wider text-brand-navy flex items-center gap-1.5">
                          <Banknote className="w-4 h-4 text-green-700" />
                          Payments & Settlements Received ({(selectedCustomerAudit.payments || []).length})
                        </span>
                        {Number(selectedCustomerAudit.total_paid || 0) > 0 && (
                          <span className="text-xs font-mono font-black text-green-700">
                            Total: KES {Number(selectedCustomerAudit.total_paid).toLocaleString()}
                          </span>
                        )}
                      </div>

                      {(selectedCustomerAudit.payments || []).length === 0 ? (
                        <div className="p-3 text-center text-xs font-mono text-brand-navy/50 bg-brand-off-white border border-dashed border-brand-navy/30">
                          No direct tab payments or cash settlements recorded yet.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {selectedCustomerAudit.payments.map((pm: any) => (
                            <div
                              key={pm.id}
                              className="p-2.5 bg-green-50/60 border-2 border-green-800/40 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[9px] font-mono font-black px-1.5 py-0.2 uppercase border ${
                                    pm.method === "cash"
                                      ? "bg-amber-100 text-amber-900 border-amber-800"
                                      : "bg-green-100 text-green-900 border-green-800"
                                  }`}>
                                    {pm.method}
                                  </span>
                                  <span className="font-mono text-[11px] font-bold text-brand-navy">
                                    Tab #{pm.tab_id} Settlement
                                  </span>
                                  {pm.mpesa_ref && (
                                    <span className="font-mono text-[10px] text-green-800 bg-white px-1 border border-green-300">
                                      Ref: {pm.mpesa_ref}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono text-brand-navy/70">
                                  {new Date(pm.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(pm.created_at).toLocaleDateString()}
                                  {pm.operator_name && <span> • Received by {pm.operator_name}</span>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-black font-mono text-green-800 text-sm block">
                                  - KES {Number(pm.amount).toLocaleString()}
                                </span>
                                <span className="text-[9px] font-mono text-green-700 font-bold uppercase">Credited</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* POS Stall Orders History (Issues 1 & 2) */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center pb-1 border-b border-brand-navy/20">
                        <span className="font-display text-sm uppercase tracking-wider text-brand-navy flex items-center gap-1.5">
                          <Receipt className="w-4 h-4" />
                          Stall Orders & Bar History ({(selectedCustomerAudit.orders || []).length})
                        </span>
                      </div>

                      {(selectedCustomerAudit.orders || []).length === 0 ? (
                        <div className="p-3 text-center text-xs font-mono text-brand-navy/50 bg-brand-off-white border border-dashed border-brand-navy/30">
                          No vendor stall sales recorded for this customer.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {selectedCustomerAudit.orders.map((ord: any) => (
                            <div key={ord.id} className="p-2.5 bg-brand-off-white border-2 border-brand-navy text-xs space-y-1">
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="font-black font-mono">Order #{ord.id}</span>
                                  <span className="text-[10px] font-mono text-brand-navy/60 ml-2">
                                    {new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(ord.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                <span className="font-black font-mono text-brand-navy">KES {Number(ord.total).toLocaleString()}</span>
                              </div>
                              <div className="text-[10px] font-mono text-brand-navy/70 flex items-center gap-1">
                                <span className="bg-brand-navy/10 px-1 py-0.2 font-bold uppercase">{ord.payment_method || "POS"}</span>
                              </div>
                              <div className="pt-1 border-t border-brand-navy/10 space-y-0.5">
                                {(ord.items || []).map((it: any, iIdx: number) => (
                                  <div key={iIdx} className="flex justify-between text-[11px] font-mono">
                                    <span>{it.quantity}x {it.item_name}</span>
                                    <span className="text-brand-navy/70">KES {Number(it.line_total || it.price * it.quantity).toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Event Tickets Section */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center pb-1 border-b border-brand-navy/20">
                        <span className="font-display text-sm uppercase tracking-wider text-brand-navy flex items-center gap-1.5">
                          <Ticket className="w-4 h-4" />
                          Event Tickets ({(selectedCustomerAudit.tickets || []).length})
                        </span>
                      </div>

                      {(selectedCustomerAudit.tickets || []).length === 0 ? (
                        <div className="p-3 text-center text-xs font-mono text-brand-navy/50 bg-brand-off-white border border-dashed border-brand-navy/30">
                          No event admission tickets found.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {selectedCustomerAudit.tickets.map((t: any) => (
                            <div key={t.id} className="p-2 bg-brand-off-white border border-brand-navy flex justify-between items-center text-xs font-mono">
                              <div>
                                <span className="font-black uppercase">{t.id}</span>
                                <span className="ml-2 font-bold text-brand-navy/80">{t.ticket_type}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold">KES {Number(t.amount_paid).toLocaleString()}</span>
                                <span className={`text-[9px] font-black px-1 py-0.2 uppercase border ${
                                  t.is_scanned ? "bg-green-100 text-green-900 border-green-700" : "bg-brand-accent/20 text-brand-navy border-brand-navy/30"
                                }`}>
                                  {t.is_scanned ? "Scanned" : "Valid"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settle Tab Modal */}
      {auditSettleTab && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-4 border-brand-navy p-6 w-full max-w-md shadow-(--shadow-brut-xl) space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-2 border-b-2 border-brand-navy">
              <div>
                <h3 className="font-display text-xl uppercase tracking-wider text-brand-navy">Settle Customer Tab</h3>
                <p className="text-[10px] font-mono text-brand-navy/60 font-bold uppercase">
                  Tab #{auditSettleTab.id} • {auditSettleTab.customer_name}
                </p>
              </div>
              <button
                onClick={() => setAuditSettleTab(null)}
                className="p-1 hover:bg-red-500 hover:text-white border-2 border-brand-navy transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAuditSettleTab} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-bold uppercase text-brand-navy/70 mb-1">
                  Outstanding Balance
                </label>
                <div className="text-2xl font-black font-mono text-red-600 bg-red-50 p-2.5 border-2 border-brand-navy">
                  KES {Number(auditSettleTab.balance || 0).toLocaleString()}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold uppercase text-brand-navy/70 mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAuditSettleMethod("cash")}
                    className={`p-2.5 border-2 border-brand-navy font-mono text-xs font-black uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      auditSettleMethod === "cash" ? "bg-brand-navy text-brand-accent shadow-(--shadow-brut-xs)" : "bg-white text-brand-navy"
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditSettleMethod("mpesa")}
                    className={`p-2.5 border-2 border-brand-navy font-mono text-xs font-black uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      auditSettleMethod === "mpesa" ? "bg-brand-navy text-brand-accent shadow-(--shadow-brut-xs)" : "bg-white text-brand-navy"
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                    M-Pesa
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold uppercase text-brand-navy/70 mb-1">
                  Amount Received (KES)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={auditSettleTab.balance}
                  value={auditSettleAmount}
                  onChange={(e) => setAuditSettleAmount(e.target.value)}
                  className="w-full p-2.5 border-2 border-brand-navy font-mono text-xl font-bold bg-brand-off-white outline-none focus:bg-white focus:ring-4 focus:ring-brand-accent"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAuditSettleTab(null)}
                  className="flex-1 py-2.5 border-2 border-brand-navy font-mono text-xs font-bold uppercase hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSettlingTab}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white border-2 border-brand-navy font-mono text-xs font-black uppercase transition-colors shadow-(--shadow-brut-xs) flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSettlingTab ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Confirm Settlement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
