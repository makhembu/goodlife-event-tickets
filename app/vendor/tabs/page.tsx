"use client";

import { useState, useEffect } from 'react';
import { HapticFeedback } from '@/components/ui/haptic-feedback';
import { X, CheckCircle2, AlertTriangle, Send } from 'lucide-react';

interface TabTransaction {
  id: number;
  tab_id: number;
  sale_id: string | null;
  type: 'charge' | 'payment';
  amount: string | number;
  method?: string;
  mpesa_ref?: string;
  operator_id?: number | null;
  ordered_by?: string;
  created_at: string;
}

interface Tab {
  id: number;
  customer_name: string;
  customer_phone: string;
  credit_limit: string | number;
  balance: string | number;
  status: string;
  vendor_id: number;
  settlement_reason?: string;
  settled_at?: string;
  created_at?: string;
  transactions?: TabTransaction[];
}

export default function VendorTabsPage() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTab, setExpandedTab] = useState<number | null>(null);

  // Itemized Ledger cache/state
  const [tabLedgers, setTabLedgers] = useState<Record<number, TabTransaction[]>>({});
  const [loadingLedger, setLoadingLedger] = useState<Record<number, boolean>>({});

  // Collect Payment Modal State
  const [collectTab, setCollectTab] = useState<Tab | null>(null);
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [payMethod, setPayMethod] = useState<'cash' | 'mpesa'>('cash');
  const [payAmount, setPayAmount] = useState('');
  
  // Split payment amounts
  const [splitCashAmount, setSplitCashAmount] = useState('');
  const [splitMpesaAmount, setSplitMpesaAmount] = useState('');
  
  // M-Pesa details & STK Push
  const [mpesaRef, setMpesaRef] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isTriggeringStk, setIsTriggeringStk] = useState(false);
  const [stkReference, setStkReference] = useState<string | null>(null);
  const [stkTimeLeft, setStkTimeLeft] = useState(45);
  const [stkStatusMessage, setStkStatusMessage] = useState('');
  const [showStkModal, setShowStkModal] = useState(false);
  const [isMpesaVerified, setIsMpesaVerified] = useState(false);
  const [submittingPay, setSubmittingPay] = useState(false);

  // Edit Credit Limit Modal State
  const [limitTab, setLimitTab] = useState<Tab | null>(null);
  const [newLimitAmount, setNewLimitAmount] = useState('');
  const [submittingLimit, setSubmittingLimit] = useState(false);

  // Settle / Close Tab Modal State
  const [closeTabTarget, setCloseTabTarget] = useState<Tab | null>(null);
  const [settlementReason, setSettlementReason] = useState('');
  const [submittingClose, setSubmittingClose] = useState(false);

  // Remind All Modal State
  const [remindAllModal, setRemindAllModal] = useState<{
    open: boolean;
    submitting: boolean;
    successMessage: string | null;
    errorMessage: string | null;
  }>({
    open: false,
    submitting: false,
    successMessage: null,
    errorMessage: null,
  });

  // Custom App Notification Modal State
  const [alertModal, setAlertModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'error';
  }>({
    open: false,
    title: '',
    message: '',
    type: 'info',
  });

  const showAlert = (message: string, title = "NOTIFICATION", type: 'info' | 'success' | 'error' = 'info') => {
    setAlertModal({ open: true, title, message, type });
  };

  const fetchTabs = () => {
    fetch('/api/vendor/tabs')
      .then(res => res.json())
      .then(data => {
        setTabs(data.tabs || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching tabs:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTabs();
  }, []);

  // Fetch full itemized ledger when expanding a tab
  const toggleTab = (id: number) => {
    HapticFeedback.trigger('confirmation');
    if (expandedTab === id) {
      setExpandedTab(null);
      return;
    }

    setExpandedTab(id);

    // Fetch ledger if not already loaded
    if (!tabLedgers[id]) {
      setLoadingLedger(prev => ({ ...prev, [id]: true }));
      fetch(`/api/vendor/tabs/${id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.tab) {
            setTabLedgers(prev => ({ ...prev, [id]: data.tab.transactions || [] }));
          }
        })
        .catch(err => console.error("Error loading tab transactions:", err))
        .finally(() => {
          setLoadingLedger(prev => ({ ...prev, [id]: false }));
        });
    }
  };

  // Open Collect Payment Modal
  const openCollectPayment = (tab: Tab) => {
    HapticFeedback.trigger('confirmation');
    setCollectTab(tab);
    const bal = Number(tab.balance);
    setPayAmount(bal > 0 ? bal.toString() : '');
    setPayMethod('cash');
    setIsSplitPayment(false);
    setSplitCashAmount('');
    setSplitMpesaAmount('');
    setMpesaRef('');
    setCustomerPhone(tab.customer_phone || '');
    setIsMpesaVerified(false);
    setShowStkModal(false);
    setStkReference(null);
  };

  // Preset batch chips helper
  const handleBatchChip = (type: '500' | '1000' | '2000' | 'half' | 'full') => {
    if (!collectTab) return;
    HapticFeedback.trigger('confirmation');
    const balance = Number(collectTab.balance);
    let target = 0;
    if (type === '500') target = 500;
    else if (type === '1000') target = 1000;
    else if (type === '2000') target = 2000;
    else if (type === 'half') target = Math.ceil(balance / 2);
    else if (type === 'full') target = balance;

    if (isSplitPayment) {
      // Put full amount into split cash as starter
      setSplitCashAmount(target.toString());
      const remainder = Math.max(0, balance - target);
      setSplitMpesaAmount(remainder > 0 ? remainder.toString() : '');
    } else {
      setPayAmount(target.toString());
    }
  };

  // Open Edit Limit Modal
  const openEditLimit = (tab: Tab) => {
    HapticFeedback.trigger('confirmation');
    setLimitTab(tab);
    setNewLimitAmount(tab.credit_limit.toString());
  };

  const handleUpdateLimitSubmit = async () => {
    if (!limitTab) return;
    const numLimit = Number(newLimitAmount);
    const balance = Number(limitTab.balance);

    if (isNaN(numLimit) || numLimit < 0) {
      HapticFeedback.trigger('error');
      showAlert("Please enter a valid credit limit amount.", "INVALID AMOUNT", "error");
      return;
    }

    if (numLimit < balance) {
      HapticFeedback.trigger('error');
      showAlert(`Floor validation failed: New limit (KES ${numLimit.toLocaleString()}) cannot be lower than the current balance owed (KES ${balance.toLocaleString()}).`, "LIMIT VALIDATION FAILED", "error");
      return;
    }

    setSubmittingLimit(true);
    HapticFeedback.trigger('confirmation');
    try {
      const res = await fetch(`/api/vendor/tabs/${limitTab.id}/limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newLimit: numLimit })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger('success');
        showAlert("Credit limit updated successfully!", "LIMIT UPDATED", "success");
        setLimitTab(null);
        fetchTabs();
      } else {
        HapticFeedback.trigger('error');
        showAlert(data.message || "Failed to update credit limit", "UPDATE FAILED", "error");
      }
    } catch {
      HapticFeedback.trigger('error');
      showAlert("Network error updating credit limit", "NETWORK ERROR", "error");
    } finally {
      setSubmittingLimit(false);
    }
  };

  // Open Settle / Close Tab Modal
  const openSettleTab = (tab: Tab) => {
    HapticFeedback.trigger('confirmation');
    setCloseTabTarget(tab);
    setSettlementReason('');
  };

  const handleCloseTabSubmit = async () => {
    if (!closeTabTarget) return;
    const balance = Number(closeTabTarget.balance);

    if (balance > 0 && !settlementReason.trim()) {
      HapticFeedback.trigger('error');
      showAlert("Settlement reason is required to close a tab with an outstanding non-zero balance.", "REASON REQUIRED", "error");
      return;
    }

    setSubmittingClose(true);
    HapticFeedback.trigger('confirmation');
    try {
      const res = await fetch(`/api/vendor/tabs/${closeTabTarget.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlementReason: settlementReason.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger('success');
        showAlert(balance > 0 ? "Tab settled with write-off recorded!" : "Tab closed successfully!", "TAB SETTLED", "success");
        setCloseTabTarget(null);
        fetchTabs();
      } else {
        HapticFeedback.trigger('error');
        showAlert(data.message || "Failed to settle tab", "SETTLEMENT FAILED", "error");
      }
    } catch {
      HapticFeedback.trigger('error');
      showAlert("Network error settling tab", "NETWORK ERROR", "error");
    } finally {
      setSubmittingClose(false);
    }
  };

  // STK Trigger function for M-Pesa tab paydown
  const triggerStkPush = async (amountToCharge: number) => {
    const cleanPhone = customerPhone.trim();
    if (!cleanPhone) {
      showAlert("Please enter customer phone number for STK Push", "PHONE REQUIRED", "error");
      return;
    }
    if (!amountToCharge || amountToCharge <= 0) {
      showAlert("Please enter a valid M-Pesa amount to charge", "INVALID AMOUNT", "error");
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
          amount: Math.round(amountToCharge),
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
        showAlert(data.message || "Failed to trigger STK Push", "STK PUSH FAILED", "error");
      }
    } catch {
      HapticFeedback.trigger("error");
      showAlert("Network error triggering STK Push", "NETWORK ERROR", "error");
    } finally {
      setIsTriggeringStk(false);
    }
  };

  // STK Countdown & Polling effect
  useEffect(() => {
    if (!showStkModal || !stkReference) return;

    let isTerminal = false;

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

  // Handle Tab Payment Execution (Single or Split)
  const handleProcessPayment = async () => {
    if (!collectTab) return;
    const tabBal = Number(collectTab.balance);

    if (isSplitPayment) {
      const cAmt = Number(splitCashAmount) || 0;
      const mAmt = Number(splitMpesaAmount) || 0;
      const totalEntered = cAmt + mAmt;

      if (cAmt <= 0 && mAmt <= 0) {
        showAlert("Please enter at least one positive payment amount for split payment.", "SPLIT PAYMENT REQUIRED", "error");
        return;
      }

      if (mAmt > 0 && !mpesaRef.trim() && !isMpesaVerified) {
        showAlert("Please provide the M-Pesa transaction reference or complete STK Push for the M-Pesa portion.", "M-PESA REFERENCE REQUIRED", "error");
        return;
      }

      setSubmittingPay(true);
      HapticFeedback.trigger('confirmation');

      try {
        let successCash = true;
        let successMpesa = true;

        if (cAmt > 0) {
          const resCash = await fetch(`/api/vendor/tabs/${collectTab.id}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: cAmt,
              method: 'cash',
            })
          });
          const dataCash = await resCash.json();
          if (!resCash.ok || !dataCash.success) {
            successCash = false;
          }
        }

        if (mAmt > 0) {
          const resMpesa = await fetch(`/api/vendor/tabs/${collectTab.id}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: mAmt,
              method: 'mpesa',
              mpesaRef: mpesaRef.trim() || undefined,
            })
          });
          const dataMpesa = await resMpesa.json();
          if (!resMpesa.ok || !dataMpesa.success) {
            successMpesa = false;
          }
        }

        if (successCash && successMpesa) {
          HapticFeedback.trigger('success');
          showAlert(`Split payment of KES ${totalEntered.toLocaleString()} processed successfully!`, "PAYMENT PROCESSED", "success");
          setCollectTab(null);
          fetchTabs();
          // Invalidate cached ledger
          setTabLedgers(prev => {
            const next = { ...prev };
            delete next[collectTab.id];
            return next;
          });
        } else {
          HapticFeedback.trigger('error');
          showAlert("One or more split payment portions failed. Please refresh and check the ledger.", "PAYMENT PARTIALLY FAILED", "error");
          fetchTabs();
        }
      } catch {
        HapticFeedback.trigger('error');
        showAlert("Network error processing split payment", "NETWORK ERROR", "error");
      } finally {
        setSubmittingPay(false);
      }
      return;
    }

    // Single Payment Mode
    const numAmt = Number(payAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      showAlert("Please enter a valid amount to pay", "INVALID AMOUNT", "error");
      return;
    }

    if (payMethod === 'mpesa' && numAmt > tabBal) {
      showAlert(`M-Pesa payment cannot exceed current balance owed (KES ${tabBal.toLocaleString()}).`, "EXCEEDS BALANCE", "error");
      return;
    }

    setSubmittingPay(true);
    HapticFeedback.trigger('confirmation');
    try {
      const res = await fetch(`/api/vendor/tabs/${collectTab.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmt,
          method: payMethod,
          mpesaRef: payMethod === 'mpesa' ? mpesaRef.trim() : undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger('success');
        showAlert(data.message || "Payment processed successfully!", "PAYMENT PROCESSED", "success");
        setCollectTab(null);
        fetchTabs();
        // Invalidate cached ledger
        setTabLedgers(prev => {
          const next = { ...prev };
          delete next[collectTab.id];
          return next;
        });
      } else {
        HapticFeedback.trigger('error');
        showAlert(data.message || "Failed to process payment", "PAYMENT FAILED", "error");
      }
    } catch {
      HapticFeedback.trigger('error');
      showAlert("Network error processing payment", "NETWORK ERROR", "error");
    } finally {
      setSubmittingPay(false);
    }
  };

  const [remindingTabId, setRemindingTabId] = useState<number | null>(null);

  // Send single WhatsApp statement & self-pay reminder
  const handleSendTabReminder = async (tab: Tab) => {
    if (!tab.customer_phone) {
      HapticFeedback.trigger('error');
      showAlert("This tab does not have a customer phone number registered.", "NO PHONE REGISTERED", "error");
      return;
    }

    if (Number(tab.balance) <= 0) {
      HapticFeedback.trigger('error');
      showAlert("Tab has zero outstanding balance. No reminder needed.", "ZERO BALANCE", "info");
      return;
    }

    setRemindingTabId(tab.id);
    HapticFeedback.trigger('confirmation');

    try {
      const res = await fetch(`/api/vendor/tabs/${tab.id}/remind`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger('success');
        showAlert(data.message || `WhatsApp reminder sent to ${tab.customer_phone}!`, "REMINDER SENT", "success");
      } else {
        HapticFeedback.trigger('error');
        showAlert(data.message || "Failed to dispatch WhatsApp reminder.", "DISPATCH FAILED", "error");
      }
    } catch {
      HapticFeedback.trigger('error');
      showAlert("Network error sending WhatsApp reminder.", "NETWORK ERROR", "error");
    } finally {
      setRemindingTabId(null);
    }
  };

  // Open Remind All Custom Modal
  const openRemindAllModal = () => {
    HapticFeedback.trigger('confirmation');
    setRemindAllModal({
      open: true,
      submitting: false,
      successMessage: null,
      errorMessage: null,
    });
  };

  // Execute Bulk festival audit closeout reminders
  const executeRemindAll = async () => {
    if (remindAllModal.submitting) return;
    setRemindAllModal((prev) => ({ ...prev, submitting: true, errorMessage: null }));
    HapticFeedback.trigger('confirmation');

    try {
      const res = await fetch('/api/vendor/tabs/remind-all', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        HapticFeedback.trigger('success');
        setRemindAllModal((prev) => ({
          ...prev,
          submitting: false,
          successMessage: data.message || `Dispatched ${data.count} reminders successfully!`,
        }));
        fetchTabs();
      } else {
        HapticFeedback.trigger('error');
        setRemindAllModal((prev) => ({
          ...prev,
          submitting: false,
          errorMessage: data.message || "Failed to dispatch reminders.",
        }));
      }
    } catch {
      HapticFeedback.trigger('error');
      setRemindAllModal((prev) => ({
        ...prev,
        submitting: false,
        errorMessage: "Network error sending bulk reminders.",
      }));
    }
  };

  const handleAction = (actionName: string) => {
    HapticFeedback.trigger('confirmation');
    showAlert(`${actionName} triggered! (MVP functionality)`, "ACTION TRIGGERED", "info");
  };

  const filteredTabs = tabs.filter(tab => 
    tab.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (tab.customer_phone && tab.customer_phone.includes(searchTerm))
  );

  // Cash change calculations
  const balanceOwed = collectTab ? Number(collectTab.balance) : 0;
  const singlePayNum = Number(payAmount) || 0;
  const cashChangeDue = (!isSplitPayment && payMethod === 'cash' && singlePayNum > balanceOwed) 
    ? singlePayNum - balanceOwed 
    : 0;

  const splitCashNum = Number(splitCashAmount) || 0;
  const splitMpesaNum = Number(splitMpesaAmount) || 0;
  const splitTotalEntered = splitCashNum + splitMpesaNum;
  const splitChangeDue = (isSplitPayment && splitCashNum > 0 && splitTotalEntered > balanceOwed)
    ? splitTotalEntered - balanceOwed
    : 0;

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 pb-32 md:pb-8 bg-brand-off-white font-mono text-brand-navy">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wider">CUSTOMER TABS MANAGEMENT</h1>
          <p className="text-xs font-bold uppercase opacity-70 mt-1">Itemized Ledgers • Protected Limits • Batch Paydown & Settle</p>
        </div>
      </div>

      <div className="mb-3 md:mb-6 relative">
        <input 
          type="text" 
          placeholder="SEARCH TABS BY CUSTOMER NAME OR PHONE..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:max-w-md p-3 md:p-4 bg-white border-2 md:border-4 border-brand-navy font-bold uppercase text-xs md:text-sm shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-md) focus:outline-none focus:ring-4 focus:ring-brand-accent"
        />
      </div>

      {/* Festival Closeout Audit Banner */}
      {!loading && (() => {
        const openTabsWithBalance = tabs.filter(
          (t) => t.status !== "settled" && t.status !== "written_off" && Number(t.balance) > 0
        );
        const totalBalanceOwed = openTabsWithBalance.reduce(
          (sum, t) => sum + Number(t.balance || 0),
          0
        );

        if (openTabsWithBalance.length === 0) return null;

        return (
          <div className="mb-3 md:mb-6 bg-brand-navy text-brand-off-white border-2 md:border-4 border-brand-navy p-2.5 md:p-5 shadow-(--shadow-brut-sm) md:shadow-(--shadow-brut-lg-accent) flex flex-row items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 md:gap-2 mb-0.5 md:mb-1">
                <span className="bg-amber-400 text-brand-navy text-[9px] md:text-[11px] font-black px-1.5 py-0.5 uppercase tracking-wider shrink-0">
                  ⚠️ AUDIT
                </span>
                <span className="text-[11px] md:text-xs uppercase font-bold text-brand-accent tracking-wider truncate">
                  {openTabsWithBalance.length} Open Tabs · KES {totalBalanceOwed.toLocaleString()}
                </span>
              </div>
              <h2 className="hidden md:block font-display text-xl uppercase tracking-wider text-brand-off-white">
                FESTIVAL AUDIT: Settle tabs before festival end
              </h2>
              <p className="hidden md:block text-xs opacity-75 uppercase">
                Dispatch personalized itemized reminders &amp; remote M-Pesa self-pay links directly to all customers.
              </p>
            </div>

            <button
              onClick={openRemindAllModal}
              disabled={remindAllModal.submitting}
              className="px-3 py-1.5 md:px-5 md:py-3 bg-brand-accent text-brand-navy border-2 border-brand-navy font-display text-xs md:text-base uppercase tracking-wider hover:bg-white active:scale-95 shadow-(--shadow-brut-xs) transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer whitespace-nowrap"
            >
              {remindAllModal.submitting
                ? "📢 DISPATCHING..."
                : `REMIND ALL (${openTabsWithBalance.length})`}
            </button>
          </div>
        );
      })()}

      {loading ? (
        <div className="animate-pulse font-bold uppercase text-lg">Loading Customer Tabs...</div>
      ) : (
        <div className="flex flex-col gap-4 pb-20">
          {filteredTabs.map(tab => {
            const isSettled = tab.status === 'settled';
            const bal = Number(tab.balance);
            const lim = Number(tab.credit_limit);
            const isOverLimit = bal > lim;
            const isNearLimit = !isOverLimit && bal >= lim * 0.8;
            const ledger = tabLedgers[tab.id] || [];
            const isLoadingLedger = loadingLedger[tab.id] || false;

            return (
              <div 
                key={tab.id} 
                className={`bg-white border-4 border-brand-navy shadow-(--shadow-brut-md) overflow-hidden transition-all ${
                  isSettled ? 'opacity-80 bg-zinc-50' : ''
                }`}
              >
                <div 
                  className="p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center cursor-pointer hover:bg-brand-accent/20 transition-colors select-none"
                  onClick={() => toggleTab(tab.id)}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-lg uppercase">{tab.customer_name}</span>
                        {isSettled ? (
                          <span className="bg-zinc-200 text-zinc-700 text-[10px] font-bold px-2 py-0.5 border border-brand-navy uppercase">
                            Settled / Closed
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 border border-brand-navy uppercase">
                            Active Open
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold opacity-70 uppercase flex items-center gap-2">
                        <span>📞 {tab.customer_phone || "No Phone"}</span>
                        <span>•</span>
                        <span>Tab #{tab.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 md:mt-0 flex items-center gap-4">
                    <div className="text-right">
                      <div className={`font-display text-2xl ${
                        isSettled ? 'text-zinc-500' : isOverLimit ? 'text-red-700' : isNearLimit ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        KES {bal.toLocaleString()}
                      </div>
                      <div className="text-xs font-bold opacity-70 uppercase">
                        / KES {lim.toLocaleString()} LIMIT
                      </div>
                    </div>
                    <div className="w-8 h-8 flex items-center justify-center border-2 border-brand-navy bg-white font-bold text-lg">
                      {expandedTab === tab.id ? '−' : '+'}
                    </div>
                  </div>
                </div>

                {/* Expanded Section */}
                {expandedTab === tab.id && (
                  <div className="border-t-4 border-brand-navy bg-brand-off-white p-4 md:p-6">
                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center gap-3 mb-6 pb-4 border-b-2 border-brand-navy/20">
                      <button 
                        onClick={() => openCollectPayment(tab)} 
                        disabled={isSettled || bal <= 0}
                        className="px-4 py-2.5 bg-brand-navy text-brand-accent border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none hover:bg-brand-accent hover:text-brand-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        💳 Collect Payment
                      </button>
                      <button 
                        onClick={() => openEditLimit(tab)}
                        disabled={isSettled}
                        className="px-4 py-2.5 bg-white text-brand-navy border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none hover:bg-brand-navy/10 transition-colors disabled:opacity-40"
                      >
                        ⚙️ Edit Limit
                      </button>
                      <button 
                        onClick={() => openSettleTab(tab)}
                        disabled={isSettled}
                        className={`px-4 py-2.5 border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none transition-colors disabled:opacity-40 ${
                          bal > 0 
                            ? 'bg-amber-100 text-amber-900 hover:bg-amber-200' 
                            : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                        }`}
                      >
                        {bal > 0 ? "⚠️ Settle / Write-off" : "✅ Settle Tab"}
                      </button>
                      <button 
                        onClick={() => handleSendTabReminder(tab)}
                        disabled={isSettled || bal <= 0 || remindingTabId === tab.id}
                        className="px-4 py-2.5 bg-transparent text-brand-navy border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-xs) active:translate-y-1 active:shadow-none hover:bg-brand-navy/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {remindingTabId === tab.id ? "⏳ Dispatching..." : "Send WhatsApp Reminder"}
                      </button>
                    </div>

                    {/* Stats & Credit Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                      <div className="p-3 bg-white border-2 border-brand-navy shadow-(--shadow-brut-2xs)">
                        <div className="text-[11px] font-bold uppercase opacity-70">Current Balance Owed</div>
                        <div className="font-display text-xl text-red-600">KES {bal.toLocaleString()}</div>
                      </div>
                      <div className="p-3 bg-white border-2 border-brand-navy shadow-(--shadow-brut-2xs)">
                        <div className="text-[11px] font-bold uppercase opacity-70">Credit Limit</div>
                        <div className="font-display text-xl text-brand-navy">KES {lim.toLocaleString()}</div>
                      </div>
                      <div className="p-3 bg-white border-2 border-brand-navy shadow-(--shadow-brut-2xs)">
                        <div className="text-[11px] font-bold uppercase opacity-70">Available Credit</div>
                        <div className={`font-display text-xl ${lim - bal < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          KES {(lim - bal).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {isSettled && tab.settlement_reason && (
                      <div className="mb-6 p-3 bg-amber-50 border-2 border-amber-600 text-amber-900 text-xs font-bold uppercase">
                        <div>Settlement / Write-off Reason:</div>
                        <div className="mt-1 font-mono font-normal normal-case">{tab.settlement_reason}</div>
                      </div>
                    )}

                    {/* GAP 4: Itemized Transaction Ledger */}
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-brand-navy flex items-center gap-2">
                          <span>📋 Itemized Transaction Ledger</span>
                          <span className="text-[10px] bg-brand-navy text-white px-1.5 py-0.5 font-mono">
                            {ledger.length} entries
                          </span>
                        </h4>
                        <button
                          onClick={() => {
                            setLoadingLedger(prev => ({ ...prev, [tab.id]: true }));
                            fetch(`/api/vendor/tabs/${tab.id}`)
                              .then(res => res.json())
                              .then(data => {
                                if (data.success && data.tab) {
                                  setTabLedgers(prev => ({ ...prev, [tab.id]: data.tab.transactions || [] }));
                                }
                              })
                              .finally(() => {
                                setLoadingLedger(prev => ({ ...prev, [tab.id]: false }));
                              });
                          }}
                          className="text-[10px] uppercase font-bold text-brand-navy hover:underline"
                        >
                          Refresh Ledger
                        </button>
                      </div>

                      {isLoadingLedger ? (
                        <div className="p-4 bg-white border-2 border-brand-navy text-center font-bold text-xs uppercase animate-pulse">
                          Loading Transaction History...
                        </div>
                      ) : ledger.length === 0 ? (
                        <div className="p-4 bg-white border-2 border-dashed border-brand-navy/50 text-center font-bold text-xs uppercase opacity-70">
                          No transactions recorded for this tab yet.
                        </div>
                      ) : (
                        <div className="border-2 border-brand-navy bg-white shadow-(--shadow-brut-2xs) divide-y-2 divide-brand-navy/10 overflow-hidden">
                          {ledger.map((txn) => {
                            const isCharge = txn.type === 'charge';
                            const formattedDate = new Date(txn.created_at).toLocaleString('en-KE', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });

                            return (
                              <div key={txn.id} className="p-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 text-xs">
                                <div className="flex items-center gap-3">
                                  <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider ${
                                    isCharge 
                                      ? 'bg-red-100 text-red-800 border-red-800' 
                                      : 'bg-emerald-100 text-emerald-800 border-emerald-800'
                                  }`}>
                                    {isCharge ? 'CHARGE' : 'PAYMENT'}
                                  </span>
                                  <div>
                                    <span className="font-bold uppercase">
                                      {isCharge ? 'Tab Charge' : `Payment (${(txn.method || 'cash').toUpperCase()})`}
                                    </span>
                                    {txn.mpesa_ref && (
                                      <span className="ml-2 font-mono text-[11px] bg-emerald-50 px-1 py-0.2 border border-emerald-400">
                                        REF: {txn.mpesa_ref}
                                      </span>
                                    )}
                                    {txn.ordered_by && (
                                      <span className="ml-2 text-zinc-600 font-bold">
                                        • Ordered by: {txn.ordered_by}
                                      </span>
                                    )}
                                    {txn.sale_id && (
                                      <span className="ml-2 opacity-60 font-mono text-[10px]">
                                        Sale #{txn.sale_id.slice(-6)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 self-end md:self-auto">
                                  <span className="text-[11px] opacity-70 font-mono">
                                    {formattedDate}
                                  </span>
                                  <span className={`font-mono font-bold text-sm ${
                                    isCharge ? 'text-red-600' : 'text-emerald-700'
                                  }`}>
                                    {isCharge ? '+' : '-'}KES {Number(txn.amount).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredTabs.length === 0 && (
            <div className="p-8 text-center border-4 border-brand-navy bg-white font-bold uppercase">
              No customer tabs found matching criteria.
            </div>
          )}
        </div>
      )}

      {/* Collect Payment Modal (Enhanced with Chips, Split, Change, STK Push) */}
      {collectTab && (
        <div className="fixed inset-0 z-50 bg-brand-navy/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent) text-brand-navy relative my-8">
            <div className="flex justify-between items-center border-b-4 border-brand-navy pb-3 mb-4">
              <div>
                <h3 className="font-display text-2xl uppercase tracking-wider">Collect Tab Payment</h3>
                <p className="text-xs font-bold uppercase opacity-70">{collectTab.customer_name} • Tab #{collectTab.id}</p>
              </div>
              <button 
                onClick={() => setCollectTab(null)}
                className="border-2 border-brand-navy w-8 h-8 flex items-center justify-center hover:bg-brand-accent transition-colors font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-brand-off-white border-2 border-brand-navy p-3 mb-4">
              <div className="flex justify-between items-center text-xs font-bold uppercase mb-1">
                <span>Current Balance Owed:</span>
                <span className="font-mono text-red-600 text-base font-bold">KES {Number(collectTab.balance).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] opacity-75 uppercase">
                <span>Credit Limit:</span>
                <span className="font-mono">KES {Number(collectTab.credit_limit).toLocaleString()}</span>
              </div>
            </div>

            {/* GAP 12: Batch Payment Chips */}
            <div className="mb-4">
              <label className="block text-[11px] font-bold uppercase mb-1.5 opacity-80">Quick Batch Paydown</label>
              <div className="grid grid-cols-5 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => handleBatchChip('500')}
                  className="py-1.5 border-2 border-brand-navy bg-white hover:bg-brand-accent/40 font-bold uppercase transition-colors"
                >
                  500
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchChip('1000')}
                  className="py-1.5 border-2 border-brand-navy bg-white hover:bg-brand-accent/40 font-bold uppercase transition-colors"
                >
                  1,000
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchChip('2000')}
                  className="py-1.5 border-2 border-brand-navy bg-white hover:bg-brand-accent/40 font-bold uppercase transition-colors"
                >
                  2,000
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchChip('half')}
                  className="py-1.5 border-2 border-brand-navy bg-white hover:bg-brand-accent/40 font-bold uppercase transition-colors"
                >
                  Half
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchChip('full')}
                  className="py-1.5 border-2 border-brand-navy bg-brand-navy text-brand-accent font-bold uppercase transition-colors"
                >
                  Full
                </button>
              </div>
            </div>

            {/* GAP 13: Split Payment Toggle */}
            <div className="mb-4 flex items-center justify-between p-2.5 border-2 border-brand-navy bg-brand-off-white">
              <div>
                <span className="text-xs font-bold uppercase block">Split Payment (Cash + M-Pesa)</span>
                <span className="text-[10px] opacity-70">Collect a portion in cash and remainder via M-Pesa</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  HapticFeedback.trigger('confirmation');
                  setIsSplitPayment(!isSplitPayment);
                }}
                className={`px-3 py-1 text-xs font-bold uppercase border-2 border-brand-navy transition-colors ${
                  isSplitPayment ? 'bg-brand-navy text-brand-accent' : 'bg-white text-brand-navy hover:bg-zinc-100'
                }`}
              >
                {isSplitPayment ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {/* Mode 1: Split Payment Form */}
            {isSplitPayment ? (
              <div className="space-y-4">
                <div className="p-3 border-2 border-brand-navy bg-amber-50/40 space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold uppercase">
                    <span>💵 Cash Portion (KES)</span>
                    <button
                      type="button"
                      onClick={() => {
                        const bal = Number(collectTab.balance);
                        const mVal = Number(splitMpesaAmount) || 0;
                        setSplitCashAmount(Math.max(0, bal - mVal).toString());
                      }}
                      className="text-[10px] uppercase font-bold text-brand-navy hover:underline"
                    >
                      Fill Remainder
                    </button>
                  </div>
                  <input
                    type="number"
                    placeholder="0"
                    value={splitCashAmount}
                    onChange={e => setSplitCashAmount(e.target.value)}
                    className="w-full border-2 border-brand-navy p-2 font-mono text-lg bg-white outline-none focus:ring-2 focus:ring-brand-accent"
                  />

                  {/* Cash Change in Split mode */}
                  {splitChangeDue > 0 && (
                    <div className="p-2 border-2 border-emerald-600 bg-emerald-50 text-emerald-800 text-xs font-bold uppercase flex justify-between items-center">
                      <span>Change Due to Customer:</span>
                      <span className="font-mono text-sm">KES {splitChangeDue.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="p-3 border-2 border-brand-navy bg-emerald-50/40 space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold uppercase">
                    <span>📱 M-Pesa Portion (KES)</span>
                    <button
                      type="button"
                      onClick={() => {
                        const bal = Number(collectTab.balance);
                        const cVal = Number(splitCashAmount) || 0;
                        setSplitMpesaAmount(Math.max(0, bal - cVal).toString());
                      }}
                      className="text-[10px] uppercase font-bold text-brand-navy hover:underline"
                    >
                      Fill Remainder
                    </button>
                  </div>
                  <input
                    type="number"
                    placeholder="0"
                    value={splitMpesaAmount}
                    onChange={e => setSplitMpesaAmount(e.target.value)}
                    className="w-full border-2 border-brand-navy p-2 font-mono text-lg bg-white outline-none focus:ring-2 focus:ring-brand-accent"
                  />

                  {/* STK Push Trigger for Split M-Pesa */}
                  <div className="pt-2 border-t border-brand-navy/20 space-y-2">
                    <label className="block text-[11px] font-bold uppercase">Customer M-Pesa Phone</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="07XXXXXXXX or 254..."
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value)}
                        className="flex-1 border-2 border-brand-navy p-2 font-mono text-xs uppercase bg-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => triggerStkPush(Number(splitMpesaAmount))}
                        disabled={isTriggeringStk || Number(splitMpesaAmount) <= 0 || !customerPhone.trim()}
                        className="px-3 py-2 bg-emerald-600 text-white border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-xs) active:translate-y-0.5 hover:bg-emerald-700 disabled:opacity-40"
                      >
                        {isTriggeringStk ? "Sending..." : "🚀 STK Push"}
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase mt-2">M-Pesa Reference / Code</label>
                      <input
                        type="text"
                        placeholder="e.g. QKH71829..."
                        value={mpesaRef}
                        onChange={e => setMpesaRef(e.target.value)}
                        className={`w-full border-2 border-brand-navy p-2 font-mono text-xs uppercase bg-white outline-none ${
                          isMpesaVerified ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-bold' : ''
                        }`}
                      />
                      {isMpesaVerified && (
                        <span className="text-[10px] text-emerald-700 font-bold uppercase mt-1 block">
                          ✓ Verified via PayHero STK Callback
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-2 border-2 border-brand-navy bg-white flex justify-between items-center text-xs font-bold uppercase">
                  <span>Total Split Recorded:</span>
                  <span className="font-mono text-sm">KES {splitTotalEntered.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              /* Mode 2: Standard Single Payment Form */
              <div className="space-y-4">
                {/* Method Toggle */}
                <div>
                  <label className="block text-xs font-bold uppercase mb-1.5">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPayMethod('cash')}
                      className={`py-2 px-3 border-2 border-brand-navy font-bold uppercase text-xs transition-colors ${
                        payMethod === 'cash' ? 'bg-brand-navy text-brand-accent' : 'bg-brand-off-white hover:bg-brand-navy/10'
                      }`}
                    >
                      💵 Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayMethod('mpesa')}
                      className={`py-2 px-3 border-2 border-brand-navy font-bold uppercase text-xs transition-colors ${
                        payMethod === 'mpesa' ? 'bg-brand-navy text-brand-accent' : 'bg-brand-off-white hover:bg-brand-navy/10'
                      }`}
                    >
                      📱 M-Pesa
                    </button>
                  </div>
                </div>

                {/* Amount Input */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold uppercase">Amount Received (KES) *</label>
                    <button
                      type="button"
                      onClick={() => setPayAmount(collectTab.balance.toString())}
                      className="text-[10px] bg-brand-accent text-brand-navy px-1.5 py-0.5 border border-brand-navy font-bold uppercase"
                    >
                      Full Balance
                    </button>
                  </div>
                  <input 
                    type="number"
                    placeholder="e.g. 500"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="w-full border-2 border-brand-navy p-2.5 font-mono text-xl bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none"
                    autoFocus
                  />
                </div>

                {/* GAP 20: Cash Change Due calculation */}
                {cashChangeDue > 0 && (
                  <div className="p-3 border-2 border-emerald-600 bg-emerald-50 text-emerald-800 text-xs font-bold uppercase flex justify-between items-center shadow-(--shadow-brut-2xs)">
                    <span>Change Due to Customer:</span>
                    <span className="font-mono text-base font-bold">KES {cashChangeDue.toLocaleString()}</span>
                  </div>
                )}

                {/* GAP 21: M-Pesa Reference & PayHero STK Push Support */}
                {payMethod === 'mpesa' && (
                  <div className="p-3 border-2 border-brand-navy bg-brand-off-white space-y-3">
                    <div>
                      <label className="block text-xs font-bold uppercase mb-1">Customer Phone (for STK Push)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="07XXXXXXXX or 254..."
                          value={customerPhone}
                          onChange={e => setCustomerPhone(e.target.value)}
                          className="flex-1 border-2 border-brand-navy p-2 font-mono text-xs uppercase bg-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => triggerStkPush(Number(payAmount))}
                          disabled={isTriggeringStk || Number(payAmount) <= 0 || !customerPhone.trim()}
                          className="px-3 py-2 bg-emerald-600 text-white border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-xs) active:translate-y-0.5 hover:bg-emerald-700 disabled:opacity-40"
                        >
                          {isTriggeringStk ? "Sending..." : "🚀 STK Push"}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase mb-1">M-Pesa Reference / Code</label>
                      <input 
                        type="text"
                        placeholder="e.g. QKH71829..."
                        value={mpesaRef}
                        onChange={e => setMpesaRef(e.target.value)}
                        className={`w-full border-2 border-brand-navy p-2 font-mono text-sm uppercase bg-white outline-none ${
                          isMpesaVerified ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-bold' : ''
                        }`}
                      />
                      {isMpesaVerified && (
                        <span className="text-[10px] text-emerald-700 font-bold uppercase mt-1 block">
                          ✓ Verified via PayHero STK Callback
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6 pt-4 border-t-2 border-brand-navy">
              <button 
                type="button"
                onClick={() => setCollectTab(null)}
                className="flex-1 py-3 border-2 border-brand-navy font-bold uppercase text-xs hover:bg-brand-navy/10 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={
                  submittingPay || 
                  (isSplitPayment ? (splitCashNum <= 0 && splitMpesaNum <= 0) : (!payAmount || singlePayNum <= 0))
                }
                onClick={handleProcessPayment}
                className="flex-1 py-3 bg-brand-navy text-brand-accent border-2 border-brand-navy font-display uppercase text-lg hover:bg-brand-accent hover:text-brand-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-(--shadow-brut-xs) active:translate-y-0.5"
              >
                {submittingPay ? "Recording..." : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAP 6: Edit Credit Limit Modal */}
      {limitTab && (
        <div className="fixed inset-0 z-50 bg-brand-navy/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent) text-brand-navy relative">
            <div className="flex justify-between items-center border-b-4 border-brand-navy pb-3 mb-4">
              <div>
                <h3 className="font-display text-2xl uppercase tracking-wider">Edit Credit Limit</h3>
                <p className="text-xs font-bold uppercase opacity-70">{limitTab.customer_name} • Tab #{limitTab.id}</p>
              </div>
              <button 
                onClick={() => setLimitTab(null)}
                className="border-2 border-brand-navy w-8 h-8 flex items-center justify-center hover:bg-brand-accent transition-colors font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-brand-off-white border-2 border-brand-navy p-3 mb-4">
              <div className="flex justify-between items-center text-xs font-bold uppercase mb-1">
                <span>Current Balance Owed (Floor):</span>
                <span className="font-mono text-red-600 font-bold">KES {Number(limitTab.balance).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] opacity-75 uppercase">
                <span>Current Limit:</span>
                <span className="font-mono">KES {Number(limitTab.credit_limit).toLocaleString()}</span>
              </div>
            </div>

            {/* Quick Limit Presets */}
            <div className="mb-4">
              <label className="block text-[11px] font-bold uppercase mb-1.5 opacity-80">Preset Credit Limits</label>
              <div className="grid grid-cols-4 gap-2 text-xs">
                {['2000', '5000', '10000', '20000'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      HapticFeedback.trigger('confirmation');
                      setNewLimitAmount(preset);
                    }}
                    className={`py-2 border-2 border-brand-navy font-bold uppercase transition-colors ${
                      newLimitAmount === preset ? 'bg-brand-navy text-brand-accent' : 'bg-white hover:bg-brand-accent/40'
                    }`}
                  >
                    {Number(preset) >= 1000 ? `${Number(preset)/1000}K` : preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold uppercase mb-1">New Credit Limit (KES) *</label>
              <input 
                type="number"
                value={newLimitAmount}
                onChange={e => setNewLimitAmount(e.target.value)}
                className="w-full border-2 border-brand-navy p-2.5 font-mono text-xl bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none"
                autoFocus
              />
              {Number(newLimitAmount) < Number(limitTab.balance) && (
                <p className="text-[11px] text-red-600 font-bold uppercase mt-1.5">
                  ⚠️ Error: Limit cannot be lower than current balance owed (KES {Number(limitTab.balance).toLocaleString()}).
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t-2 border-brand-navy">
              <button 
                type="button"
                onClick={() => setLimitTab(null)}
                className="flex-1 py-3 border-2 border-brand-navy font-bold uppercase text-xs hover:bg-brand-navy/10 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={submittingLimit || !newLimitAmount || Number(newLimitAmount) < Number(limitTab.balance)}
                onClick={handleUpdateLimitSubmit}
                className="flex-1 py-3 bg-brand-navy text-brand-accent border-2 border-brand-navy font-display uppercase text-lg hover:bg-brand-accent hover:text-brand-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-(--shadow-brut-xs) active:translate-y-0.5"
              >
                {submittingLimit ? "Saving..." : "Save Limit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAP 5: Settle / Close Tab Modal */}
      {closeTabTarget && (
        <div className="fixed inset-0 z-50 bg-brand-navy/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent) text-brand-navy relative">
            <div className="flex justify-between items-center border-b-4 border-brand-navy pb-3 mb-4">
              <div>
                <h3 className="font-display text-2xl uppercase tracking-wider">
                  {Number(closeTabTarget.balance) > 0 ? "⚠️ Settle with Write-off" : "Close Customer Tab"}
                </h3>
                <p className="text-xs font-bold uppercase opacity-70">{closeTabTarget.customer_name} • Tab #{closeTabTarget.id}</p>
              </div>
              <button 
                onClick={() => setCloseTabTarget(null)}
                className="border-2 border-brand-navy w-8 h-8 flex items-center justify-center hover:bg-brand-accent transition-colors font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-brand-off-white border-2 border-brand-navy p-3 mb-4">
              <div className="flex justify-between items-center text-xs font-bold uppercase">
                <span>Remaining Balance:</span>
                <span className={`font-mono text-base font-bold ${Number(closeTabTarget.balance) > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  KES {Number(closeTabTarget.balance).toLocaleString()}
                </span>
              </div>
            </div>

            {Number(closeTabTarget.balance) > 0 ? (
              <div className="mb-4 space-y-3">
                <div className="p-3 bg-red-50 border-2 border-red-600 text-red-800 text-xs font-bold uppercase leading-relaxed">
                  Notice: This tab has an outstanding balance of KES {Number(closeTabTarget.balance).toLocaleString()}. Settling now will write off or close the balance. A mandatory explanation is required.
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">
                    Write-off / Settlement Reason *
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Promoter approved write-off, Paid outside POS via direct bank transfer, or VIP courtesy settlement..."
                    value={settlementReason}
                    onChange={e => setSettlementReason(e.target.value)}
                    className="w-full border-2 border-brand-navy p-2.5 font-mono text-xs bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none"
                    autoFocus
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs font-bold uppercase text-emerald-800 bg-emerald-50 border-2 border-emerald-600 p-3 mb-4">
                ✓ Balance is KES 0. Tab is fully paid and ready to be closed.
              </p>
            )}

            <div className="flex gap-3 pt-4 border-t-2 border-brand-navy">
              <button 
                type="button"
                onClick={() => setCloseTabTarget(null)}
                className="flex-1 py-3 border-2 border-brand-navy font-bold uppercase text-xs hover:bg-brand-navy/10 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={submittingClose || (Number(closeTabTarget.balance) > 0 && !settlementReason.trim())}
                onClick={handleCloseTabSubmit}
                className="flex-1 py-3 bg-red-600 text-white border-2 border-brand-navy font-display uppercase text-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-(--shadow-brut-xs) active:translate-y-0.5"
              >
                {submittingClose ? "Settling..." : "Confirm Settle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PayHero STK Polling Progress Modal */}
      {showStkModal && (
        <div className="fixed inset-0 z-60 bg-brand-navy/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-4 border-brand-navy p-6 w-full max-w-sm shadow-(--shadow-brut-xl-accent) text-brand-navy text-center space-y-4">
            <div className="w-12 h-12 border-4 border-brand-navy border-t-emerald-600 rounded-full animate-spin mx-auto" />
            <h4 className="font-display text-2xl uppercase tracking-wider">M-Pesa STK Prompt Sent</h4>
            <p className="text-xs font-bold uppercase opacity-80">{stkStatusMessage}</p>
            <div className="bg-brand-off-white border-2 border-brand-navy p-3 font-mono text-sm">
              <div>Time Remaining: <span className="font-bold text-red-600">{stkTimeLeft}s</span></div>
              <div className="text-[11px] opacity-70 mt-1 truncate">Ref: {stkReference}</div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowStkModal(false);
                  HapticFeedback.trigger('confirmation');
                }}
                className="w-full py-2 border-2 border-brand-navy font-bold text-xs uppercase hover:bg-brand-navy/10"
              >
                Enter Code Manually Instead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Remind All Confirmation & Progress Modal */}
      {remindAllModal.open && (() => {
        const eligibleTabs = tabs.filter(t => {
          const bal = Number(t.balance);
          const isClosed = t.status === 'settled' || t.status === 'written_off';
          return !isClosed && bal > 0;
        });
        const totalBalanceOwed = eligibleTabs.reduce((sum, t) => sum + Number(t.balance || 0), 0);
        const tabsWithPhone = eligibleTabs.filter(t => t.customer_phone && t.customer_phone.trim().length >= 9);
        const tabsWithoutPhone = eligibleTabs.length - tabsWithPhone.length;

        return (
          <div className="fixed inset-0 z-50 bg-brand-navy/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg border-4 border-brand-navy p-6 shadow-(--shadow-brut-xl-accent) text-brand-navy relative">
              <div className="flex justify-between items-center border-b-4 border-brand-navy pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-brand-accent border-2 border-brand-navy font-bold text-xs">
                    💬
                  </span>
                  <div>
                    <h3 className="font-display text-2xl uppercase tracking-wider leading-none">
                      Bulk Tab Reminders
                    </h3>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-brand-navy/70 mt-0.5">
                      WhatsApp Statement & Self-Pay Link Dispatch
                    </p>
                  </div>
                </div>
                {!remindAllModal.submitting && (
                  <button
                    type="button"
                    onClick={() => {
                      HapticFeedback.trigger('confirmation');
                      setRemindAllModal(prev => ({ ...prev, open: false }));
                    }}
                    className="p-1 hover:bg-brand-navy/10 border-2 border-transparent hover:border-brand-navy transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {remindAllModal.successMessage ? (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-100 border-2 border-brand-navy text-emerald-950">
                    <div className="flex items-center gap-2 font-display text-lg uppercase tracking-wide mb-1 text-emerald-900">
                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                      <span>Dispatch Complete</span>
                    </div>
                    <p className="text-xs font-mono font-bold">
                      {remindAllModal.successMessage}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      HapticFeedback.trigger('confirmation');
                      setRemindAllModal({ open: false, submitting: false, successMessage: null, errorMessage: null });
                      fetchTabs();
                    }}
                    className="w-full py-3 bg-brand-navy text-brand-off-white font-display text-lg uppercase tracking-wider hover:bg-brand-accent hover:text-brand-navy border-2 border-brand-navy transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
                  >
                    Done & Refresh Tabs
                  </button>
                </div>
              ) : remindAllModal.submitting ? (
                <div className="py-8 text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-brand-navy border-t-emerald-600 rounded-full animate-spin mx-auto" />
                  <h4 className="font-display text-2xl uppercase tracking-wider">
                    Dispatching Statements...
                  </h4>
                  <p className="text-xs font-mono font-bold uppercase opacity-80 max-w-xs mx-auto">
                    Sending personalized WhatsApp receipts & secure M-Pesa self-pay links to {tabsWithPhone.length} customers
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {remindAllModal.errorMessage && (
                    <div className="p-3 bg-red-100 border-2 border-brand-navy text-red-950 text-xs font-mono font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{remindAllModal.errorMessage}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-brand-off-white border-2 border-brand-navy p-3">
                      <span className="block text-[10px] font-mono uppercase text-brand-navy/70 border-b border-brand-navy/30 pb-1 mb-1">
                        Outstanding Balance
                      </span>
                      <span className="font-display text-2xl text-brand-navy">
                        KES {totalBalanceOwed.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-brand-accent/30 border-2 border-brand-navy p-3">
                      <span className="block text-[10px] font-mono uppercase text-brand-navy/70 border-b border-brand-navy/30 pb-1 mb-1">
                        Eligible Customers
                      </span>
                      <span className="font-display text-2xl text-brand-navy">
                        {tabsWithPhone.length} <span className="text-xs font-mono">/ {eligibleTabs.length}</span>
                      </span>
                    </div>
                  </div>

                  <div className="bg-brand-off-white border-2 border-brand-navy p-3 text-xs font-mono space-y-1.5 leading-relaxed">
                    <p className="font-bold">
                      Each customer will receive a WhatsApp statement containing:
                    </p>
                    <ul className="list-disc list-inside text-[11px] opacity-80 space-y-0.5 ml-1">
                      <li>Full itemized bill and current outstanding balance</li>
                      <li>Encrypted 1-click M-Pesa remote payment link</li>
                      <li>Festival till instructions for prompt settlement</li>
                    </ul>
                    {tabsWithoutPhone > 0 && (
                      <p className="text-[10px] text-amber-800 font-bold pt-1 border-t border-brand-navy/20">
                        ⚠️ Note: {tabsWithoutPhone} tab(s) do not have a customer phone number and will be skipped.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <button
                      type="button"
                      disabled={tabsWithPhone.length === 0}
                      onClick={executeRemindAll}
                      className="flex-1 py-3 bg-brand-accent text-brand-navy border-2 border-brand-navy font-display text-lg uppercase tracking-wider hover:bg-brand-navy hover:text-brand-off-white transition-all shadow-(--shadow-brut-xs) active:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Dispatch {tabsWithPhone.length} Reminders Now →
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        HapticFeedback.trigger('confirmation');
                        setRemindAllModal(prev => ({ ...prev, open: false }));
                      }}
                      className="py-3 px-5 bg-transparent border-2 border-brand-navy font-bold text-xs uppercase hover:bg-brand-navy/10 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Custom Application Alert / Notification Modal */}
      {alertModal.open && (
        <div className="fixed inset-0 z-60 bg-brand-navy/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-4 border-brand-navy p-6 w-full max-w-sm shadow-(--shadow-brut-xl-accent) text-brand-navy text-center space-y-4">
            <div className={`w-12 h-12 border-2 border-brand-navy mx-auto flex items-center justify-center text-xl font-black ${
              alertModal.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
              alertModal.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-brand-accent text-brand-navy'
            }`}>
              {alertModal.type === 'success' ? '✓' : alertModal.type === 'error' ? '!' : 'ℹ'}
            </div>
            <div>
              <h4 className="font-display text-xl uppercase tracking-wider mb-1">
                {alertModal.title}
              </h4>
              <p className="text-xs font-mono font-bold opacity-80 break-words">
                {alertModal.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                HapticFeedback.trigger('confirmation');
                setAlertModal(prev => ({ ...prev, open: false }));
              }}
              className="w-full py-2.5 bg-brand-navy text-brand-off-white font-bold text-xs uppercase hover:bg-brand-accent hover:text-brand-navy border-2 border-brand-navy transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
