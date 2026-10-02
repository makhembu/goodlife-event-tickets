"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  TrendingUp,
  Package,
  Clock,
  CreditCard,
  Download,
  Phone,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  ChevronRight,
  HandCoins,
  RefreshCw,
  Users,
  Plus,
  Edit2,
  Trash2,
  Printer,
  Search,
  ArrowUpDown,
  Shield,
  Settings,
  Copy,
  Check,
  FileText,
  ShoppingBag,
  DollarSign,
  Store,
  KeyRound,
  UserPlus,
  Tags,
  Tag,
  Settings2,
  Ticket
} from "lucide-react";
import { fmtDate, fmtTime } from "@/lib/utils";
import { toWhatsAppNumber } from "@/lib/phone";

const DEFAULT_SUGGESTED_CATEGORIES = [
  "Drinks",
  "Kitchen",
  "Cocktails",
  "Snacks",
  "Merchandise",
  "VIP Bottles",
  "Shisha & Smokes",
  "Desserts",
  "General"
];

interface VendorDetailDrawerProps {
  vendorId: number | null;
  eventId?: string | number | null;
  isOpen: boolean;
  onClose: () => void;
  onSettlementRecorded?: () => void;
}

export default function VendorDetailDrawer({
  vendorId,
  eventId,
  isOpen,
  onClose,
  onSettlementRecorded
}: VendorDetailDrawerProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"velocity" | "stock" | "sales" | "payments" | "customers" | "operators">("velocity");
  
  // Searches & Filters
  const [salesSearch, setSalesSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [selectedStockCategory, setSelectedStockCategory] = useState<string>("ALL");
  const [paymentTenderFilter, setPaymentTenderFilter] = useState<"all" | "mpesa" | "tab" | "cash">("all");

  // Category Management State
  const [showManageCategoriesModal, setShowManageCategoriesModal] = useState(false);
  const [editingCategoryOldName, setEditingCategoryOldName] = useState<string | null>(null);
  const [editingCategoryNewName, setEditingCategoryNewName] = useState("");
  const [newCategoryNameInput, setNewCategoryNameInput] = useState("");
  const [isSavingCategoryAction, setIsSavingCategoryAction] = useState(false);
  const [categoryNotice, setCategoryNotice] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  // Settlement Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settling, setSettling] = useState(false);

  // Receipt Modal State
  const [receiptModalItem, setReceiptModalItem] = useState<any | null>(null);

  // --- Unified Customer Docket + Tab Actions (Customer Audit) --------------
  //
  // The customer DOCKET button used to call `setReceiptModalItem(cust.transactions[0])`,
  // which opened a single thermal receipt for ONE tender line of ONE order. The
  // API had already returned the customer's full `orders`/`tickets`/`tabs`; the
  // UI discarded all of it. This state holds the whole customer record so the
  // docket can render their complete history across both sales systems.
  const [customerDocket, setCustomerDocket] = useState<any | null>(null);

  // Tab actions operate per-tab, so the in-flight tab id is tracked rather than
  // a single boolean — otherwise a slow reminder on one tab would disable the
  // button on every other card in the grid.
  const [tabBusyId, setTabBusyId] = useState<number | null>(null);
  const [tabNotice, setTabNotice] = useState<{ tabId: number; ok: boolean; text: string } | null>(null);

  // Stock Management State
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [adjustingStockId, setAdjustingStockId] = useState<number | null>(null);
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    category: "Drinks",
    price: "",
    stock_qty: "50",
    low_stock_threshold: "5",
    is_available: true
  });

  // Vendor Profile Edit State
  const [showEditVendorModal, setShowEditVendorModal] = useState(false);
  const [updatingVendor, setUpdatingVendor] = useState(false);
  const [vendorForm, setVendorForm] = useState({
    contact_name: "",
    contact_phone: "",
    commission_rate: "10"
  });

  // Operator Management State
  const [showAddOperatorModal, setShowAddOperatorModal] = useState(false);
  const [submittingOperator, setSubmittingOperator] = useState(false);
  const [newOperator, setNewOperator] = useState({ name: "", pin: "", role: "cashier" });
  const [resettingPinOpId, setResettingPinOpId] = useState<number | null>(null);
  const [pinSuccessNotice, setPinSuccessNotice] = useState<string | null>(null);
  const [takingOverPos, setTakingOverPos] = useState(false);

  const handleTakeoverPos = async () => {
    if (!vendorId) return;
    setTakingOverPos(true);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/login-as`, {
        method: "POST"
      });
      const d = await res.json();
      if (res.ok && d.success) {
        window.location.href = d.redirectUrl || "/vendor/sell";
      } else {
        alert(d.error || "Failed to switch to vendor session");
        setTakingOverPos(false);
      }
    } catch (err: any) {
      alert(err.message || "Network error logging into vendor POS");
      setTakingOverPos(false);
    }
  };

  // Refresh Analytics Data
  //
  // Returns the fetch chain so callers can await a settled render. The tab
  // actions in the Customer Audit depend on this: they must not report success
  // until the balances on screen reflect the payment that was just recorded.
  const refreshData = (): Promise<void> => {
    if (!vendorId) return Promise.resolve();
    const query = eventId && eventId !== "all" && eventId !== "" ? `?eventId=${eventId}` : "";
    return fetch(`/api/admin/vendors/${vendorId}/analytics${query}`)
      .then(async (res) => {
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(resData.error || `Failed to load vendor data (${res.status})`);
        return resData;
      })
      .then((resData) => {
        if (resData.success) {
          setData(resData);
          setCustomerDocket((prev: any) => {
            if (!prev) return null;
            const updated = (resData.customers || []).find((c: any) =>
              (prev.phone && c.phone === prev.phone) ||
              (c.name && c.name === prev.name)
            );
            return updated || prev;
          });
          if (resData.vendor) {
            const resolvedComm = resData.summary?.commissionRate ?? (resData.assignments?.[0]?.commission_rate !== undefined ? resData.assignments[0].commission_rate : 10);
            setVendorForm({
              contact_name: resData.vendor.contact_name || "",
              contact_phone: resData.vendor.contact_phone || "",
              commission_rate: String(resolvedComm ?? 10)
            });
          }
        } else {
          setError(resData.error || "Failed to load vendor data");
        }
      })
      .catch((err) => {
        setError(err.message || "Network error loading vendor data");
      });
  };

  useEffect(() => {
    if (!isOpen || !vendorId) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const query = eventId && eventId !== "all" && eventId !== "" ? `?eventId=${eventId}` : "";
    fetch(`/api/admin/vendors/${vendorId}/analytics${query}`)
      .then(async (res) => {
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(resData.error || `Failed to load vendor data (${res.status})`);
        return resData;
      })
      .then((resData) => {
        if (resData.success) {
          setData(resData);
          setCustomerDocket((prev: any) => {
            if (!prev) return null;
            const updated = (resData.customers || []).find((c: any) =>
              (prev.phone && c.phone === prev.phone) ||
              (c.name && c.name === prev.name)
            );
            return updated || prev;
          });
          if (resData.vendor) {
            const resolvedComm = resData.summary?.commissionRate ?? (resData.assignments?.[0]?.commission_rate !== undefined ? resData.assignments[0].commission_rate : 10);
            setVendorForm({
              contact_name: resData.vendor.contact_name || "",
              contact_phone: resData.vendor.contact_phone || "",
              commission_rate: String(resolvedComm ?? 10)
            });
          }
        } else {
          setError(resData.error || "Failed to load vendor data");
        }
      })
      .catch((err) => {
        setError(err.message || "Network error loading vendor data");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, vendorId, eventId]);

  if (!isOpen || !vendorId) return null;

  const vendor = data?.vendor;
  const summary = data?.summary || {};
  const bestsellers = data?.bestsellers || [];
  const stock = data?.stock || [];
  const sales = data?.sales || [];
  const paymentBreakdown = data?.paymentBreakdown || [];
  const paymentTransactions = data?.paymentTransactions || [];
  const customers = data?.customers || [];
  const operators = data?.operators || [];

  // Extract categories from vendor stock
  const stockCategories = Array.from(
    new Set(stock.map((item: any) => item.category?.trim() || "General").filter(Boolean))
  ) as string[];

  const availableCategories = Array.from(
    new Set([...stockCategories, ...customCategories, ...DEFAULT_SUGGESTED_CATEGORIES])
  );

  const filterCategories = Array.from(
    new Set([...stockCategories, ...customCategories])
  ).filter(Boolean) as string[];

  // Filter stock for Tab 2
  const filteredStock = stock.filter((item: any) => {
    const matchesCategory =
      selectedStockCategory === "ALL" ||
      (item.category || "General").toLowerCase() === selectedStockCategory.toLowerCase();
    const query = stockSearch.toLowerCase().trim();
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      (item.category && item.category.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  const handleAdminRenameCategory = async (oldCat: string, newCat: string) => {
    if (!vendorId) return;
    const cleanOld = oldCat.trim();
    const cleanNew = newCat.trim();
    if (!cleanNew || cleanNew.toLowerCase() === cleanOld.toLowerCase()) {
      setEditingCategoryOldName(null);
      return;
    }
    setIsSavingCategoryAction(true);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/categories`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldCategory: cleanOld, newCategory: cleanNew })
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setCategoryNotice(`Renamed "${cleanOld}" to "${cleanNew}" (${d.count} items updated)`);
        setEditingCategoryOldName(null);
        setEditingCategoryNewName("");
        if (selectedStockCategory.toLowerCase() === cleanOld.toLowerCase()) {
          setSelectedStockCategory(cleanNew);
        }
        setCustomCategories(prev => prev.map(c => c.toLowerCase() === cleanOld.toLowerCase() ? cleanNew : c));
        refreshData();
      } else {
        alert(d.error || "Failed to rename category");
      }
    } catch {
      alert("Error renaming category");
    } finally {
      setIsSavingCategoryAction(false);
    }
  };

  const handleAdminDeleteCategory = async (cat: string) => {
    if (!vendorId) return;
    const cleanCat = cat.trim();
    const count = stock.filter((i: any) => (i.category || "General").toLowerCase() === cleanCat.toLowerCase()).length;
    const confirmMsg = count > 0
      ? `Category "${cleanCat}" has ${count} product(s). Deleting it will reassign all these items to "General". Proceed?`
      : `Delete category "${cleanCat}"?`;
    if (!confirm(confirmMsg)) return;

    setIsSavingCategoryAction(true);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/categories`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cleanCat, reassignTo: "General" })
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setCategoryNotice(`Deleted category "${cleanCat}" and reassigned items to "General"`);
        if (selectedStockCategory.toLowerCase() === cleanCat.toLowerCase()) {
          setSelectedStockCategory("ALL");
        }
        setCustomCategories(prev => prev.filter(c => c.toLowerCase() !== cleanCat.toLowerCase()));
        refreshData();
      } else {
        alert(d.error || "Failed to delete category");
      }
    } catch {
      alert("Error deleting category");
    } finally {
      setIsSavingCategoryAction(false);
    }
  };

  const handleAdminAddNewCategory = (catName: string) => {
    const clean = catName.trim();
    if (!clean) return;
    if (availableCategories.some(c => c.toLowerCase() === clean.toLowerCase())) {
      alert(`Category "${clean}" already exists.`);
      return;
    }
    setCustomCategories(prev => [...prev, clean]);
    setNewCategoryNameInput("");
    setCategoryNotice(`Category "${clean}" created! You can now assign items to it.`);
  };

  // Filter sales for Tab 5
  const filteredSales = sales.filter((s: any) => {
    if (!salesSearch.trim()) return true;
    const q = salesSearch.toLowerCase();
    const idMatch = s.id?.toLowerCase().includes(q);
    const opMatch = s.operator_name?.toLowerCase().includes(q);
    const itemMatch = s.items?.some((i: any) => i.item_name?.toLowerCase().includes(q));
    const payMatch = s.payments?.some((p: any) => 
      p.method?.toLowerCase().includes(q) || 
      p.mpesa_ref?.toLowerCase().includes(q) ||
      p.customer_name?.toLowerCase().includes(q)
    );
    return idMatch || opMatch || itemMatch || payMatch;
  });

  // Filter payment transactions for Tab 3
  const filteredPaymentTransactions = paymentTransactions.filter((pt: any) => {
    if (paymentTenderFilter !== "all" && pt.method?.toLowerCase() !== paymentTenderFilter) {
      return false;
    }
    if (!salesSearch.trim()) return true;
    const q = salesSearch.toLowerCase();
    return (
      pt.customer_name?.toLowerCase().includes(q) ||
      pt.customer_phone?.includes(q) ||
      pt.mpesa_ref?.toLowerCase().includes(q) ||
      pt.sale_id?.toLowerCase().includes(q) ||
      pt.items?.some((it: any) => it.item_name?.toLowerCase().includes(q))
    );
  });

  // Filter customer directory for Tab 4
  const filteredCustomers = customers.filter((c: any) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.phoneRaw?.toLowerCase().includes(q) ||
      c.itemsBought?.some((it: any) => it.name?.toLowerCase().includes(q)) ||
      // Tabs and tickets are searchable too: an operator chasing "who has an
      // outstanding balance" searches the customer name and expects the tab
      // state to narrow with it.
      c.tabs?.some((t: any) => String(t.id) === q || t.status?.toLowerCase().includes(q)) ||
      c.tickets?.some((t: any) => t.ticket_type?.toLowerCase().includes(q))
    );
  });

  // --- Tab actions from the Customer Audit --------------------------------
  //
  // These hit the same `/api/vendor/tabs/*` endpoints the vendor's own tabs page
  // uses. They accept the admin cookie (see middleware.ts + lib/vendor-tab-auth.ts),
  // so an admin can settle or chase a balance from the dashboard instead of
  // having to log into a stall operator's PIN.
  //
  // Every action re-fetches analytics afterwards. The balance shown on these
  // cards is a denormalized copy of `customer_tabs.balance`, and a settle that
  // succeeds server-side but leaves a stale card on screen is how an operator
  // ends up asking a customer to pay a debt they have already cleared.
  const runTabAction = async (
    tabId: number,
    action: "remind" | "pay" | "close",
    payload?: Record<string, unknown>
  ) => {
    setTabBusyId(tabId);
    setTabNotice(null);
    try {
      const res = await fetch(`/api/vendor/tabs/${tabId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        setTabNotice({
          tabId,
          ok: false,
          text: data?.message || data?.error || `Request failed (HTTP ${res.status})`
        });
        return;
      }
      setTabNotice({
        tabId,
        ok: true,
        text:
          action === "remind"
            ? "Reminder sent"
            : action === "pay"
              ? "Payment recorded"
              : "Tab settled"
      });
      await refreshData();
    } catch (err: any) {
      setTabNotice({
        tabId,
        ok: false,
        text: err?.message || "Could not reach the server. Nothing was changed — please retry."
      });
    } finally {
      setTabBusyId(null);
      // Auto-clear the confirmation so a stale success banner can't outlive the
      // card it referred to.
      setTimeout(() => setTabNotice(null), 6000);
    }
  };

  /** Settle a tab in full via cash — the common festival-closeout case. */
  const settleTabInFull = async (tab: any) => {
    const due = Number(tab.amount_due || 0);
    if (due <= 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Record a CASH payment of KES ${due.toLocaleString()} against tab #${tab.id} (${tab.customer_name})?\n\nThis reduces the outstanding balance to KES 0.`
      )
    ) {
      return;
    }
    await runTabAction(tab.id, "pay", { amount: due, method: "cash" });
  };

  // Stock Actions Handlers
  const handleQuickAdjustStock = async (itemId: number, delta: number) => {
    setAdjustingStockId(itemId);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, stockAdjustment: delta })
      });
      if (res.ok) {
        refreshData();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Failed to adjust stock");
      }
    } catch {
      alert("Network error adjusting stock");
    } finally {
      setAdjustingStockId(null);
    }
  };

  const handleToggleItemStatus = async (item: any) => {
    setAdjustingStockId(item.id);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, is_available: !item.is_available })
      });
      if (res.ok) {
        refreshData();
      }
    } catch {
      alert("Error updating status");
    } finally {
      setAdjustingStockId(null);
    }
  };

  const handleSaveProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingProduct(true);
    try {
      if (editingItem) {
        // Edit existing item
        const res = await fetch(`/api/admin/vendors/${vendorId}/items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: editingItem.id,
            name: productForm.name,
            category: productForm.category,
            price: productForm.price,
            stock_qty: productForm.stock_qty,
            low_stock_threshold: productForm.low_stock_threshold,
            is_available: productForm.is_available
          })
        });
        if (res.ok) {
          setShowAddProductModal(false);
          setEditingItem(null);
          refreshData();
        } else {
          const d = await res.json().catch(() => ({}));
          alert(d.error || "Failed to update product");
        }
      } else {
        // Add new item
        const res = await fetch(`/api/admin/vendors/${vendorId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId ? Number(eventId) : 2,
            name: productForm.name,
            category: productForm.category,
            price: productForm.price,
            stock_qty: productForm.stock_qty,
            low_stock_threshold: productForm.low_stock_threshold,
            is_available: productForm.is_available
          })
        });
        if (res.ok) {
          setShowAddProductModal(false);
          setProductForm({
            name: "",
            category: "Drinks",
            price: "",
            stock_qty: "50",
            low_stock_threshold: "5",
            is_available: true
          });
          refreshData();
        } else {
          const d = await res.json().catch(() => ({}));
          alert(d.error || "Failed to add product");
        }
      }
    } catch {
      alert("Error saving product");
    } finally {
      setSubmittingProduct(false);
    }
  };

  const handleDeleteItem = async (itemId: number, itemName: string) => {
    if (!confirm(`Are you sure you want to delete "${itemName}" from this vendor's catalog?`)) return;
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/items?itemId=${itemId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        refreshData();
      } else {
        alert("Failed to delete item");
      }
    } catch {
      alert("Error deleting item");
    }
  };

  // Profile Edit Handler
  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setUpdatingVendor(true);
    try {
      const parsedComm = parseFloat(vendorForm.commission_rate);
      const commissionRate = isNaN(parsedComm) ? 10.0 : parsedComm;
      const res = await fetch(`/api/admin/vendors/${vendorId}/analytics`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name: vendorForm.contact_name,
          contact_phone: vendorForm.contact_phone,
          commission_rate: commissionRate,
          event_id: eventId ? Number(eventId) : (data?.assignments?.[0]?.event_id || 2)
        })
      });
      if (res.ok) {
        setShowEditVendorModal(false);
        refreshData();
        if (onSettlementRecorded) onSettlementRecorded();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Failed to update profile");
      }
    } catch {
      alert("Error updating profile");
    } finally {
      setUpdatingVendor(false);
    }
  };
  const handleUpdateVendorProfile = handleSaveProfile;

  // Operator Handlers
  const handleAddOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingOperator(true);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/operators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOperator)
      });
      if (res.ok) {
        setShowAddOperatorModal(false);
        setNewOperator({ name: "", pin: "", role: "cashier" });
        refreshData();
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Failed to create operator");
      }
    } catch {
      alert("Error creating operator");
    } finally {
      setSubmittingOperator(false);
    }
  };

  const handleResetOperatorPin = async (operatorId: number, operatorName: string) => {
    if (!confirm(`Generate a new 4-digit PIN for cashier "${operatorName}"?`)) return;
    setResettingPinOpId(operatorId);
    setPinSuccessNotice(null);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId, sendWhatsApp: true })
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setPinSuccessNotice(`PIN for ${operatorName} reset to: ${d.pin} ${d.whatsAppSent ? "(WhatsApp sent)" : ""}`);
        refreshData();
      } else {
        alert(d.error || "Failed to reset PIN");
      }
    } catch {
      alert("Error resetting PIN");
    } finally {
      setResettingPinOpId(null);
    }
  };

  const handleDeleteOperator = async (operatorId: number, operatorName: string) => {
    if (!confirm(`Remove operator "${operatorName}" from this stall?`)) return;
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/operators?operatorId=${operatorId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        refreshData();
      } else {
        alert("Failed to remove operator");
      }
    } catch {
      alert("Error removing operator");
    }
  };

  // Settlement submission
  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(settleAmount);
    if (!num || num <= 0) return;

    setSettling(true);
    try {
      const activeAssignment = data?.assignments?.[0];
      const res = await fetch("/api/admin/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: activeAssignment?.id || 0,
          vendor_id: vendorId,
          event_id: eventId ? Number(eventId) : (activeAssignment?.event_id || 2),
          amount: num
        })
      });
      if (res.ok) {
        setShowSettleModal(false);
        setSettleAmount("");
        refreshData();
        if (onSettlementRecorded) onSettlementRecorded();
      } else {
        alert("Failed to record settlement");
      }
    } catch {
      alert("Error recording settlement");
    } finally {
      setSettling(false);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (!sales || sales.length === 0) {
      alert("No sales recorded to export.");
      return;
    }

    const headers = [
      "Sale ID",
      "Date & Time",
      "Event",
      "Total (KES)",
      "Operator",
      "Customer",
      "Phone",
      "Payment Methods",
      "Items Purchased",
      "Status"
    ];

    const rows = sales.map((s: any) => {
      const itemsStr = (s.items || [])
        .map((i: any) => `${i.item_name} x${i.quantity} (KES ${i.line_total})`)
        .join("; ");
      const paymentsStr = (s.payments || [])
        .map((p: any) => `${p.method?.toUpperCase()}: KES ${p.amount}${p.mpesa_ref ? ` (${p.mpesa_ref})` : ""}`)
        .join("; ");
      const customerName = s.customer_name || s.payments?.[0]?.customer_name || "Walk-in";
      const customerPhone = s.customer_phone || s.payments?.[0]?.customer_phone || "";

      return [
        s.id,
        new Date(s.created_at).toLocaleString(),
        `"${s.event_title || ""}"`,
        Number(s.total),
        `"${s.operator_name || ""}"`,
        `"${customerName}"`,
        `"${customerPhone}"`,
        `"${paymentsStr}"`,
        `"${itemsStr}"`,
        s.payment_status?.toUpperCase()
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(vendor?.name || "VENDOR").replace(/\s+/g, "_")}_SALES_REPORT_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Receipt helpers: normalizes either a sale or a paymentTransaction
  const normalizeReceipt = (item: any) => {
    if (!item) return null;
    const isSale = !!item.items && Array.isArray(item.payments);
    const id = isSale ? item.id : (item.sale_id || item.id);
    const date = item.created_at ? new Date(item.created_at) : new Date();
    const items = item.items || [];
    const total = isSale ? Number(item.total || 0) : Number(item.amount || 0);
    const operator = item.operator_name || "Cashier";
    const customer = item.customer_name || item.payer_name || (item.tab_id ? `Tab Holder #${item.tab_id}` : "Walk-in Guest");
    const phone = item.customer_phone || item.payer_phone || "";
    const payments = isSale 
      ? (item.payments || []) 
      : [{ method: item.method, amount: item.amount, mpesa_ref: item.mpesa_ref, tab_id: item.tab_id }];

    return {
      id,
      date,
      items,
      total,
      operator,
      customer,
      phone,
      payments,
      vendorName: vendor?.name || "GOODLIFE VENDOR",
      eventTitle: item.event_title || "GOODLIFE EVENT"
    };
  };

  const currentReceipt = normalizeReceipt(receiptModalItem);

  const handleDownloadDocketTxt = () => {
    if (!currentReceipt) return;
    const r = currentReceipt;
    const dateStr = r.date.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = r.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    let lines = [
      "========================================",
      "           GOODLIFE FESTIVAL            ",
      `        ${r.vendorName.toUpperCase()}        `,
      "========================================",
      `DOCKET:   ${r.id}`,
      `DATE:     ${dateStr} ${timeStr}`,
      `OPERATOR: ${r.operator}`,
      `CUSTOMER: ${r.customer} ${r.phone ? `(${r.phone})` : ""}`,
      "----------------------------------------",
      "QTY  ITEM                        AMOUNT ",
      "----------------------------------------"
    ];

    r.items.forEach((it: any) => {
      const name = (it.item_name || "Item").padEnd(24, " ").substring(0, 24);
      const qty = String(it.quantity || 1).padEnd(4, " ");
      const amt = `KES ${Number(it.line_total || it.unit_price || 0).toLocaleString()}`.padStart(10, " ");
      lines.push(`${qty}${name}${amt}`);
    });

    lines.push("----------------------------------------");
    lines.push(`SUBTOTAL:                   KES ${r.total.toLocaleString()}`);
    lines.push(`TOTAL PAID:                 KES ${r.total.toLocaleString()}`);
    lines.push("----------------------------------------");
    lines.push("PAYMENT TENDERS:");
    r.payments.forEach((p: any) => {
      const m = (p.method || "TENDER").toUpperCase();
      const ref = p.mpesa_ref ? ` [${p.mpesa_ref}]` : p.tab_id ? ` [Tab #${p.tab_id}]` : "";
      lines.push(`- ${m}${ref}: KES ${Number(p.amount || 0).toLocaleString()}`);
    });
    lines.push("========================================");
    lines.push("      THANK YOU FOR CELEBRATING!        ");
    lines.push("========================================");

    const txt = lines.join("\r\n");
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RECEIPT_${r.id}_${r.vendorName.replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const getWhatsAppShareUrl = () => {
    if (!currentReceipt) return "#";
    const r = currentReceipt;
    const dateStr = r.date.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = r.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const itemsList = r.items.map((it: any) => `• ${it.quantity}x ${it.item_name} (KES ${Number(it.line_total).toLocaleString()})`).join("%0A");
    
    const text = `*GOODLIFE FESTIVAL - OFFICIAL RECEIPT*%0A` +
      `*Stall:* ${encodeURIComponent(r.vendorName)}%0A` +
      `*Docket ID:* ${r.id}%0A` +
      `*Date:* ${dateStr} ${timeStr}%0A` +
      `*Customer:* ${encodeURIComponent(r.customer)}%0A%0A` +
      `*ITEMS PURCHASED:*%0A${itemsList}%0A%0A` +
      `*TOTAL PAID: KES ${r.total.toLocaleString()}*%0A%0A` +
      `Thank you for partying with us at Goodlife! 🎉`;

    const cleanPh = r.phone?.replace(/\D/g, "") || "";
    const intlPh = cleanPh.startsWith("0") ? "254" + cleanPh.slice(1) : cleanPh;
    return intlPh ? `https://wa.me/${intlPh}?text=${text}` : `https://wa.me/?text=${text}`;
  };

  const cleanVendorPhone = vendor?.contact_phone?.replace(/\D/g, "") || "";
  const intlVendorPhone = cleanVendorPhone.startsWith("0") ? "254" + cleanVendorPhone.slice(1) : cleanVendorPhone;

  return (
    <>
      {/* Scoped CSS for Thermal Receipt printing */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #thermal-receipt-printable,
          #thermal-receipt-printable * {
            visibility: visible !important;
          }
          #thermal-receipt-printable {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 8mm 4mm !important;
            background: #fff !important;
            color: #000 !important;
            font-family: monospace !important;
            box-shadow: none !important;
            border: none !important;
            z-index: 999999 !important;
          }
        }
      `}</style>

      <div
        className="fixed inset-0 z-50 bg-[var(--brand-navy)]/80 backdrop-blur-sm flex justify-end transition-opacity duration-200"
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      >
        <div className="w-full max-w-5xl bg-[var(--brand-off-white)] h-full overflow-y-auto border-l-4 border-[var(--brand-navy)] flex flex-col shadow-(--shadow-brut-xl)">
          
          {/* TOP APP HEADER */}
          <div className="bg-[var(--brand-navy)] text-[var(--brand-off-white)] p-3 sm:p-5 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-b-4 border-yellow-400 sticky top-0 z-20">
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="text-[9px] sm:text-[10px] font-mono font-black uppercase bg-yellow-300 text-[var(--brand-navy)] px-1.5 sm:px-2 py-0.5">
                  VENDOR INTELLIGENCE
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono uppercase bg-white/20 px-1.5 sm:px-2 py-0.5">
                  #{vendorId}
                </span>
                {vendor?.status && (
                  <span className="text-[9px] sm:text-[10px] font-black uppercase bg-emerald-500 text-white px-1.5 sm:px-2 py-0.5">
                    {vendor.status}
                  </span>
                )}
                <span className="text-[9px] sm:text-[10px] font-mono uppercase bg-white/10 px-1.5 sm:px-2 py-0.5 text-stone-300">
                  COMM: {summary.commissionRate ?? 10}%
                </span>
              </div>
              
              <h2 className="text-lg sm:text-2xl md:text-3xl font-sans font-black uppercase tracking-tight text-white mt-1 break-words">
                {loading ? "LOADING VENDOR..." : vendor?.name || "VENDOR DATA"}
              </h2>
              
              <div className="text-[11px] sm:text-xs text-stone-300 font-bold uppercase mt-1 flex items-center gap-2 sm:gap-3 flex-wrap">
                {vendor?.contact_name && (
                  <span>Contact: <strong className="text-white">{vendor.contact_name}</strong></span>
                )}
                {vendor?.contact_phone && (
                  <span>· Tel: <strong className="text-white font-mono">{vendor.contact_phone}</strong></span>
                )}
                <button
                  onClick={() => setShowEditVendorModal(true)}
                  className="inline-flex items-center gap-1 text-[10px] font-black uppercase bg-white/10 hover:bg-yellow-300 hover:text-[var(--brand-navy)] text-yellow-300 px-2 py-0.5 border border-yellow-300/40 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-2.5 h-2.5" /> EDIT PROFILE
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleTakeoverPos}
                disabled={takingOverPos}
                className="flex-1 sm:flex-none justify-center px-2.5 sm:px-3 py-1.5 sm:py-2 bg-yellow-300 hover:bg-white text-[var(--brand-navy)] border-2 border-white font-mono font-black text-[11px] sm:text-xs uppercase flex items-center gap-1.5 transition-colors shadow-(--shadow-brut-xs) cursor-pointer disabled:opacity-50 text-center"
                title="Log in to POS as this vendor to sell items if vendor has left"
              >
                <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--brand-navy)] shrink-0" />
                <span className="truncate">{takingOverPos ? "ENTERING POS..." : "POS TAKEOVER ↗"}</span>
              </button>
              {intlVendorPhone && (
                <a
                  href={`https://wa.me/${intlVendorPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 sm:p-2 bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-white transition-colors shadow-(--shadow-brut-xs) flex items-center justify-center shrink-0 min-w-[34px] min-h-[34px] sm:min-w-[38px] sm:min-h-[38px]"
                  title="Message Vendor on WhatsApp"
                >
                  <MessageSquare className="w-4 h-4" />
                </a>
              )}
              {vendor?.contact_phone && (
                <a
                  href={`tel:${vendor.contact_phone}`}
                  className="p-1.5 sm:p-2 bg-blue-600 hover:bg-blue-500 text-white border-2 border-white transition-colors shadow-(--shadow-brut-xs) flex items-center justify-center shrink-0 min-w-[34px] min-h-[34px] sm:min-w-[38px] sm:min-h-[38px]"
                  title="Call Vendor"
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
              <button
                onClick={onClose}
                className="p-1.5 sm:p-2 border-2 border-white hover:bg-red-600 hover:text-white transition-colors text-white cursor-pointer flex items-center justify-center shrink-0 min-w-[34px] min-h-[34px] sm:min-w-[38px] sm:min-h-[38px]"
                title="Close Drawer"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>

          {/* PIN SUCCESS NOTICE */}
          {pinSuccessNotice && (
            <div className="bg-emerald-100 border-b-2 border-emerald-600 px-4 py-2 flex items-center justify-between text-xs font-black uppercase text-emerald-950">
              <span className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                {pinSuccessNotice}
              </span>
              <button onClick={() => setPinSuccessNotice(null)} className="text-stone-500 hover:text-black">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* BODY CONTAINER */}
          <div className="p-3 sm:p-6 flex-1 space-y-4 sm:space-y-6">
            {loading ? (
              <div className="py-20 text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[var(--brand-navy)] mb-2" />
                <p className="text-xs font-black uppercase text-[var(--brand-navy)]">Fetching vendor stock and sales records...</p>
              </div>
            ) : error ? (
              <div className="p-4 bg-red-100 border-2 border-red-600 text-red-900 font-bold uppercase text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p>Error: {error}</p>
                <button
                  onClick={refreshData}
                  className="px-3 py-1.5 bg-red-600 text-white font-black hover:bg-black uppercase border border-red-900 transition-colors w-fit cursor-pointer"
                >
                  RETRY
                </button>
              </div>
            ) : (
              <>
                {/* FINANCIAL OVERVIEW KPIS (COMPACT ON MOBILE) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                  <div className="border-2 sm:border-3 border-[var(--brand-navy)] bg-white p-2.5 sm:p-3 shadow-(--shadow-brut-xs)">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Gross Sales</p>
                    <p className="text-base sm:text-xl font-mono font-black text-[var(--brand-navy)] mt-0.5 sm:mt-1 truncate">
                      KES {Number(summary.totalGross || 0).toLocaleString()}
                    </p>
                    <p className="text-[8px] sm:text-[9px] text-[var(--brand-navy-light)] font-bold">{summary.orderCount || 0} orders</p>
                  </div>

                  <div className="border-2 sm:border-3 border-[var(--brand-navy)] bg-white p-2.5 sm:p-3 shadow-(--shadow-brut-xs)">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Avg Ticket</p>
                    <p className="text-base sm:text-xl font-mono font-black text-[var(--brand-navy)] mt-0.5 sm:mt-1 truncate">
                      KES {Number(summary.avgOrderValue || 0).toLocaleString()}
                    </p>
                    <p className="text-[8px] sm:text-[9px] text-[var(--brand-navy-light)] font-bold">per customer</p>
                  </div>

                  <div className="border-2 sm:border-3 border-[var(--brand-navy)] bg-white p-2.5 sm:p-3 shadow-(--shadow-brut-xs)">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Comm ({summary.commissionRate ?? 10}%)</p>
                    <p className="text-base sm:text-xl font-mono font-black text-amber-700 mt-0.5 sm:mt-1 truncate">
                      KES {Number(summary.commissionOwed || 0).toLocaleString()}
                    </p>
                    <p className="text-[8px] sm:text-[9px] text-amber-800 font-bold">festival share</p>
                  </div>

                  <div className="border-2 sm:border-3 border-[var(--brand-navy)] bg-white p-2.5 sm:p-3 shadow-(--shadow-brut-xs)">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Settled</p>
                    <p className="text-base sm:text-xl font-mono font-black text-emerald-700 mt-0.5 sm:mt-1 truncate">
                      KES {Number(summary.settledAmount || 0).toLocaleString()}
                    </p>
                    <p className="text-[8px] sm:text-[9px] text-emerald-800 font-bold">recorded paid</p>
                  </div>

                  <div className="border-2 sm:border-3 border-[var(--brand-navy)] bg-white p-2.5 sm:p-3 shadow-(--shadow-brut-xs)">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Balance Due</p>
                    <p className="text-base sm:text-xl font-mono font-black text-red-600 mt-0.5 sm:mt-1 truncate">
                      KES {Number(summary.outstandingDue || 0).toLocaleString()}
                    </p>
                    <p className="text-[8px] sm:text-[9px] text-red-700 font-bold">unsettled</p>
                  </div>

                  <div className="border-2 sm:border-3 border-[var(--brand-navy)] bg-white p-2.5 sm:p-3 shadow-(--shadow-brut-xs)">
                    <p className="text-[9px] sm:text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Net to Vendor</p>
                    <p className="text-base sm:text-xl font-mono font-black text-blue-700 mt-0.5 sm:mt-1 truncate">
                      KES {Number(summary.netPayout || 0).toLocaleString()}
                    </p>
                    <p className="text-[8px] sm:text-[9px] text-blue-800 font-bold">after comms</p>
                  </div>
                </div>

                {/* ACTION TOOLBAR: EXPORT + SETTLE */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs)">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase text-[var(--brand-navy)]">STALL STAFF:</span>
                    <div className="flex flex-wrap gap-1">
                      {operators.length > 0 ? (
                        operators.map((op: any) => (
                          <span key={op.id} className="text-[10px] font-mono font-bold bg-stone-100 border border-[var(--brand-navy)] px-2 py-0.5">
                            {op.name} ({op.role})
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] italic text-[var(--brand-navy-light)]">None assigned</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={handleExportCSV}
                      className="text-xs font-black uppercase px-3 py-2 sm:py-1.5 bg-white border-2 border-[var(--brand-navy)] hover:bg-stone-100 transition-colors flex items-center justify-center gap-1.5 shadow-(--shadow-brut-xs) cursor-pointer text-center"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">EXPORT CSV</span>
                    </button>
                    <button
                      onClick={() => {
                        setSettleAmount(summary.outstandingDue > 0 ? summary.outstandingDue.toString() : "");
                        setShowSettleModal(true);
                      }}
                      className="text-xs font-black uppercase px-3 py-2 sm:py-1.5 bg-yellow-300 text-[var(--brand-navy)] border-2 border-[var(--brand-navy)] hover:bg-[var(--brand-navy)] hover:text-white transition-colors flex items-center justify-center gap-1.5 shadow-(--shadow-brut-xs) cursor-pointer text-center"
                    >
                      <HandCoins className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">RECORD SETTLEMENT</span>
                    </button>
                  </div>
                </div>

                {/* 6-TAB NAVIGATION BAR (TOUCH HORIZONTAL SCROLL ON MOBILE) */}
                <div className="flex border-b-3 border-[var(--brand-navy)] gap-1 flex-nowrap overflow-x-auto scrollbar-none pb-0.5 w-full">
                  {[
                    { id: "velocity", label: "PRODUCTS MOVING MOST", shortLabel: "VELOCITY", icon: TrendingUp },
                    { id: "stock", label: `STOCK & INVENTORY (${stock.length})`, shortLabel: `STOCK (${stock.length})`, icon: Package },
                    { id: "payments", label: `PAYMENT METHODS & AUDIT`, shortLabel: "PAYMENTS", icon: CreditCard },
                    { id: "customers", label: `CUSTOMER AUDIT (${customers.length})`, shortLabel: `CUSTOMERS (${customers.length})`, icon: Users },
                    { id: "sales", label: `TIME OF SALES (${sales.length})`, shortLabel: `SALES (${sales.length})`, icon: Clock },
                    { id: "operators", label: `OPERATORS & PINs (${operators.length})`, shortLabel: `STAFF (${operators.length})`, icon: KeyRound }
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-3 sm:px-4 py-2 text-xs font-black uppercase flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                          isActive
                            ? "bg-[var(--brand-navy)] text-white border-t-3 border-x-3 border-[var(--brand-navy)] -mb-[3px]"
                            : "bg-white text-[var(--brand-navy)] hover:bg-stone-100 border border-[var(--brand-navy)]/30"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="inline sm:hidden">{tab.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>

                {/* TAB 1: PRODUCT VELOCITY (PRODUCTS MOVING MOST) */}
                {activeTab === "velocity" && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-black uppercase text-[var(--brand-navy)]">
                        Top Selling Items Ranked by Velocity & Revenue
                      </p>
                      <span className="text-[10px] font-mono uppercase bg-yellow-200 px-2 py-0.5 border border-[var(--brand-navy)]">
                        Total Units Sold: {bestsellers.reduce((s: number, b: any) => s + b.quantity_sold, 0)}
                      </span>
                    </div>

                    {bestsellers.length === 0 ? (
                      <div className="p-10 text-center border-2 border-dashed border-[var(--brand-navy)]/30 bg-white">
                        <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)]">No sales recorded yet for this vendor.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {bestsellers.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className="border-3 border-[var(--brand-navy)] bg-white p-4 shadow-(--shadow-brut-xs) relative flex flex-col justify-between"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex items-start gap-2.5">
                                <span className="w-6 h-6 rounded-full bg-[var(--brand-navy)] text-white flex items-center justify-center font-mono font-black text-xs shrink-0">
                                  #{idx + 1}
                                </span>
                                <div>
                                  <h4 className="text-sm font-black uppercase text-[var(--brand-navy)] leading-tight">
                                    {item.item_name}
                                  </h4>
                                  <span className="text-[10px] font-mono text-[var(--brand-navy-light)] font-bold uppercase">
                                    Category: {item.category} · Price: KES {Number(item.unit_price).toLocaleString()}
                                  </span>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-xs font-mono font-black text-emerald-700 block">
                                  KES {item.total_revenue.toLocaleString()}
                                </span>
                                <span className="text-[10px] font-mono font-bold bg-stone-100 px-1.5 py-0.5 border border-stone-300">
                                  {item.quantity_sold} {item.quantity_sold === 1 ? "unit" : "units"} sold
                                </span>
                              </div>
                            </div>

                            {/* Velocity Progress Bar */}
                            <div className="mt-3 pt-2 border-t border-dashed border-stone-200">
                              <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                                <span>Share of Vendor Sales:</span>
                                <span className="font-mono text-blue-700">{item.percentage_of_sales}%</span>
                              </div>
                              <div className="w-full bg-stone-100 h-2.5 border border-[var(--brand-navy)] overflow-hidden">
                                <div
                                  className="bg-[var(--brand-navy)] h-full transition-all duration-300"
                                  style={{ width: `${Math.min(100, Math.max(5, item.percentage_of_sales))}%` }}
                                />
                              </div>
                              <div className="flex justify-between items-center mt-2 text-[10px] font-mono">
                                <span className="text-[var(--brand-navy-light)] font-bold">
                                  Current Stock:{" "}
                                  <strong className={item.stock_qty <= 2 ? "text-red-600" : "text-[var(--brand-navy)]"}>
                                    {item.stock_qty !== null ? `${item.stock_qty} left` : "Unlimited"}
                                  </strong>
                                </span>
                                {item.stock_qty !== null && item.stock_qty <= 2 && (
                                  <span className="text-[9px] font-black uppercase bg-red-100 text-red-700 px-1.5 py-0.5 border border-red-400">
                                    LOW STOCK ALERT
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: STOCK & INVENTORY (WITH FULL EDITING, CATEGORIES & MOBILE CARDS) */}
                {activeTab === "stock" && (
                  <div className="space-y-3 sm:space-y-4">
                    {/* Category Action Banner */}
                    {categoryNotice && (
                      <div className="bg-yellow-100 border-2 border-yellow-500 px-3 py-2 flex items-center justify-between text-xs font-black uppercase text-stone-900 shadow-(--shadow-brut-xs)">
                        <span className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-yellow-700 shrink-0" />
                          {categoryNotice}
                        </span>
                        <button onClick={() => setCategoryNotice(null)} className="text-stone-500 hover:text-black">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Top Controls Toolbar */}
                    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 bg-white p-3 border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs)">
                      <div>
                        <p className="text-xs font-black uppercase text-[var(--brand-navy)]">
                          Live Stock Management & Menu Catalog
                        </p>
                        <p className="text-[10px] font-mono text-stone-500">
                          Adjust stock quantities in real time, manage product categories, or add items.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowManageCategoriesModal(true)}
                          className="flex-1 sm:flex-none px-3 py-1.5 bg-white hover:bg-stone-100 text-[var(--brand-navy)] text-xs font-black uppercase border-2 border-[var(--brand-navy)] flex items-center justify-center gap-1.5 shadow-(--shadow-brut-xs) cursor-pointer"
                          title="Manage product categories for this vendor"
                        >
                          <Tags className="w-3.5 h-3.5 text-yellow-600" /> CATEGORIES
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(null);
                            setProductForm({
                              name: "",
                              category: selectedStockCategory !== "ALL" ? selectedStockCategory : "Drinks",
                              price: "",
                              stock_qty: "50",
                              low_stock_threshold: "5",
                              is_available: true
                            });
                            setShowAddProductModal(true);
                          }}
                          className="flex-1 sm:flex-none px-3 py-1.5 bg-[var(--brand-navy)] text-white text-xs font-black uppercase hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors border-2 border-[var(--brand-navy)] flex items-center justify-center gap-1.5 shadow-(--shadow-brut-xs) cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> ADD PRODUCT
                        </button>
                      </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="space-y-2 bg-white p-2.5 sm:p-3 border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs)">
                      <div className="w-full">
                        <input
                          type="text"
                          placeholder="Search product name or category..."
                          value={stockSearch}
                          onChange={(e) => setStockSearch(e.target.value)}
                          className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 text-xs font-bold uppercase bg-white focus:outline-none placeholder:text-stone-400"
                        />
                      </div>

                      {/* Category Pills (Touch Scrollable) */}
                      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 pt-0.5 w-full">
                        <button
                          type="button"
                          onClick={() => setSelectedStockCategory("ALL")}
                          className={`px-2.5 py-1 text-[10px] font-black uppercase whitespace-nowrap border transition-colors cursor-pointer shrink-0 ${
                            selectedStockCategory === "ALL"
                              ? "bg-[var(--brand-navy)] text-white border-[var(--brand-navy)]"
                              : "bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200"
                          }`}
                        >
                          ALL ({stock.length})
                        </button>
                        {filterCategories.map((cat) => {
                          const count = stock.filter((i: any) => (i.category || "General").toLowerCase() === cat.toLowerCase()).length;
                          const isSelected = selectedStockCategory.toLowerCase() === cat.toLowerCase();
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setSelectedStockCategory(cat)}
                              className={`px-2.5 py-1 text-[10px] font-black uppercase whitespace-nowrap border transition-colors cursor-pointer shrink-0 ${
                                isSelected
                                  ? "bg-yellow-300 text-[var(--brand-navy)] border-[var(--brand-navy)] font-black"
                                  : "bg-white text-stone-700 border-stone-300 hover:bg-stone-100"
                              }`}
                            >
                              {cat} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {stock.length === 0 ? (
                      <div className="p-10 text-center border-2 border-dashed border-[var(--brand-navy)]/30 bg-white">
                        <Package className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                        <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)]">No menu items configured for this vendor.</p>
                        <button
                          onClick={() => {
                            setEditingItem(null);
                            setShowAddProductModal(true);
                          }}
                          className="mt-3 px-4 py-1.5 bg-yellow-300 text-[var(--brand-navy)] text-xs font-black uppercase border-2 border-[var(--brand-navy)] hover:bg-[var(--brand-navy)] hover:text-white transition-colors"
                        >
                          CREATE FIRST PRODUCT
                        </button>
                      </div>
                    ) : filteredStock.length === 0 ? (
                      <div className="p-8 text-center border-2 border-dashed border-[var(--brand-navy)]/30 bg-white space-y-2">
                        <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)]">
                          No products found matching "{stockSearch || selectedStockCategory}".
                        </p>
                        <button
                          onClick={() => {
                            setStockSearch("");
                            setSelectedStockCategory("ALL");
                          }}
                          className="px-3 py-1 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-xs font-black uppercase cursor-pointer"
                        >
                          CLEAR FILTERS
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* MOBILE PRODUCT CARDS (BLOCK MD:HIDDEN) - HIGH ERGONOMIC TOUCH TARGETS */}
                        <div className="block md:hidden space-y-2.5">
                          {filteredStock.map((item: any) => {
                            const isLowStock = item.stock_qty !== null && item.stock_qty <= (item.low_stock_threshold || 5);
                            const isOutOfStock = item.stock_qty !== null && item.stock_qty <= 0;
                            const isAdjusting = adjustingStockId === item.id;

                            return (
                              <div
                                key={item.id}
                                className="border-2 border-[var(--brand-navy)] bg-white p-3 shadow-(--shadow-brut-xs) space-y-2.5"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[9px] font-mono font-black uppercase bg-stone-100 text-[var(--brand-navy)] border border-stone-300 px-1.5 py-0.5">
                                        {item.category || "General"}
                                      </span>
                                      {item.stock_qty === null ? (
                                        <span className="text-[9px] font-mono font-bold uppercase bg-stone-100 text-stone-600 px-1.5 py-0.5">
                                          Unlimited
                                        </span>
                                      ) : isOutOfStock ? (
                                        <span className="text-[9px] font-mono font-black uppercase bg-red-600 text-white px-1.5 py-0.5">
                                          OUT OF STOCK
                                        </span>
                                      ) : isLowStock ? (
                                        <span className="text-[9px] font-mono font-black uppercase bg-amber-400 text-black px-1.5 py-0.5">
                                          {item.stock_qty} (LOW)
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5">
                                          {item.stock_qty} IN STOCK
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="text-sm font-black uppercase text-[var(--brand-navy)] mt-1 break-words">
                                      {item.name}
                                    </h4>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-sm font-mono font-black text-[var(--brand-navy)]">
                                      KES {Number(item.price).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                {/* Quick Adjust & Status Bar */}
                                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-dashed border-stone-200">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-black uppercase text-stone-400 mr-1">ADD:</span>
                                    {item.stock_qty !== null && (
                                      <button
                                        disabled={isAdjusting || item.stock_qty <= 0}
                                        onClick={() => handleQuickAdjustStock(item.id, -1)}
                                        className="w-7 h-7 bg-stone-100 border border-[var(--brand-navy)] font-mono font-black text-xs hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-30 flex items-center justify-center cursor-pointer"
                                        title="Decrease 1"
                                      >
                                        -1
                                      </button>
                                    )}
                                    <button
                                      disabled={isAdjusting}
                                      onClick={() => handleQuickAdjustStock(item.id, 6)}
                                      className="px-2 h-7 bg-stone-100 border border-[var(--brand-navy)] font-mono font-black text-[11px] hover:bg-emerald-50 hover:text-emerald-800 transition-colors disabled:opacity-30 flex items-center justify-center cursor-pointer"
                                    >
                                      +6
                                    </button>
                                    <button
                                      disabled={isAdjusting}
                                      onClick={() => handleQuickAdjustStock(item.id, 12)}
                                      className="px-2 h-7 bg-stone-100 border border-[var(--brand-navy)] font-mono font-black text-[11px] hover:bg-emerald-50 hover:text-emerald-800 transition-colors disabled:opacity-30 flex items-center justify-center cursor-pointer"
                                    >
                                      +12
                                    </button>
                                    <button
                                      disabled={isAdjusting}
                                      onClick={() => handleQuickAdjustStock(item.id, 24)}
                                      className="px-2 h-7 bg-stone-100 border border-[var(--brand-navy)] font-mono font-black text-[11px] hover:bg-emerald-50 hover:text-emerald-800 transition-colors disabled:opacity-30 flex items-center justify-center cursor-pointer"
                                    >
                                      +24
                                    </button>
                                  </div>

                                  <button
                                    disabled={isAdjusting}
                                    onClick={() => handleToggleItemStatus(item)}
                                    className={`text-[10px] font-black uppercase px-2.5 py-1 border transition-colors cursor-pointer shrink-0 ${
                                      item.is_available
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-400 hover:bg-stone-200"
                                        : "bg-stone-100 text-stone-500 border-stone-300 hover:bg-emerald-100 hover:text-emerald-800"
                                    }`}
                                  >
                                    {item.is_available ? "ACTIVE" : "PAUSED"}
                                  </button>
                                </div>

                                {/* Card actions: Edit / Delete */}
                                <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-100">
                                  <button
                                    onClick={() => {
                                      setEditingItem(item);
                                      setProductForm({
                                        name: item.name,
                                        category: item.category || "General",
                                        price: String(item.price),
                                        stock_qty: item.stock_qty !== null ? String(item.stock_qty) : "",
                                        low_stock_threshold: String(item.low_stock_threshold || 5),
                                        is_available: item.is_available
                                      });
                                      setShowAddProductModal(true);
                                    }}
                                    className="px-2.5 py-1 bg-stone-100 hover:bg-yellow-300 text-[var(--brand-navy)] border border-stone-300 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Edit2 className="w-3 h-3" /> EDIT
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id, item.name)}
                                    className="px-2.5 py-1 bg-stone-100 hover:bg-red-600 hover:text-white text-stone-600 border border-stone-300 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" /> DELETE
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* DESKTOP VIEW (HIDDEN MD:BLOCK) - FULL TABLE */}
                        <div className="hidden md:block overflow-x-auto border-3 border-[var(--brand-navy)] bg-white shadow-(--shadow-brut-xs)">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[var(--brand-navy)] text-white text-[11px] font-black uppercase">
                                <th className="p-3">Product Name & Category</th>
                                <th className="p-3 text-right">Price</th>
                                <th className="p-3 text-center">Current Stock</th>
                                <th className="p-3 text-center">Quick Adjust</th>
                                <th className="p-3 text-center">Status</th>
                                <th className="p-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--brand-navy)]/10 text-xs">
                              {filteredStock.map((item: any) => {
                                const isLowStock = item.stock_qty !== null && item.stock_qty <= (item.low_stock_threshold || 5);
                                const isOutOfStock = item.stock_qty !== null && item.stock_qty <= 0;
                                const isAdjusting = adjustingStockId === item.id;

                                return (
                                  <tr key={item.id} className="hover:bg-yellow-50/50 transition-colors">
                                    <td className="p-3 font-bold uppercase text-[var(--brand-navy)]">
                                      <div className="font-black text-sm">{item.name}</div>
                                      <div className="text-[10px] font-mono text-stone-500 uppercase">{item.category || "General"}</div>
                                    </td>
                                    
                                    <td className="p-3 text-right font-mono font-black text-[var(--brand-navy)]">
                                      KES {Number(item.price).toLocaleString()}
                                    </td>

                                    <td className="p-3 text-center font-mono">
                                      {item.stock_qty === null ? (
                                        <span className="text-[10px] font-bold text-stone-500 uppercase bg-stone-100 px-2 py-0.5 border border-stone-300">
                                          Unlimited
                                        </span>
                                      ) : isOutOfStock ? (
                                        <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-red-600 text-white">
                                          0 (SOLD OUT)
                                        </span>
                                      ) : isLowStock ? (
                                        <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-amber-400 text-black">
                                          {item.stock_qty} (LOW STOCK)
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                                          {item.stock_qty} IN STOCK
                                        </span>
                                      )}
                                    </td>

                                    {/* Quick Stock Adjustment Buttons */}
                                    <td className="p-3 text-center">
                                      <div className="inline-flex items-center gap-1">
                                        {item.stock_qty !== null && (
                                          <button
                                            disabled={isAdjusting || item.stock_qty <= 0}
                                            onClick={() => handleQuickAdjustStock(item.id, -1)}
                                            className="w-6 h-6 bg-stone-100 border border-[var(--brand-navy)] font-mono font-black text-[11px] hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-30 cursor-pointer"
                                            title="Decrease 1"
                                          >
                                            -1
                                          </button>
                                        )}
                                        <button
                                          disabled={isAdjusting}
                                          onClick={() => handleQuickAdjustStock(item.id, 6)}
                                          className="px-1.5 h-6 bg-stone-100 border border-[var(--brand-navy)] font-mono font-black text-[10px] hover:bg-emerald-50 hover:text-emerald-800 transition-colors disabled:opacity-30 cursor-pointer"
                                          title="Add 6 units (half case)"
                                        >
                                          +6
                                        </button>
                                        <button
                                          disabled={isAdjusting}
                                          onClick={() => handleQuickAdjustStock(item.id, 12)}
                                          className="px-1.5 h-6 bg-stone-100 border border-[var(--brand-navy)] font-mono font-black text-[10px] hover:bg-emerald-50 hover:text-emerald-800 transition-colors disabled:opacity-30 cursor-pointer"
                                          title="Add 12 units (1 case)"
                                        >
                                          +12
                                        </button>
                                        <button
                                          disabled={isAdjusting}
                                          onClick={() => handleQuickAdjustStock(item.id, 24)}
                                          className="px-1.5 h-6 bg-stone-100 border border-[var(--brand-navy)] font-mono font-black text-[10px] hover:bg-emerald-50 hover:text-emerald-800 transition-colors disabled:opacity-30 cursor-pointer"
                                          title="Add 24 units (crate)"
                                        >
                                          +24
                                        </button>
                                      </div>
                                    </td>

                                    <td className="p-3 text-center">
                                      <button
                                        disabled={isAdjusting}
                                        onClick={() => handleToggleItemStatus(item)}
                                        className={`text-[10px] font-black uppercase px-2 py-0.5 border transition-colors cursor-pointer ${
                                          item.is_available
                                            ? "bg-emerald-100 text-emerald-800 border-emerald-400 hover:bg-stone-200"
                                            : "bg-stone-100 text-stone-500 border-stone-300 hover:bg-emerald-100 hover:text-emerald-800"
                                        }`}
                                        title="Click to toggle availability"
                                      >
                                        {item.is_available ? "ACTIVE" : "PAUSED"}
                                      </button>
                                    </td>

                                    <td className="p-3 text-right">
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          onClick={() => {
                                            setEditingItem(item);
                                            setProductForm({
                                              name: item.name,
                                              category: item.category || "Drinks",
                                              price: String(item.price),
                                              stock_qty: item.stock_qty !== null ? String(item.stock_qty) : "",
                                              low_stock_threshold: String(item.low_stock_threshold || 5),
                                              is_available: item.is_available
                                            });
                                            setShowAddProductModal(true);
                                          }}
                                          className="p-1 border border-stone-300 hover:border-[var(--brand-navy)] hover:bg-yellow-200 transition-colors cursor-pointer"
                                          title="Edit Product Details"
                                        >
                                          <Edit2 className="w-3.5 h-3.5 text-[var(--brand-navy)]" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteItem(item.id, item.name)}
                                          className="p-1 border border-stone-300 hover:border-red-600 hover:bg-red-100 text-stone-500 hover:text-red-700 transition-colors cursor-pointer"
                                          title="Delete Item"
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
                      </>
                    )}
                  </div>
                )}

                {/* TAB 3: PAYMENT METHODS & AUDIT (WHO BOUGHT WHAT & DOWNLOAD DOCKETS) */}
                {activeTab === "payments" && (
                  <div className="space-y-4">
                    {/* Tender summary cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {paymentBreakdown.map((pm: any, idx: number) => {
                        const methodColors: Record<string, string> = {
                          cash: "bg-emerald-50 border-emerald-600 text-emerald-950",
                          mpesa: "bg-green-50 border-green-600 text-green-950",
                          tab: "bg-purple-50 border-purple-600 text-purple-950"
                        };

                        return (
                          <div
                            key={idx}
                            onClick={() => setPaymentTenderFilter(pm.method)}
                            className={`border-3 p-4 shadow-(--shadow-brut-xs) cursor-pointer transition-transform hover:-translate-y-0.5 ${
                              methodColors[pm.method] || "bg-white border-[var(--brand-navy)]"
                            } ${paymentTenderFilter === pm.method ? "ring-3 ring-yellow-400" : ""}`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black uppercase tracking-wider block">
                                {pm.method?.toUpperCase()} PAYMENT
                              </span>
                              <span className="text-[9px] font-mono uppercase bg-white/60 px-1.5 py-0.5 border border-stone-300">
                                {pm.count} orders
                              </span>
                            </div>
                            <p className="text-xl font-mono font-black mt-1">
                              KES {pm.amount.toLocaleString()}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Filter toolbar */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-white p-3 border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs)">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black uppercase text-[var(--brand-navy)]">FILTER TENDER:</span>
                        {(["all", "mpesa", "tab", "cash"] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setPaymentTenderFilter(m)}
                            className={`px-2.5 py-1 text-[10px] font-black uppercase border transition-colors cursor-pointer ${
                              paymentTenderFilter === m
                                ? "bg-[var(--brand-navy)] text-white border-[var(--brand-navy)]"
                                : "bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200"
                            }`}
                          >
                            {m.toUpperCase()}
                          </button>
                        ))}
                      </div>

                      <div className="w-full sm:w-64">
                        <input
                          type="text"
                          placeholder="Search customer, item, or ref..."
                          value={salesSearch}
                          onChange={(e) => setSalesSearch(e.target.value)}
                          className="w-full border-2 border-[var(--brand-navy)] px-2.5 py-1 text-xs font-bold uppercase bg-white focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Detailed Payment Transaction Records with 'Who Bought What' & 'Receipt' button */}
                    {filteredPaymentTransactions.length === 0 ? (
                      <div className="p-10 text-center border-2 border-dashed border-[var(--brand-navy)]/30 bg-white">
                        <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)]">
                          No transactions matching "{paymentTenderFilter.toUpperCase()}" filter.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {filteredPaymentTransactions.map((pt: any) => {
                          const dateObj = new Date(pt.created_at);
                          const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          const dateStr = dateObj.toLocaleDateString([], { day: '2-digit', month: 'short' });

                          const isTab = pt.method === "tab";
                          const isMpesa = pt.method === "mpesa";
                          const isCash = pt.method === "cash";

                          return (
                            <div
                              key={pt.id}
                              className="border-2 border-[var(--brand-navy)] bg-white p-3.5 shadow-(--shadow-brut-xs) flex flex-col md:flex-row justify-between gap-3 hover:border-yellow-500 transition-colors"
                            >
                              <div className="space-y-1.5 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`text-[10px] font-mono font-black uppercase px-2 py-0.5 border ${
                                      isTab
                                        ? "bg-purple-100 text-purple-900 border-purple-400"
                                        : isMpesa
                                        ? "bg-green-100 text-green-900 border-green-400"
                                        : "bg-emerald-100 text-emerald-900 border-emerald-400"
                                    }`}
                                  >
                                    {pt.method?.toUpperCase()}
                                  </span>

                                  <span className="text-xs font-black uppercase text-[var(--brand-navy)]">
                                    {pt.customer_name || (pt.tab_id ? `Tab Holder #${pt.tab_id}` : "Walk-in Customer")}
                                  </span>

                                  {pt.customer_phone && (
                                    <span className="text-[11px] font-mono font-bold text-stone-600">
                                      📞 {pt.customer_phone}
                                    </span>
                                  )}

                                  {pt.mpesa_ref && (
                                    <span className="text-[10px] font-mono font-black bg-stone-100 border border-stone-300 px-1.5 py-0.5">
                                      Ref: {pt.mpesa_ref}
                                    </span>
                                  )}

                                  {pt.tab_id && (
                                    <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-800 border border-purple-300 px-1.5 py-0.5">
                                      Tab #{pt.tab_id}
                                    </span>
                                  )}

                                  <span className="text-[10px] font-mono text-stone-500 ml-auto">
                                    🕒 {timeStr} · {dateStr}
                                  </span>
                                </div>

                                {/* Items Bought in this transaction */}
                                <div className="pt-1">
                                  <span className="text-[10px] font-black uppercase text-stone-500 mr-2">
                                    ITEMS PURCHASED:
                                  </span>
                                  <div className="inline-flex gap-1.5 flex-wrap">
                                    {(pt.items || []).map((it: any, iIdx: number) => (
                                      <span
                                        key={iIdx}
                                        className="text-[11px] font-mono font-bold bg-stone-100 border border-stone-300 px-2 py-0.5 text-[var(--brand-navy)]"
                                      >
                                        <strong>{it.quantity}x</strong> {it.item_name}{" "}
                                        <span className="text-stone-500 font-normal">
                                          (KES {Number(it.line_total || it.unit_price).toLocaleString()})
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div className="text-[10px] font-mono text-stone-500">
                                  Cashier: <strong>{pt.operator_name || "Stall Cashier"}</strong> · Sale Ref:{" "}
                                  <span className="font-bold text-[var(--brand-navy)]">{pt.sale_id}</span>
                                </div>
                              </div>

                              {/* Amount & Receipt button */}
                              <div className="flex md:flex-col justify-between items-end md:items-end border-t md:border-t-0 pt-2 md:pt-0 border-stone-200 shrink-0 gap-2">
                                <div className="text-base font-mono font-black text-emerald-800">
                                  KES {Number(pt.amount).toLocaleString()}
                                </div>

                                <button
                                  onClick={() => setReceiptModalItem(pt)}
                                  className="px-2.5 py-1 bg-yellow-300 hover:bg-[var(--brand-navy)] text-[var(--brand-navy)] hover:text-white border-2 border-[var(--brand-navy)] text-[10px] font-black uppercase transition-colors flex items-center gap-1 shadow-(--shadow-brut-xs) cursor-pointer"
                                  title="View & Download Thermal Receipt Docket"
                                >
                                  <FileText className="w-3 h-3" /> RECEIPT / DOCKET
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: CUSTOMER INTELLIGENCE DIRECTORY (WHO BOUGHT WHAT) */}
                {activeTab === "customers" && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs)">
                      <div>
                        <p className="text-xs font-black uppercase text-[var(--brand-navy)]">
                          Customer Directory & Purchase Intelligence
                        </p>
                        <p className="text-[10px] font-mono text-stone-500">
                          Identified customers from M-Pesa phone numbers and Pre-authorized Customer Tabs.
                        </p>
                      </div>

                      <div className="w-full sm:w-64">
                        <input
                          type="text"
                          placeholder="Search customer or item..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="w-full border-2 border-[var(--brand-navy)] px-2.5 py-1 text-xs font-bold uppercase bg-white focus:outline-none"
                        />
                      </div>
                    </div>

                    {filteredCustomers.length === 0 ? (
                      <div className="p-10 text-center border-2 border-dashed border-[var(--brand-navy)]/30 bg-white">
                        <Users className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                        <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)]">No customer records found.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredCustomers.map((cust: any, idx: number) => {
                          // Canonicalize before building the wa.me link. The old
                          // inline `replace(/\D/g,"")` + `startsWith("0")` chain
                          // produced `254712...` for "0712..." but a bare
                          // `0712...` (no country code) for "+254 712..." — so
                          // some customers got a dead WhatsApp link.
                          const intlCustPhone = toWhatsAppNumber(cust.phone || cust.phoneRaw);
                          const telPhone = cust.phoneRaw || cust.phone || "";
                          const due = Number(cust.tab_balance_due || 0);
                          const hasOpenTab = !!cust.has_open_tab;

                          return (
                            <div
                              key={idx}
                              className={`border-3 bg-white p-4 shadow-(--shadow-brut-xs) flex flex-col justify-between space-y-3 ${
                                hasOpenTab
                                  ? "border-amber-500 border-l-8"
                                  : "border-[var(--brand-navy)]"
                              }`}
                            >
                              <div>
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className="text-sm font-black uppercase text-[var(--brand-navy)]">
                                        {cust.name}
                                      </h4>
                                      {cust.isWalkIn && (
                                        <span className="text-[9px] font-mono uppercase bg-stone-200 text-stone-700 px-1.5 py-0.5">
                                          Cash / Walk-in
                                        </span>
                                      )}
                                      {/* This is the indicator that was missing:
                                          a customer carrying money the festival
                                          is owed. */}
                                      {hasOpenTab && (
                                        <span className="text-[9px] font-mono font-black uppercase bg-amber-400 text-[var(--brand-navy)] px-1.5 py-0.5">
                                          Open Tab
                                        </span>
                                      )}
                                      {cust.ticket_count > 0 && (
                                        <span className="text-[9px] font-mono font-black uppercase bg-blue-100 text-blue-800 px-1.5 py-0.5">
                                          Attendee
                                        </span>
                                      )}
                                    </div>
                                    {telPhone && (
                                      <p className="text-xs font-mono font-bold text-stone-600 mt-0.5">
                                        📞 {telPhone}
                                      </p>
                                    )}
                                  </div>

                                  <div className="text-right">
                                    <span className="text-sm font-mono font-black text-emerald-700 block">
                                      KES {Number(cust.combined_spend ?? cust.totalSpent ?? 0).toLocaleString()}
                                    </span>
                                    <span className="text-[10px] font-mono text-stone-500 uppercase">
                                      {cust.orderCount} {cust.orderCount === 1 ? "order" : "orders"}
                                      {cust.ticket_count > 0 ? ` · ${cust.ticket_count} ticket${cust.ticket_count === 1 ? "" : "s"}` : ""}
                                    </span>
                                  </div>
                                </div>

                                {/* BALANCE DUE — sourced from customer_tabs,
                                    summed only over tabs that are neither
                                    settled nor written off and still carry a
                                    positive balance. Previously this row simply
                                    did not exist and the audit showed KES 0 for
                                    customers with money outstanding. */}
                                <div
                                  className={`mt-3 border-2 px-2.5 py-2 flex items-center justify-between gap-2 ${
                                    due > 0
                                      ? "bg-amber-50 border-amber-500"
                                      : "bg-stone-50 border-stone-200"
                                  }`}
                                >
                                  <span className="text-[10px] font-black uppercase text-stone-600 flex items-center gap-1">
                                    {due > 0 ? <AlertCircle className="w-3 h-3 text-amber-600" /> : <CheckCircle className="w-3 h-3 text-emerald-600" />}
                                    Balance Due
                                  </span>
                                  <span
                                    className={`text-sm font-mono font-black ${
                                      due > 0 ? "text-amber-700" : "text-stone-400"
                                    }`}
                                  >
                                    KES {due.toLocaleString()}
                                  </span>
                                </div>

                                {/* Tab ledger + settlement / reminder actions */}
                                {(cust.tabs || []).length > 0 && (
                                  <div className="mt-2 space-y-1.5">
                                    {(cust.tabs || []).map((tab: any) => {
                                      const tabDue = Number(tab.amount_due || 0);
                                      const busy = tabBusyId === tab.id;
                                      const notice = tabNotice?.tabId === tab.id ? tabNotice : null;
                                      return (
                                        <div
                                          key={tab.id}
                                          className="border border-stone-300 bg-stone-50 px-2.5 py-2 text-[10px] font-mono"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="font-black text-[var(--brand-navy)] uppercase">
                                              Tab #{tab.id}
                                              <span
                                                className={`ml-1.5 px-1 py-0.5 font-black uppercase ${
                                                  tab.status === "settled"
                                                    ? "bg-emerald-100 text-emerald-800"
                                                    : tab.status === "written_off"
                                                      ? "bg-stone-300 text-stone-700"
                                                      : "bg-amber-200 text-amber-900"
                                                }`}
                                              >
                                                {tab.status}
                                              </span>
                                            </span>
                                            <span className="font-black">
                                              {tabDue > 0 ? (
                                                <span className="text-amber-700">KES {tabDue.toLocaleString()} due</span>
                                              ) : (
                                                <span className="text-emerald-700">Settled</span>
                                              )}
                                            </span>
                                          </div>
                                          <div className="text-stone-500 mt-0.5">
                                            Limit KES {Number(tab.credit_limit || 0).toLocaleString()}
                                            {tab.settled_at ? ` · Closed ${fmtDate(tab.settled_at)}` : ""}
                                          </div>

                                          {notice && (
                                            <div
                                              className={`mt-1.5 px-1.5 py-1 font-black uppercase ${
                                                notice.ok
                                                  ? "bg-emerald-100 text-emerald-800"
                                                  : "bg-red-100 text-red-800"
                                              }`}
                                            >
                                              {notice.text}
                                            </div>
                                          )}

                                          {tabDue > 0 && (
                                            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                              <button
                                                onClick={() => settleTabInFull(tab)}
                                                disabled={busy}
                                                title={`Record a cash payment of KES ${tabDue.toLocaleString()} against this tab`}
                                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white border border-[var(--brand-navy)] font-black uppercase text-[9px] flex items-center gap-1 shadow-(--shadow-brut-xs) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                              >
                                                <HandCoins className="w-3 h-3" />
                                                {busy ? "..." : "Settle"}
                                              </button>
                                              <button
                                                onClick={() => runTabAction(tab.id, "remind")}
                                                disabled={busy}
                                                title="Send this customer a WhatsApp reminder with an itemized ledger and a secure M-Pesa self-pay link"
                                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white border border-[var(--brand-navy)] font-black uppercase text-[9px] flex items-center gap-1 shadow-(--shadow-brut-xs) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                              >
                                                <MessageSquare className="w-3 h-3" />
                                                Remind
                                              </button>
                                              <button
                                                onClick={() =>
                                                  setCustomerDocket({ ...cust, __tabLedgerId: tab.id })
                                                }
                                                title="Open the full purchase history and itemized tab ledger"
                                                className="px-2 py-1 bg-stone-200 hover:bg-stone-300 text-[var(--brand-navy)] border border-[var(--brand-navy)] font-black uppercase text-[9px] flex items-center gap-1 shadow-(--shadow-brut-xs) cursor-pointer"
                                              >
                                                <FileText className="w-3 h-3" />
                                                Ledger
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Items Bought by this customer */}
                                {(cust.itemsBought || []).length > 0 && (
                                  <div className="mt-3 pt-2 border-t border-dashed border-stone-200 space-y-1.5">
                                    <span className="text-[10px] font-black uppercase text-stone-500 block">
                                      ITEMS PURCHASED & QUANTITIES:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(cust.itemsBought || []).map((it: any, iIdx: number) => (
                                        <span
                                          key={iIdx}
                                          className="text-[11px] font-mono font-bold bg-yellow-50 border border-yellow-300 text-[var(--brand-navy)] px-2 py-0.5"
                                        >
                                          <strong>{it.quantity}x</strong> {it.name}{" "}
                                          <span className="text-stone-500 font-normal">
                                            (KES {Number(it.revenue).toLocaleString()})
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Footer Actions: Contact & View Docket */}
                              <div className="flex items-center justify-between pt-2 border-t border-stone-200 text-[10px] font-mono">
                                <span className="text-stone-500">
                                  Tenders: {(cust.paymentMethods || []).join(", ").toUpperCase() || "—"}
                                </span>

                                <div className="flex items-center gap-1.5">
                                  {intlCustPhone && (
                                    <a
                                      href={`https://wa.me/${intlCustPhone}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-[var(--brand-navy)] shadow-(--shadow-brut-xs)"
                                      title="WhatsApp Customer"
                                    >
                                      <MessageSquare className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  {telPhone && (
                                    <a
                                      href={`tel:${telPhone}`}
                                      className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white border border-[var(--brand-navy)] shadow-(--shadow-brut-xs)"
                                      title="Call Customer"
                                    >
                                      <Phone className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  {/* Always available now, even for a customer
                                      whose only activity is a tab or a ticket —
                                      those previously rendered no DOCKET button
                                      at all because it was gated on
                                      `transactions[0]` existing. */}
                                  <button
                                    onClick={() => setCustomerDocket(cust)}
                                    className="px-2 py-1 bg-yellow-300 hover:bg-[var(--brand-navy)] hover:text-white text-[var(--brand-navy)] border border-[var(--brand-navy)] font-black uppercase text-[10px] flex items-center gap-1 shadow-(--shadow-brut-xs) cursor-pointer"
                                    title="View full purchase history (orders, tickets & tab ledger)"
                                  >
                                    <FileText className="w-3 h-3" /> DOCKET
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 5: TIME OF SALES (CHRONOLOGICAL AUDIT LEDGER) */}
                {activeTab === "sales" && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <p className="text-xs font-black uppercase text-[var(--brand-navy)]">
                        Chronological Sales Audit Ledger (Time of Sales)
                      </p>
                      <input
                        type="text"
                        placeholder="Search sale ID, item, or cashier..."
                        value={salesSearch}
                        onChange={(e) => setSalesSearch(e.target.value)}
                        className="border-2 border-[var(--brand-navy)] px-2.5 py-1 text-xs font-bold uppercase w-full sm:w-64 bg-white focus:outline-none"
                      />
                    </div>

                    {filteredSales.length === 0 ? (
                      <div className="p-10 text-center border-2 border-dashed border-[var(--brand-navy)]/30 bg-white">
                        <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)]">No matching sales records found.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {filteredSales.map((sale: any) => {
                          const dateObj = new Date(sale.created_at);
                          const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          const dateStr = dateObj.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });

                          return (
                            <div
                              key={sale.id}
                              className="border-2 border-[var(--brand-navy)] bg-white p-3.5 shadow-(--shadow-brut-xs) flex flex-col sm:flex-row justify-between gap-3 hover:border-yellow-500 transition-colors"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-black bg-[var(--brand-navy)] text-white px-2 py-0.5">
                                    {sale.id}
                                  </span>
                                  <span className="text-[11px] font-mono font-bold text-stone-600">
                                    🕒 {timeStr} · {dateStr}
                                  </span>
                                  {sale.event_title && (
                                    <span className="text-[10px] font-bold uppercase bg-stone-100 px-1.5 py-0.5 border border-stone-300">
                                      {sale.event_title}
                                    </span>
                                  )}
                                </div>

                                {/* Items list */}
                                <div className="text-xs font-bold text-[var(--brand-navy)] pt-1">
                                  {(sale.items || []).map((itm: any, idx: number) => (
                                    <span key={idx} className="mr-3 inline-block">
                                      • {itm.item_name} <span className="text-stone-500">x{itm.quantity}</span> (KES {Number(itm.line_total).toLocaleString()})
                                    </span>
                                  ))}
                                </div>

                                <div className="text-[10px] font-mono text-[var(--brand-navy-light)]">
                                  Cashier: <strong className="text-[var(--brand-navy)]">{sale.operator_name || "POS Operator"}</strong>
                                </div>
                              </div>

                              <div className="sm:text-right shrink-0 flex sm:flex-col justify-between items-center sm:items-end border-t sm:border-t-0 pt-2 sm:pt-0 border-stone-200 gap-2">
                                <div className="text-base font-mono font-black text-emerald-800">
                                  KES {Number(sale.total).toLocaleString()}
                                </div>
                                <div className="flex gap-1 flex-wrap sm:justify-end">
                                  {(sale.payments || []).map((pm: any, pIdx: number) => (
                                    <span
                                      key={pIdx}
                                      className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 bg-yellow-100 text-yellow-900 border border-yellow-300"
                                    >
                                      {pm.method}: KES {Number(pm.amount).toLocaleString()}
                                      {pm.mpesa_ref ? ` (${pm.mpesa_ref})` : ""}
                                    </span>
                                  ))}
                                </div>

                                <button
                                  onClick={() => setReceiptModalItem(sale)}
                                  className="px-2 py-0.5 bg-stone-100 hover:bg-yellow-300 border border-[var(--brand-navy)] text-[10px] font-black uppercase transition-colors flex items-center gap-1 cursor-pointer"
                                  title="View & Download Receipt Docket"
                                >
                                  <FileText className="w-3 h-3" /> DOCKET
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 6: OPERATORS & PINS (STAFF MANAGEMENT) */}
                {activeTab === "operators" && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs)">
                      <div>
                        <p className="text-xs font-black uppercase text-[var(--brand-navy)]">
                          Staff Terminal PINs & Operator Management
                        </p>
                        <p className="text-[10px] font-mono text-stone-500">
                          Cashiers use these 4-digit PINs to log into the POS terminal. Resetting a PIN dispatches an instant WhatsApp to the vendor.
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setNewOperator({ name: "", pin: "", role: "cashier" });
                          setShowAddOperatorModal(true);
                        }}
                        className="px-3 py-1.5 bg-[var(--brand-navy)] text-white text-xs font-black uppercase hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors border-2 border-[var(--brand-navy)] flex items-center gap-1.5 shadow-(--shadow-brut-xs) cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> ADD NEW OPERATOR
                      </button>
                    </div>

                    {operators.length === 0 ? (
                      <div className="p-10 text-center border-2 border-dashed border-[var(--brand-navy)]/30 bg-white">
                        <KeyRound className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                        <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)]">No operators configured for this vendor.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {operators.map((op: any) => {
                          const isResetting = resettingPinOpId === op.id;

                          return (
                            <div
                              key={op.id}
                              className="border-3 border-[var(--brand-navy)] bg-white p-4 shadow-(--shadow-brut-xs) flex justify-between items-center"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-black uppercase text-[var(--brand-navy)]">
                                    {op.name}
                                  </h4>
                                  <span className="text-[9px] font-mono uppercase bg-stone-100 border border-stone-300 px-1.5 py-0.5">
                                    {op.role}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono text-stone-500">POS PIN:</span>
                                  <span className="text-sm font-mono font-black tracking-widest bg-yellow-200 px-2 py-0.5 border border-stone-400">
                                    {op.pin || "••••"}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  disabled={isResetting}
                                  onClick={() => handleResetOperatorPin(op.id, op.name)}
                                  className="px-2.5 py-1.5 bg-stone-100 hover:bg-yellow-300 text-[var(--brand-navy)] border border-[var(--brand-navy)] text-[10px] font-black uppercase transition-colors flex items-center gap-1 shadow-(--shadow-brut-xs) cursor-pointer disabled:opacity-50"
                                  title="Reset PIN and send WhatsApp alert"
                                >
                                  {isResetting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                                  RESET PIN
                                </button>

                                <button
                                  onClick={() => handleDeleteOperator(op.id, op.name)}
                                  className="p-1.5 border border-stone-300 hover:border-red-600 hover:bg-red-100 text-stone-500 hover:text-red-700 transition-colors cursor-pointer"
                                  title="Remove operator"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* BOTTOM DRAWER FOOTER */}
          <div className="bg-stone-100 p-4 border-t-3 border-[var(--brand-navy)] flex justify-between items-center sticky bottom-0 z-20">
            <span className="text-[11px] font-mono font-bold text-[var(--brand-navy-light)] uppercase">
              {vendor?.name || "VENDOR"} · AUDIT INSPECTOR
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-[var(--brand-navy)] text-white text-xs font-black uppercase hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors border-2 border-[var(--brand-navy)] cursor-pointer"
            >
              CLOSE DRAWER
            </button>
          </div>
        </div>

        {/* UNIFIED CUSTOMER DOCKET — combined purchase history across the
            ticket system and the vendor POS, plus the itemized tab ledger.

            This replaces the old "DOCKET" button, which passed
            `cust.transactions[0]` to the thermal-receipt modal and therefore
            showed exactly one tender line from one order. The data for the full
            history was already in the response; it simply had no view. */}
        {customerDocket && (() => {
          const fmtLedgerTime = (isoDate: string | null | undefined) => {
            if (!isoDate) return "";
            try {
              const d = new Date(isoDate);
              const day = d.toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "2-digit" });
              const time = d.toLocaleTimeString("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", hour12: false });
              return `${day} ${time}`;
            } catch {
              return "";
            }
          };

          const ledgerEntries: any[] = [];

          // Debits: POS Orders
          for (const o of (customerDocket.orders || [])) {
            const tabPayment = (o.payments || []).find((p: any) => p.tab_id);
            const tabNum = tabPayment ? tabPayment.tab_id : (customerDocket.tabs?.[0]?.id || null);
            ledgerEntries.push({
              kind: "order",
              key: `order-${o.sale_id}`,
              time: o.created_at,
              formattedTime: fmtLedgerTime(o.created_at),
              saleId: o.sale_id,
              amount: Number(o.sale_total || o.total_paid || 0),
              tabId: tabNum,
              items: o.items || [],
              payments: o.payments || []
            });
          }

          // Credits: Payments & Settlements
          for (const p of (customerDocket.payments || [])) {
            ledgerEntries.push({
              kind: "payment",
              key: `pay-${p.id}`,
              time: p.created_at,
              formattedTime: fmtLedgerTime(p.created_at),
              amount: Number(p.amount || 0),
              method: (p.method || "cash").toUpperCase(),
              operator: p.operator_name || "Stall Staff",
              tabId: p.tab_id,
              mpesaRef: p.mpesa_ref || "",
              status: Number(p.amount || 0) >= Number(customerDocket.totalSpent || customerDocket.total_spent || 0) ? "Settled full" : "Settled partial"
            });
          }

          ledgerEntries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
          const openTabs = (customerDocket.tabs || []).filter((t: any) => t.outstanding || Number(t.amount_due || t.balance || 0) > 0);

          return (
            <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
              <div className="bg-[var(--brand-off-white)] border-4 border-[var(--brand-navy)] w-full max-w-2xl p-5 shadow-(--shadow-brut-xl) my-8 max-h-[90vh] overflow-y-auto space-y-4">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-[var(--brand-navy)] pb-3 sticky top-0 bg-[var(--brand-off-white)] z-10">
                  <div>
                    <span className="text-[10px] font-mono font-black uppercase bg-yellow-300 text-[var(--brand-navy)] px-2 py-0.5 border border-[var(--brand-navy)] shadow-(--shadow-brut-xs)">
                      CUSTOMER PURCHASE HISTORY & LEDGER
                    </span>
                    <h3 className="text-xl font-display uppercase tracking-wider text-[var(--brand-navy)] mt-1.5">
                      {customerDocket.name} {customerDocket.phoneRaw || customerDocket.phone ? `(📞 ${customerDocket.phoneRaw || customerDocket.phone})` : ""}
                    </h3>
                  </div>
                  <button
                    onClick={() => setCustomerDocket(null)}
                    className="p-1.5 text-stone-700 hover:text-white hover:bg-red-600 border-2 border-[var(--brand-navy)] bg-white cursor-pointer transition-colors shadow-(--shadow-brut-xs)"
                    aria-label="Close customer docket"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* 4 KPI Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* STALL SPEND */}
                  <div className="border-2 border-[var(--brand-navy)] bg-white p-3 text-center shadow-(--shadow-brut-xs)">
                    <div className="text-[10px] font-mono font-black uppercase text-stone-500">[ STALL SPEND ]</div>
                    <div className="text-lg font-mono font-black text-emerald-800 mt-0.5">
                      KES {Number(customerDocket.totalSpent || customerDocket.total_spent || 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] font-mono text-stone-600 mt-0.5">
                      ({customerDocket.orderCount || (customerDocket.orders || []).length} {(customerDocket.orderCount || (customerDocket.orders || []).length) === 1 ? "order" : "orders"})
                    </div>
                  </div>

                  {/* TOTAL PAID */}
                  <div className="border-2 border-[var(--brand-navy)] bg-white p-3 text-center shadow-(--shadow-brut-xs)">
                    <div className="text-[10px] font-mono font-black uppercase text-stone-500">[ TOTAL PAID ]</div>
                    <div className="text-lg font-mono font-black text-green-700 mt-0.5">
                      KES {Number(customerDocket.total_paid || 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] font-mono text-stone-600 mt-0.5">
                      ({(customerDocket.payments || []).length} {(customerDocket.payments || []).length === 1 ? "settlement" : "settlements"})
                    </div>
                  </div>

                  {/* BALANCE DUE */}
                  <div className={`border-2 border-[var(--brand-navy)] p-3 text-center shadow-(--shadow-brut-xs) ${
                    Number(customerDocket.tab_balance_due || 0) > 0 ? "bg-amber-50" : "bg-white"
                  }`}>
                    <div className="text-[10px] font-mono font-black uppercase text-stone-500">[ BALANCE DUE ]</div>
                    <div className={`text-lg font-mono font-black mt-0.5 ${
                      Number(customerDocket.tab_balance_due || 0) > 0 ? "text-amber-800" : "text-stone-500"
                    }`}>
                      KES {Number(customerDocket.tab_balance_due || 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] font-mono text-stone-600 mt-0.5">
                      {openTabs.length > 0 ? `(Open Tab #${openTabs[0].id})` : "(Fully Settled)"}
                    </div>
                  </div>

                  {/* TICKET SPEND */}
                  <div className="border-2 border-[var(--brand-navy)] bg-white p-3 text-center shadow-(--shadow-brut-xs)">
                    <div className="text-[10px] font-mono font-black uppercase text-stone-500">[ TICKET SPEND ]</div>
                    <div className="text-lg font-mono font-black text-blue-800 mt-0.5">
                      KES {Number(customerDocket.ticket_spend || 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] font-mono text-stone-600 mt-0.5">
                      ({customerDocket.ticket_count || (customerDocket.tickets || []).length} {(customerDocket.ticket_count || (customerDocket.tickets || []).length) === 1 ? "pass" : "passes"})
                    </div>
                  </div>
                </div>

                {/* TAB & PAYMENT AUDIT TRAIL (Debits & Credits) */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between border-b-2 border-[var(--brand-navy)] pb-1 pt-1">
                    <h4 className="text-xs font-black uppercase text-[var(--brand-navy)] flex items-center gap-1.5 font-mono">
                      <span>📋</span> TAB & PAYMENT AUDIT TRAIL (Debits & Credits)
                    </h4>
                    <span className="text-[10px] font-mono font-bold text-stone-500">
                      {ledgerEntries.length} {ledgerEntries.length === 1 ? "entry" : "entries"}
                    </span>
                  </div>

                  {ledgerEntries.length === 0 ? (
                    <div className="p-4 text-center text-xs font-mono text-stone-500 bg-white border-2 border-dashed border-stone-300">
                      No debits or credit transactions recorded for this customer.
                    </div>
                  ) : (
                    <div className="space-y-2 font-mono">
                      {ledgerEntries.map((entry: any, eIdx: number) => {
                        if (entry.kind === "payment") {
                          return (
                            <div
                              key={entry.key || eIdx}
                              className="border-2 border-emerald-600 bg-emerald-50/70 p-3 shadow-(--shadow-brut-xs)"
                            >
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="text-xs font-black text-emerald-950">
                                  [-] {entry.formattedTime} · PAYMENT ({entry.method}) ·{" "}
                                  <span className="text-emerald-700">-KES {entry.amount.toLocaleString()}</span>
                                </div>
                                {entry.tabId ? (
                                  <span className="text-[10px] font-black uppercase bg-emerald-200 text-emerald-900 border border-emerald-400 px-1.5 py-0.5">
                                    [CREDITED TO TAB #{entry.tabId}]
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-black uppercase bg-stone-200 text-stone-800 border border-stone-300 px-1.5 py-0.5">
                                    [DIRECT SETTLEMENT]
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-stone-600 mt-1 flex items-center gap-2 flex-wrap">
                                <span>Received by: {entry.operator}</span>
                                <span>·</span>
                                <span>Status: {entry.status}</span>
                                {entry.mpesaRef ? (
                                  <>
                                    <span>·</span>
                                    <span className="font-bold text-stone-800">Ref: {entry.mpesaRef}</span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          );
                        }

                        // kind === "order"
                        return (
                          <div
                            key={entry.key || eIdx}
                            className="border-2 border-stone-300 bg-white p-3 shadow-(--shadow-brut-xs)"
                          >
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="text-xs font-black text-[var(--brand-navy)]">
                                [+] {entry.formattedTime} · ORDER #{entry.saleId} ·{" "}
                                <span className="text-emerald-800">+KES {entry.amount.toLocaleString()}</span>
                              </div>
                            </div>
                            {entry.items && entry.items.length > 0 && (
                              <div className="mt-1.5 space-y-0.5">
                                {entry.items.map((it: any, iIdx: number) => (
                                  <div key={iIdx} className="text-[11px] text-stone-700 flex justify-between">
                                    <span>
                                      {Number(it.quantity)}x {it.item_name} {entry.tabId ? `(Tab #${entry.tabId})` : ""}
                                    </span>
                                    <span className="text-stone-500">
                                      KES {Number(it.line_total || (Number(it.quantity) * Number(it.unit_price)) || 0).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {entry.payments && entry.payments.length > 0 && (
                              <div className="mt-1.5 pt-1.5 border-t border-dashed border-stone-300 flex flex-wrap gap-1.5">
                                {entry.payments.map((p: any, pIdx: number) => (
                                  <span
                                    key={pIdx}
                                    className="text-[9px] font-black uppercase bg-stone-100 border border-stone-300 px-1.5 py-0.5 text-stone-600"
                                  >
                                    {p.method} · KES {Number(p.amount || 0).toLocaleString()}
                                    {p.mpesa_ref ? ` · ${p.mpesa_ref}` : ""}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* ACTIVE TABS */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between border-b-2 border-[var(--brand-navy)] pb-1">
                    <h4 className="text-xs font-black uppercase text-[var(--brand-navy)] flex items-center gap-1.5 font-mono">
                      <span>💳</span> ACTIVE TABS ({(customerDocket.tabs || []).length})
                    </h4>
                  </div>

                  {(customerDocket.tabs || []).length === 0 ? (
                    <p className="text-[11px] font-mono text-stone-500 uppercase bg-white border border-dashed border-stone-300 p-2.5 text-center">
                      No tabs on this account.
                    </p>
                  ) : (
                    (customerDocket.tabs || []).map((tab: any) => {
                      const tabDue = Number(tab.amount_due || (tab.status === "open" ? tab.balance : 0) || 0);
                      const isOutstanding = tab.status === "open" && tabDue > 0;
                      const busy = tabBusyId === tab.id;
                      const notice = tabNotice?.tabId === tab.id ? tabNotice : null;
                      const totalPaid = Number(tab.total_paid || 0);
                      const totalCharged = Number(tab.total_charged || (tabDue + totalPaid) || 0);

                      return (
                        <div
                          key={tab.id}
                          className={`border-2 bg-white p-3 font-mono shadow-(--shadow-brut-xs) ${
                            isOutstanding ? "border-amber-500" : "border-stone-300"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="text-xs font-black text-[var(--brand-navy)] flex items-center gap-1.5">
                              <span>TAB #{tab.id}</span>
                              <span
                                className={`px-1.5 py-0.5 text-[9px] font-black uppercase border ${
                                  tab.status === "settled"
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                    : tab.status === "written_off"
                                      ? "bg-stone-200 text-stone-700 border-stone-300"
                                      : "bg-amber-100 text-amber-900 border-amber-300"
                                }`}
                              >
                                [{tab.status.toUpperCase()}]
                              </span>
                            </div>
                            <div
                              className={`text-xs font-black ${
                                tabDue > 0 ? "text-amber-800" : "text-emerald-700"
                              }`}
                            >
                              {tabDue > 0 ? `KES ${tabDue.toLocaleString()} OUTSTANDING` : "SETTLED"}
                            </div>
                          </div>

                          <div className="text-[11px] text-stone-600 mt-1">
                            Credit Limit: KES {Number(tab.credit_limit || 0).toLocaleString()} · Total Charged: KES {totalCharged.toLocaleString()} · Total Paid: KES {totalPaid.toLocaleString()}
                          </div>

                          {tab.settlement_reason ? (
                            <div className="text-[10px] text-stone-500 mt-0.5">
                              Reason: {tab.settlement_reason}
                            </div>
                          ) : null}

                          {notice && (
                            <div
                              className={`mt-2 px-2 py-1 text-[10px] font-black uppercase border ${
                                notice.ok
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : "bg-red-100 text-red-800 border-red-300"
                              }`}
                            >
                              {notice.text}
                            </div>
                          )}

                          {tabDue > 0 && (
                            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => settleTabInFull(tab)}
                                disabled={busy}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-[var(--brand-navy)] font-black uppercase text-xs flex items-center gap-1.5 shadow-(--shadow-brut-xs) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                <HandCoins className="w-3.5 h-3.5" />
                                <span>{busy ? "Working..." : `💳 SETTLE KES ${tabDue.toLocaleString()}`}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => runTabAction(tab.id, "remind")}
                                disabled={busy}
                                className="px-3 py-1.5 bg-white hover:bg-amber-100 text-[var(--brand-navy)] border-2 border-[var(--brand-navy)] font-black uppercase text-xs flex items-center gap-1.5 shadow-(--shadow-brut-xs) cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                <span>💬 SEND WHATSAPP STATEMENT</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </section>

                {/* EVENT TICKETS */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between border-b-2 border-[var(--brand-navy)] pb-1">
                    <h4 className="text-xs font-black uppercase text-[var(--brand-navy)] flex items-center gap-1.5 font-mono">
                      <Ticket className="w-3.5 h-3.5" /> Event Tickets ({(customerDocket.tickets || []).length})
                    </h4>
                  </div>
                  {(customerDocket.tickets || []).length === 0 ? (
                    <p className="text-[11px] font-mono text-stone-500 uppercase bg-white border border-dashed border-stone-300 p-2.5 text-center">
                      No event tickets found for this customer.
                    </p>
                  ) : (
                    (customerDocket.tickets || []).map((t: any, tIdx: number) => (
                      <div
                        key={tIdx}
                        className="border-2 border-stone-300 bg-white px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-mono shadow-(--shadow-brut-xs)"
                      >
                        <div>
                          <span className="font-black text-[var(--brand-navy)]">{t.id}</span>
                          <span className="ml-2 font-bold">{t.ticket_type}</span>
                          <div className="text-[10px] text-stone-500">
                            {t.event_title}
                            {t.purchase_time ? ` · ${fmtDate(t.purchase_time)}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-blue-700">
                            KES {Number(t.amount_paid || 0).toLocaleString()}
                          </span>
                          <div className="text-[9px] font-black uppercase text-stone-500">
                            {t.is_scanned ? "Scanned" : "Not scanned"}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </section>
              </div>
            </div>
          );
        })()}

        {/* 1. THERMAL POS RECEIPT DOCKET MODAL */}
        {receiptModalItem && currentReceipt && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="bg-[var(--brand-off-white)] border-4 border-[var(--brand-navy)] w-full max-w-md p-5 shadow-(--shadow-brut-xl) my-8 space-y-4">
              <div className="flex justify-between items-start border-b-2 border-[var(--brand-navy)] pb-2">
                <div>
                  <span className="text-[10px] font-mono font-black uppercase bg-yellow-300 text-[var(--brand-navy)] px-2 py-0.5">
                    POS RECEIPT DOCKET
                  </span>
                  <h3 className="text-lg font-black uppercase text-[var(--brand-navy)] mt-1">
                    Official Stall Voucher
                  </h3>
                </div>
                <button
                  onClick={() => setReceiptModalItem(null)}
                  className="p-1 text-stone-600 hover:text-black hover:bg-stone-200 border border-stone-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Printable Thermal Receipt Docket Container */}
              <div
                id="thermal-receipt-printable"
                className="bg-white border-2 border-stone-300 p-4 font-mono text-xs text-stone-900 shadow-inner relative"
              >
                {/* Serrated zigzag border accent */}
                <div className="text-center border-b-2 border-dashed border-stone-400 pb-3 mb-3">
                  <div className="text-base font-black uppercase tracking-wider">GOODLIFE FESTIVAL</div>
                  <div className="text-sm font-black uppercase text-[var(--brand-navy)] mt-0.5">
                    {currentReceipt.vendorName}
                  </div>
                  <div className="text-[10px] text-stone-500 mt-1 uppercase">
                    STALL DOCKET & AUDIT RECEIPT
                  </div>
                </div>

                {/* Metadata */}
                <div className="text-[11px] space-y-0.5 mb-3 border-b border-dashed border-stone-300 pb-2">
                  <div className="flex justify-between">
                    <span className="text-stone-500 uppercase">Docket:</span>
                    <span className="font-bold">{currentReceipt.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500 uppercase">Date:</span>
                    <span>{currentReceipt.date.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })} {currentReceipt.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500 uppercase">Cashier:</span>
                    <span>{currentReceipt.operator}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500 uppercase">Customer:</span>
                    <span className="font-bold">{currentReceipt.customer}</span>
                  </div>
                  {currentReceipt.phone && (
                    <div className="flex justify-between">
                      <span className="text-stone-500 uppercase">Phone:</span>
                      <span>{currentReceipt.phone}</span>
                    </div>
                  )}
                </div>

                {/* Items Purchased Table */}
                <div className="mb-3 border-b-2 border-dashed border-stone-400 pb-3">
                  <div className="flex justify-between text-[10px] font-black uppercase border-b border-stone-200 pb-1 mb-1.5 text-stone-500">
                    <span>QTY / ITEM</span>
                    <span className="text-right">TOTAL</span>
                  </div>

                  {currentReceipt.items.length === 0 ? (
                    <div className="text-center py-2 text-stone-400 italic">Line items unavailable</div>
                  ) : (
                    currentReceipt.items.map((it: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-start py-0.5 text-xs">
                        <div className="pr-2">
                          <span className="font-bold mr-1.5">{it.quantity}x</span>
                          <span className="uppercase">{it.item_name}</span>
                        </div>
                        <div className="font-bold shrink-0">
                          KES {Number(it.line_total || it.unit_price || 0).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Financial Summary */}
                <div className="space-y-1 mb-3 border-b border-dashed border-stone-300 pb-2 text-xs">
                  <div className="flex justify-between font-bold">
                    <span>SUBTOTAL:</span>
                    <span>KES {currentReceipt.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-emerald-800 pt-1 border-t border-stone-200">
                    <span>TOTAL PAID:</span>
                    <span>KES {currentReceipt.total.toLocaleString()}</span>
                  </div>
                </div>

                {/* Tender Breakdown */}
                <div className="text-[10px] space-y-1 border-b-2 border-dashed border-stone-400 pb-3 mb-3">
                  <span className="font-black uppercase text-stone-500 block">PAYMENT TENDERS:</span>
                  {currentReceipt.payments.map((p: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span className="uppercase">
                        • {p.method}
                        {p.mpesa_ref ? ` (${p.mpesa_ref})` : ""}
                        {p.tab_id ? ` (Tab #${p.tab_id})` : ""}
                      </span>
                      <span className="font-bold">KES {Number(p.amount || 0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                {/* Barcode & Footer */}
                <div className="text-center pt-1">
                  <div className="font-mono text-[9px] tracking-widest text-stone-400 uppercase">
                    * * * GOODLIFE OFFICIAL POS VOUCHER * * *
                  </div>
                  <div className="text-[10px] font-black uppercase text-stone-700 mt-1">
                    Thank you for partying with us! 🎉
                  </div>
                </div>
              </div>

              {/* Action Buttons for Receipt */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <button
                  onClick={handlePrintReceipt}
                  className="py-2 bg-[var(--brand-navy)] text-white text-[11px] font-black uppercase border-2 border-[var(--brand-navy)] hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors flex items-center justify-center gap-1 shadow-(--shadow-brut-xs) cursor-pointer"
                  title="Print to POS thermal printer or save as PDF"
                >
                  <Printer className="w-3.5 h-3.5" /> PRINT / PDF
                </button>

                <button
                  onClick={handleDownloadDocketTxt}
                  className="py-2 bg-white text-[var(--brand-navy)] text-[11px] font-black uppercase border-2 border-[var(--brand-navy)] hover:bg-stone-100 transition-colors flex items-center justify-center gap-1 shadow-(--shadow-brut-xs) cursor-pointer"
                  title="Download raw docket text file"
                >
                  <Download className="w-3.5 h-3.5" /> TXT DOCKET
                </button>

                <a
                  href={getWhatsAppShareUrl()}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase border-2 border-emerald-800 transition-colors flex items-center justify-center gap-1 shadow-(--shadow-brut-xs) text-center"
                  title="Send via WhatsApp"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> WHATSAPP
                </a>
              </div>
            </div>
          </div>
        )}

        {/* 2. ADD / EDIT PRODUCT MODAL */}
        {showAddProductModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-[var(--brand-off-white)] border-4 border-[var(--brand-navy)] w-full max-w-md p-5 shadow-(--shadow-brut-xl)">
              <div className="flex justify-between items-center border-b-2 border-[var(--brand-navy)] pb-2 mb-3">
                <h3 className="text-lg font-black uppercase">
                  {editingItem ? "Edit Catalog Item" : "Add New Catalog Item"}
                </h3>
                <button onClick={() => setShowAddProductModal(false)} className="text-stone-500 hover:text-black cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveProductSubmit} className="space-y-3">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1">Product Name</label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    placeholder="e.g. KC FUSION PINEAPPLE"
                    className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 text-xs font-bold uppercase focus:outline-none bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1">Category</label>
                    <input
                      type="text"
                      required
                      list="admin-catalog-categories"
                      value={productForm.category}
                      onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                      placeholder="e.g. Drinks, Food, Cocktails"
                      className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 text-xs font-bold uppercase focus:outline-none bg-white"
                    />
                    <datalist id="admin-catalog-categories">
                      {availableCategories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1">Price (KES)</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={productForm.price}
                      onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                      placeholder="e.g. 1200"
                      className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 font-mono text-xs font-bold focus:outline-none bg-white"
                    />
                  </div>
                </div>

                {/* Quick Category Chips */}
                <div>
                  <span className="text-[9px] font-black uppercase text-stone-400 block mb-1">QUICK CATEGORY SELECT:</span>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {availableCategories.slice(0, 10).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setProductForm({ ...productForm, category: cat })}
                        className={`text-[9px] font-bold uppercase px-2 py-0.5 border cursor-pointer transition-colors ${
                          productForm.category.toLowerCase() === cat.toLowerCase()
                            ? "bg-yellow-300 text-[var(--brand-navy)] border-[var(--brand-navy)] font-black"
                            : "bg-stone-100 text-stone-600 border-stone-300 hover:bg-stone-200"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1">
                      Stock Quantity <span className="text-stone-400 font-normal">(Empty = Unlimited)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={productForm.stock_qty}
                      onChange={(e) => setProductForm({ ...productForm, stock_qty: e.target.value })}
                      placeholder="e.g. 50"
                      className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 font-mono text-xs font-bold focus:outline-none bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1">Low Stock Warning Alert</label>
                    <input
                      type="number"
                      min="1"
                      value={productForm.low_stock_threshold}
                      onChange={(e) => setProductForm({ ...productForm, low_stock_threshold: e.target.value })}
                      placeholder="e.g. 5"
                      className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 font-mono text-xs font-bold focus:outline-none bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="is_available"
                    checked={productForm.is_available}
                    onChange={(e) => setProductForm({ ...productForm, is_available: e.target.checked })}
                    className="w-4 h-4 accent-[var(--brand-navy)] cursor-pointer"
                  />
                  <label htmlFor="is_available" className="text-xs font-bold uppercase cursor-pointer">
                    Item is Available for Sale in POS
                  </label>
                </div>

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAddProductModal(false)}
                    className="flex-1 py-2 border-2 border-[var(--brand-navy)] text-xs font-black uppercase hover:bg-stone-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingProduct}
                    className="flex-1 py-2 bg-[var(--brand-navy)] text-white text-xs font-black uppercase border-2 border-[var(--brand-navy)] hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {submittingProduct ? "SAVING..." : editingItem ? "UPDATE PRODUCT" : "CREATE PRODUCT"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 3. EDIT VENDOR PROFILE MODAL */}
        {showEditVendorModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-[var(--brand-off-white)] border-4 border-[var(--brand-navy)] w-full max-w-sm p-5 shadow-(--shadow-brut-xl)">
              <div className="flex justify-between items-center border-b-2 border-[var(--brand-navy)] pb-2 mb-3">
                <h3 className="text-lg font-black uppercase">Edit Vendor Profile</h3>
                <button onClick={() => setShowEditVendorModal(false)} className="text-stone-500 hover:text-black cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1">Contact Person Name</label>
                  <input
                    type="text"
                    value={vendorForm.contact_name}
                    onChange={(e) => setVendorForm({ ...vendorForm, contact_name: e.target.value })}
                    placeholder="e.g. TRINA"
                    className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 text-xs font-bold uppercase focus:outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase block mb-1">Contact Phone Number</label>
                  <input
                    type="tel"
                    value={vendorForm.contact_phone}
                    onChange={(e) => setVendorForm({ ...vendorForm, contact_phone: e.target.value })}
                    placeholder="e.g. 0799560898"
                    className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 font-mono text-xs font-bold focus:outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase block mb-1">Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={vendorForm.commission_rate}
                    onChange={(e) => setVendorForm({ ...vendorForm, commission_rate: e.target.value })}
                    placeholder="e.g. 10.0"
                    className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 font-mono text-xs font-bold focus:outline-none bg-white"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditVendorModal(false)}
                    className="flex-1 py-2 border-2 border-[var(--brand-navy)] text-xs font-black uppercase hover:bg-stone-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updatingVendor}
                    className="flex-1 py-2 bg-[var(--brand-navy)] text-white text-xs font-black uppercase border-2 border-[var(--brand-navy)] hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {updatingVendor ? "SAVING..." : "SAVE PROFILE"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 4. ADD OPERATOR MODAL */}
        {showAddOperatorModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-[var(--brand-off-white)] border-4 border-[var(--brand-navy)] w-full max-w-sm p-5 shadow-(--shadow-brut-xl)">
              <div className="flex justify-between items-center border-b-2 border-[var(--brand-navy)] pb-2 mb-3">
                <h3 className="text-lg font-black uppercase">Add Stall Cashier</h3>
                <button onClick={() => setShowAddOperatorModal(false)} className="text-stone-500 hover:text-black cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddOperator} className="space-y-3">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1">Cashier Name</label>
                  <input
                    type="text"
                    required
                    value={newOperator.name}
                    onChange={(e) => setNewOperator({ ...newOperator, name: e.target.value })}
                    placeholder="e.g. Alex"
                    className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 text-xs font-bold uppercase focus:outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase block mb-1">
                    4-Digit POS PIN <span className="text-stone-400 font-normal">(Empty = Auto Generate)</span>
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    pattern="\d{4}"
                    value={newOperator.pin}
                    onChange={(e) => setNewOperator({ ...newOperator, pin: e.target.value })}
                    placeholder="e.g. 1234"
                    className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 font-mono text-xs font-bold focus:outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase block mb-1">Role</label>
                  <select
                    value={newOperator.role}
                    onChange={(e) => setNewOperator({ ...newOperator, role: e.target.value })}
                    className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 text-xs font-bold uppercase focus:outline-none bg-white"
                  >
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="bartender">Bartender</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddOperatorModal(false)}
                    className="flex-1 py-2 border-2 border-[var(--brand-navy)] text-xs font-black uppercase hover:bg-stone-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingOperator}
                    className="flex-1 py-2 bg-[var(--brand-navy)] text-white text-xs font-black uppercase border-2 border-[var(--brand-navy)] hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {submittingOperator ? "CREATING..." : "ADD CASHIER"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 5. QUICK SETTLEMENT MODAL */}
        {showSettleModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-[var(--brand-off-white)] border-4 border-[var(--brand-navy)] w-full max-w-sm p-5 shadow-(--shadow-brut-xl)">
              <h3 className="text-lg font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-3">
                Record Vendor Settlement
              </h3>
              <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)] mb-3">
                Vendor: <strong>{vendor?.name}</strong>
              </p>
              <form onSubmit={handleSettleSubmit} className="space-y-3">
                <div>
                  <label className="text-[10px] font-black uppercase block mb-1">Settlement Amount (KES)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    placeholder="e.g. 320"
                    className="w-full border-2 border-[var(--brand-navy)] px-3 py-2 font-mono text-base font-bold focus:outline-none"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSettleModal(false)}
                    className="flex-1 py-2 border-2 border-[var(--brand-navy)] text-xs font-black uppercase hover:bg-stone-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={settling}
                    className="flex-1 py-2 bg-[var(--brand-navy)] text-white text-xs font-black uppercase border-2 border-[var(--brand-navy)] hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {settling ? "SAVING..." : "CONFIRM PAYMENT"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 6. ADMIN MANAGE CATEGORIES MODAL */}
        {showManageCategoriesModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-[var(--brand-off-white)] border-4 border-[var(--brand-navy)] w-full max-w-lg p-4 sm:p-5 shadow-(--shadow-brut-xl) max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center border-b-2 border-[var(--brand-navy)] pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <Tags className="w-5 h-5 text-yellow-600" />
                  <h3 className="text-base sm:text-lg font-black uppercase">
                    Manage Product Categories
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShowManageCategoriesModal(false);
                    setEditingCategoryOldName(null);
                  }}
                  className="text-stone-500 hover:text-black cursor-pointer p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                <p className="text-xs font-mono text-stone-600">
                  Rename categories across all products for <strong>{vendor?.name}</strong>, delete unused categories, or create custom ones.
                </p>

                {/* Create New Category Input */}
                <div className="bg-white border-2 border-[var(--brand-navy)] p-3 space-y-2 shadow-(--shadow-brut-xs)">
                  <label className="text-[10px] font-black uppercase block text-[var(--brand-navy)]">
                    Create New Category
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Cocktails, Platters, VIP..."
                      value={newCategoryNameInput}
                      onChange={(e) => setNewCategoryNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAdminAddNewCategory(newCategoryNameInput);
                        }
                      }}
                      className="flex-1 border-2 border-[var(--brand-navy)] px-3 py-1.5 text-xs font-bold uppercase bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAdminAddNewCategory(newCategoryNameInput)}
                      disabled={!newCategoryNameInput.trim()}
                      className="px-3 py-1.5 bg-[var(--brand-navy)] text-white text-xs font-black uppercase hover:bg-yellow-300 hover:text-[var(--brand-navy)] border-2 border-[var(--brand-navy)] disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                    >
                      ADD CAT
                    </button>
                  </div>
                </div>

                {/* Existing Vendor Categories List */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-stone-500 block">
                    ACTIVE VENDOR CATEGORIES ({filterCategories.length})
                  </span>

                  {filterCategories.length === 0 ? (
                    <div className="p-4 bg-white border border-stone-300 text-center text-xs text-stone-500 italic">
                      No categories created yet. Items currently default to "General".
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filterCategories.map((cat) => {
                        const count = stock.filter((i: any) => (i.category || "General").toLowerCase() === cat.toLowerCase()).length;
                        const isEditingThis = editingCategoryOldName?.toLowerCase() === cat.toLowerCase();

                        return (
                          <div
                            key={cat}
                            className="bg-white border-2 border-[var(--brand-navy)] p-2.5 flex items-center justify-between gap-2 shadow-(--shadow-brut-xs)"
                          >
                            {isEditingThis ? (
                              <div className="flex items-center gap-1.5 flex-1">
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingCategoryNewName}
                                  onChange={(e) => setEditingCategoryNewName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleAdminRenameCategory(cat, editingCategoryNewName);
                                    } else if (e.key === "Escape") {
                                      setEditingCategoryOldName(null);
                                    }
                                  }}
                                  className="flex-1 border border-[var(--brand-navy)] px-2 py-1 text-xs font-black uppercase bg-yellow-50 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={isSavingCategoryAction}
                                  onClick={() => handleAdminRenameCategory(cat, editingCategoryNewName)}
                                  className="px-2 py-1 bg-emerald-600 text-white text-[10px] font-black uppercase hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                                >
                                  SAVE
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCategoryOldName(null)}
                                  className="px-2 py-1 bg-stone-200 text-stone-700 text-[10px] font-black uppercase hover:bg-stone-300 cursor-pointer"
                                >
                                  CANCEL
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 min-w-0">
                                  <Tag className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                  <span className="text-xs font-black uppercase text-[var(--brand-navy)] truncate">
                                    {cat}
                                  </span>
                                  <span className="text-[10px] font-mono font-bold bg-stone-100 text-stone-600 border border-stone-300 px-1.5 py-0.5 shrink-0">
                                    {count} {count === 1 ? "product" : "products"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCategoryOldName(cat);
                                      setEditingCategoryNewName(cat);
                                    }}
                                    className="p-1.5 border border-stone-300 hover:border-[var(--brand-navy)] hover:bg-yellow-200 text-[var(--brand-navy)] transition-colors cursor-pointer"
                                    title="Rename Category"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAdminDeleteCategory(cat)}
                                    disabled={cat.toLowerCase() === "general"}
                                    className="p-1.5 border border-stone-300 hover:border-red-600 hover:bg-red-50 text-stone-500 hover:text-red-700 transition-colors cursor-pointer disabled:opacity-20"
                                    title={cat.toLowerCase() === "general" ? "General cannot be deleted" : "Delete category (reassigns items to General)"}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Suggested Quick Categories */}
                <div className="pt-2 border-t border-stone-200">
                  <span className="text-[10px] font-black uppercase text-stone-400 block mb-1">
                    SUGGESTED EVENT CATEGORIES:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_SUGGESTED_CATEGORIES.map((sug) => {
                      const exists = filterCategories.some((c) => c.toLowerCase() === sug.toLowerCase());
                      return (
                        <button
                          key={sug}
                          type="button"
                          disabled={exists}
                          onClick={() => handleAdminAddNewCategory(sug)}
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 border transition-colors ${
                            exists
                              ? "bg-stone-100 text-stone-400 border-stone-200 cursor-default"
                              : "bg-white text-[var(--brand-navy)] border-stone-300 hover:bg-yellow-200 cursor-pointer"
                          }`}
                        >
                          + {sug} {exists && "✓"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t-2 border-[var(--brand-navy)] mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowManageCategoriesModal(false);
                    setEditingCategoryOldName(null);
                  }}
                  className="px-4 py-1.5 bg-[var(--brand-navy)] text-white text-xs font-black uppercase hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors border-2 border-[var(--brand-navy)] cursor-pointer"
                >
                  DONE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
