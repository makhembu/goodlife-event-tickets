"use client";

import React, { useState, useEffect } from "react";
import { Store, Plus, Key, Edit, CheckCircle, AlertCircle, RefreshCw, Send, ExternalLink, Receipt, Eye, EyeOff, Copy, Check, TrendingUp } from "lucide-react";
import Link from "next/link";
import VendorDetailDrawer from "@/components/admin/VendorDetailDrawer";

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ name: "", contact_name: "", contact_phone: "", commission_rate: "10" });
  const [selectedDrawerVendorId, setSelectedDrawerVendorId] = useState<number | null>(null);

  // PIN Visibility States
  const [showPins, setShowPins] = useState<Record<number, boolean>>({});
  const [showAllPins, setShowAllPins] = useState(false);
  const [copiedPinId, setCopiedPinId] = useState<number | null>(null);

  const togglePinVisibility = (opId: number) => {
    setShowPins(prev => ({
      ...prev,
      [opId]: !(showAllPins || prev[opId])
    }));
  };

  const copyPinToClipboard = (pin: string, opId: number) => {
    if (typeof window !== "undefined" && navigator?.clipboard) {
      navigator.clipboard.writeText(pin);
      setCopiedPinId(opId);
      setTimeout(() => setCopiedPinId(null), 2000);
    }
  };

  // PIN Reset Modal State
  const [pinModal, setPinModal] = useState<{
    open: boolean;
    vendor: any | null;
    operator: any | null;
    customPin: string;
    sendWhatsApp: boolean;
    submitting: boolean;
    successMessage: string | null;
    errorMessage: string | null;
  }>({
    open: false,
    vendor: null,
    operator: null,
    customPin: "",
    sendWhatsApp: true,
    submitting: false,
    successMessage: null,
    errorMessage: null,
  });

  // Edit Vendor Contact Modal State
  const [editModal, setEditModal] = useState<{
    open: boolean;
    vendor: any | null;
    name: string;
    contact_name: string;
    contact_phone: string;
    rotatePinOnPhoneChange: boolean;
    submitting: boolean;
    successMessage: string | null;
    errorMessage: string | null;
  }>({
    open: false,
    vendor: null,
    name: "",
    contact_name: "",
    contact_phone: "",
    rotatePinOnPhoneChange: true,
    submitting: false,
    successMessage: null,
    errorMessage: null,
  });

  const [takingOverVendorId, setTakingOverVendorId] = useState<number | null>(null);

  const handleQuickLoginAsVendor = async (vendorId: number) => {
    setTakingOverVendorId(vendorId);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/login-as`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        window.location.href = data.redirectUrl || "/vendor/sell";
      } else {
        alert(data.error || "Failed to switch to vendor session");
        setTakingOverVendorId(null);
      }
    } catch (err: any) {
      alert(err.message || "Network error logging into vendor POS");
      setTakingOverVendorId(null);
    }
  };

  const loadVendors = async () => {
    try {
      const res = await fetch("/api/admin/vendors");
      const data = await res.json();
      setVendors(Array.isArray(data) ? data : (data?.vendors || []));
    } catch (err) {
      console.error("Error fetching vendors:", err);
      setVendors([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVendors();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("add") === "true") {
        setShowAddModal(true);
      }
    }
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          commission_rate: parseFloat(formData.commission_rate) || 10.0,
        }),
      });
      if (res.ok) {
        setShowAddModal(false);
        setFormData({ name: "", contact_name: "", contact_phone: "", commission_rate: "10" });
        await loadVendors();
      }
    } catch (err) {}
  };

  const openResetPinModal = (vendor: any, operator?: any) => {
    setPinModal({
      open: true,
      vendor,
      operator: operator || null,
      customPin: "",
      sendWhatsApp: true,
      submitting: false,
      successMessage: null,
      errorMessage: null,
    });
  };

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinModal.vendor) return;

    setPinModal((prev) => ({ ...prev, submitting: true, errorMessage: null, successMessage: null }));
    try {
      const payload: any = {
        sendWhatsApp: pinModal.sendWhatsApp,
      };
      if (pinModal.customPin.trim()) {
        payload.newPin = pinModal.customPin.trim();
      }
      if (pinModal.operator?.id) {
        payload.operatorId = pinModal.operator.id;
      }

      const res = await fetch(`/api/admin/vendors/${pinModal.vendor.id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset PIN");
      }

      setPinModal((prev) => ({
        ...prev,
        submitting: false,
        successMessage: `PIN reset to ${data.pin} successfully! ${data.whatsAppSent ? "WhatsApp notice sent." : ""}`,
      }));

      await loadVendors();
    } catch (err: any) {
      setPinModal((prev) => ({
        ...prev,
        submitting: false,
        errorMessage: err.message || "Failed to reset PIN",
      }));
    }
  };

  const openEditModal = (vendor: any) => {
    setEditModal({
      open: true,
      vendor,
      name: vendor.name || "",
      contact_name: vendor.contact_name || "",
      contact_phone: vendor.contact_phone || "",
      rotatePinOnPhoneChange: true,
      submitting: false,
      successMessage: null,
      errorMessage: null,
    });
  };

  const handleUpdateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.vendor) return;

    setEditModal((prev) => ({ ...prev, submitting: true, errorMessage: null, successMessage: null }));
    try {
      const res = await fetch(`/api/admin/vendors/${editModal.vendor.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editModal.name,
          contact_name: editModal.contact_name,
          contact_phone: editModal.contact_phone,
          rotatePinOnPhoneChange: editModal.rotatePinOnPhoneChange,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update vendor");
      }

      setEditModal((prev) => ({
        ...prev,
        submitting: false,
        successMessage: data.pinRotated
          ? `Vendor updated! New PIN generated: ${data.newPin} and sent to new phone.`
          : "Vendor contact updated successfully!",
      }));

      await loadVendors();
    } catch (err: any) {
      setEditModal((prev) => ({
        ...prev,
        submitting: false,
        errorMessage: err.message || "Failed to update vendor",
      }));
    }
  };

  return (
    <div className="w-full min-h-screen bg-brand-off-white text-brand-navy p-4 sm:p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-4 border-brand-navy pb-4 gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-brand-navy hover:bg-brand-accent p-2 border-2 border-brand-navy transition-colors font-bold uppercase text-sm shrink-0">
              &larr; Dashboard
            </Link>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-display uppercase flex items-center gap-2">
              <Store className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-brand-navy shrink-0"/> STAFF & VENDOR POS
            </h1>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowAllPins((prev) => !prev)}
              className="border-2 border-brand-navy bg-brand-off-white px-3 py-2 font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white flex items-center justify-center gap-1.5 shadow-(--shadow-brut-xs) transition-colors text-xs cursor-pointer select-none text-center"
              title={showAllPins ? "Mask all operator PINs" : "Reveal all operator PINs"}
            >
              {showAllPins ? <EyeOff className="w-3.5 h-3.5 shrink-0" /> : <Eye className="w-3.5 h-3.5 text-brand-navy shrink-0" />}
              <span className="truncate">{showAllPins ? "Mask PINs" : "View PINs"}</span>
            </button>
            <Link
              href="/admin/settlements"
              className="border-2 border-brand-navy bg-brand-off-white px-3 py-2 font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white flex items-center justify-center gap-1.5 shadow-(--shadow-brut-xs) transition-colors text-xs text-center"
            >
              <Receipt className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Settlements</span>
            </Link>
            <Link
              href="/vendor/sell"
              target="_blank"
              className="border-2 border-brand-navy bg-brand-navy text-brand-off-white px-3 py-2 font-bold uppercase hover:bg-brand-accent hover:text-brand-navy flex items-center justify-center gap-1.5 shadow-(--shadow-brut-xs) transition-colors text-xs text-center"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Open POS</span>
            </Link>
            <button 
              onClick={() => setShowAddModal(true)}
              className="border-2 border-brand-navy bg-brand-accent px-3 sm:px-4 py-2 font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white flex items-center justify-center gap-1.5 shadow-(--shadow-brut-sm) transition-colors cursor-pointer text-xs md:text-sm text-center"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">+ Add Vendor</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xl font-bold uppercase animate-pulse">Loading Vendors...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vendors.map((v) => (
              <div key={v.id} className="border-4 border-brand-navy bg-white p-5 shadow-(--shadow-brut-md) flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <button
                      type="button"
                      onClick={() => setSelectedDrawerVendorId(v.id)}
                      className="text-left group cursor-pointer"
                      title="Click to view full vendor stock, velocity & sales audit"
                    >
                      <h3 className="font-display text-xl uppercase leading-tight font-black group-hover:text-blue-700 underline decoration-2 underline-offset-2 transition-colors flex items-center gap-1.5">
                        {v.name}
                        <ExternalLink className="w-4 h-4 text-brand-navy/50 group-hover:text-blue-700 shrink-0" />
                      </h3>
                    </button>
                    <span className="text-xs bg-brand-navy text-brand-accent px-2 py-0.5 uppercase font-bold">{v.status || "Active"}</span>
                  </div>
                  
                  <div className="text-sm space-y-1 mb-4">
                    <p><span className="opacity-60 font-bold uppercase text-xs">Contact:</span> {v.contact_name || "—"}</p>
                    <p><span className="opacity-60 font-bold uppercase text-xs">Phone:</span> {v.contact_phone || "—"}</p>
                  </div>

                  <div className="pt-3 border-t-2 border-brand-navy border-dashed mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-brand-navy/70">Assigned Operators</span>
                    </div>

                    {v.vendor_operators && v.vendor_operators.length > 0 ? (
                      <div className="space-y-2">
                        {v.vendor_operators.map((op: any) => {
                          const isRevealed = showAllPins || !!showPins[op.id];
                          const pinDisplay = isRevealed ? (op.pin || "None") : "••••";

                          return (
                            <div key={op.id} className="flex justify-between items-center text-xs py-1.5 px-2 bg-brand-off-white border border-brand-navy/30">
                              <div className="min-w-0 pr-2">
                                <span className="font-bold truncate">{op.name}</span>
                                <span className="text-[10px] opacity-60 ml-1 uppercase">({op.role})</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => togglePinVisibility(op.id)}
                                  title={isRevealed ? "Click to mask PIN" : "Click to view PIN"}
                                  className="font-mono bg-brand-accent/30 hover:bg-brand-accent px-1.5 py-0.5 border border-brand-navy/30 font-bold flex items-center gap-1.5 transition-colors cursor-pointer select-none text-[11px]"
                                >
                                  <span className="opacity-70 text-[10px]">PIN:</span>
                                  <span className="font-mono font-black tracking-widest text-brand-navy">
                                    {pinDisplay}
                                  </span>
                                  {isRevealed ? (
                                    <EyeOff className="w-3 h-3 text-brand-navy/70 shrink-0" />
                                  ) : (
                                    <Eye className="w-3 h-3 text-brand-navy/70 shrink-0" />
                                  )}
                                </button>

                                {isRevealed && op.pin && (
                                  <button
                                    type="button"
                                    onClick={() => copyPinToClipboard(op.pin, op.id)}
                                    title="Copy PIN to clipboard"
                                    className="border border-brand-navy bg-white hover:bg-brand-accent p-1 text-xs font-bold uppercase transition-colors shrink-0"
                                  >
                                    {copiedPinId === op.id ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                )}

                                <button
                                  onClick={() => openResetPinModal(v, op)}
                                  title="Reset Operator PIN"
                                  className="border border-brand-navy bg-white hover:bg-brand-accent p-1 text-xs font-bold uppercase transition-colors shrink-0"
                                >
                                  <Key className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between py-1">
                        <p className="text-xs opacity-50 italic">None assigned</p>
                        <button
                          onClick={() => openResetPinModal(v)}
                          className="border border-brand-navy bg-brand-off-white hover:bg-brand-accent px-2 py-0.5 text-xs font-bold uppercase transition-colors"
                        >
                          <Key className="w-3 h-3 inline mr-1" /> Set PIN
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t-2 border-brand-navy space-y-2">
                  <button
                    type="button"
                    onClick={() => handleQuickLoginAsVendor(v.id)}
                    disabled={takingOverVendorId === v.id}
                    className="w-full border-2 border-brand-navy bg-brand-navy text-brand-off-white hover:bg-brand-accent hover:text-brand-navy px-3 py-2 text-xs font-black uppercase flex items-center justify-center gap-1.5 transition-colors shadow-(--shadow-brut-xs) cursor-pointer disabled:opacity-50"
                    title="Quick login as this vendor to sell items if vendor has left"
                  >
                    <Store className="w-3.5 h-3.5 text-brand-accent" />
                    {takingOverVendorId === v.id ? "TAKING OVER POS..." : "LOGIN AS VENDOR (MAKE SALES) ↗"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDrawerVendorId(v.id)}
                    className="w-full border-2 border-brand-navy bg-yellow-300 hover:bg-brand-navy hover:text-white px-3 py-2 text-xs font-black uppercase flex items-center justify-center gap-1.5 transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
                  >
                    <TrendingUp className="w-3.5 h-3.5" /> VIEW STOCK & SALES DATA ↗
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(v)}
                      className="flex-1 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-navy hover:text-white px-2 py-1.5 text-xs font-bold uppercase flex items-center justify-center gap-1 transition-colors shadow-(--shadow-brut-xs)"
                    >
                      <Edit className="w-3.5 h-3.5" /> Edit Contact
                    </button>
                    <button
                      onClick={() => openResetPinModal(v)}
                      className="flex-1 border-2 border-brand-navy bg-brand-accent hover:bg-brand-navy hover:text-brand-off-white px-2 py-1.5 text-xs font-bold uppercase flex items-center justify-center gap-1 transition-colors shadow-(--shadow-brut-xs)"
                    >
                      <Key className="w-3.5 h-3.5" /> Reset PIN
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: New Vendor */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 backdrop-blur-sm p-4">
            <div className="bg-brand-off-white border-4 border-brand-navy w-full max-w-md p-6 shadow-(--shadow-brut-xl-accent)">
              <h2 className="text-2xl font-display uppercase mb-4 border-b-2 border-brand-navy pb-2">New Vendor</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold uppercase mb-1">Business Name</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent" />
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase mb-1">Contact Name</label>
                  <input type="text" value={formData.contact_name} onChange={e => setFormData({...formData, contact_name: e.target.value})} className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent" />
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase mb-1">Contact Phone</label>
                  <input type="text" value={formData.contact_phone} onChange={e => setFormData({...formData, contact_phone: e.target.value})} className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent" />
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase mb-1">
                    Commission Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.commission_rate}
                    onChange={(e) => setFormData({ ...formData, commission_rate: e.target.value })}
                    className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent"
                    placeholder="e.g. 10.0"
                  />
                  <p className="text-[11px] opacity-75 mt-1">
                    Agreed festival commission percentage retained from sales (defaults to 10%).
                  </p>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="submit" className="flex-1 bg-brand-navy text-brand-off-white border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-accent hover:text-brand-navy transition-colors">Create</button>
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-transparent border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-navy/10 transition-colors">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Reset PIN */}
        {pinModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 backdrop-blur-sm p-4">
            <div className="bg-brand-off-white border-4 border-brand-navy w-full max-w-md p-6 shadow-(--shadow-brut-xl-accent)">
              <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2 mb-4">
                <h2 className="text-xl font-display uppercase flex items-center gap-2">
                  <Key className="w-5 h-5 text-brand-navy" /> Reset POS PIN
                </h2>
                <span className="text-xs bg-brand-navy text-brand-accent px-2 py-0.5 font-bold uppercase">
                  {pinModal.vendor?.name}
                </span>
              </div>

              {pinModal.successMessage ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-100 border-2 border-brand-navy text-emerald-950 text-sm font-bold flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-700 shrink-0" />
                    <span>{pinModal.successMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPinModal((prev) => ({ ...prev, open: false }))}
                    className="w-full bg-brand-navy text-white border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-accent hover:text-brand-navy transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPin} className="space-y-4">
                  {pinModal.errorMessage && (
                    <div className="p-3 bg-red-100 border-2 border-brand-navy text-red-950 text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{pinModal.errorMessage}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Target Operator</label>
                    <div className="p-2 border-2 border-brand-navy bg-white text-sm font-bold flex justify-between items-center">
                      {pinModal.operator ? (
                        <>
                          <span>{pinModal.operator.name} ({pinModal.operator.role})</span>
                          {pinModal.operator.pin && (
                            <span className="font-mono bg-brand-accent/40 px-2 py-0.5 border border-brand-navy text-xs">
                              CURRENT PIN: <span className="font-black text-brand-navy">{pinModal.operator.pin}</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="opacity-70">Primary Vendor Operator</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">
                      New 4-Digit PIN <span className="opacity-50 lowercase font-normal">(leave blank to auto-generate)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      pattern="[0-9]{4}"
                      placeholder="e.g. 4821 or blank"
                      value={pinModal.customPin}
                      onChange={(e) => setPinModal({ ...pinModal, customPin: e.target.value.replace(/[^0-9]/g, "") })}
                      className="w-full border-2 border-brand-navy p-2 bg-white text-lg tracking-widest font-mono text-center focus:outline-none focus:ring-4 focus:ring-brand-accent"
                    />
                  </div>

                  <div className="p-3 border-2 border-brand-navy bg-brand-accent/20">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold uppercase">
                      <input
                        type="checkbox"
                        checked={pinModal.sendWhatsApp}
                        onChange={(e) => setPinModal({ ...pinModal, sendWhatsApp: e.target.checked })}
                        className="w-4 h-4 accent-brand-navy border-2 border-brand-navy"
                      />
                      <span>Dispatch PIN Notice via WhatsApp</span>
                    </label>
                    <p className="text-[11px] opacity-75 mt-1 ml-6">
                      Sends credentials directly to {pinModal.vendor?.contact_phone || "vendor phone"}.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={pinModal.submitting}
                      className="flex-1 bg-brand-navy text-brand-off-white border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-accent hover:text-brand-navy transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {pinModal.submitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Resetting...
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4" /> Reset Credentials
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={pinModal.submitting}
                      onClick={() => setPinModal((prev) => ({ ...prev, open: false }))}
                      className="bg-transparent border-2 border-brand-navy font-bold uppercase px-4 py-3 hover:bg-brand-navy/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Modal: Edit Vendor Contact */}
        {editModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 backdrop-blur-sm p-4">
            <div className="bg-brand-off-white border-4 border-brand-navy w-full max-w-md p-6 shadow-(--shadow-brut-xl-accent)">
              <div className="flex items-center justify-between border-b-2 border-brand-navy pb-2 mb-4">
                <h2 className="text-xl font-display uppercase flex items-center gap-2">
                  <Edit className="w-5 h-5 text-brand-navy" /> Edit Vendor Contact
                </h2>
                <span className="text-xs bg-brand-navy text-brand-accent px-2 py-0.5 font-bold uppercase">
                  ID: #{editModal.vendor?.id}
                </span>
              </div>

              {editModal.successMessage ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-100 border-2 border-brand-navy text-emerald-950 text-sm font-bold flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-700 shrink-0" />
                    <span>{editModal.successMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditModal((prev) => ({ ...prev, open: false }))}
                    className="w-full bg-brand-navy text-white border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-accent hover:text-brand-navy transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleUpdateVendor} className="space-y-4">
                  {editModal.errorMessage && (
                    <div className="p-3 bg-red-100 border-2 border-brand-navy text-red-950 text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{editModal.errorMessage}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Vendor / Business Name</label>
                    <input
                      type="text"
                      required
                      value={editModal.name}
                      onChange={(e) => setEditModal({ ...editModal, name: e.target.value })}
                      className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Contact Person Name</label>
                    <input
                      type="text"
                      value={editModal.contact_name}
                      onChange={(e) => setEditModal({ ...editModal, contact_name: e.target.value })}
                      className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Contact Phone (M-Pesa / WhatsApp)</label>
                    <input
                      type="text"
                      value={editModal.contact_phone}
                      onChange={(e) => setEditModal({ ...editModal, contact_phone: e.target.value })}
                      className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent text-sm"
                      placeholder="e.g. 0712345678 or 254712345678"
                    />
                  </div>

                  <div className="p-3 border-2 border-brand-navy bg-brand-accent/20">
                    <label className="flex items-start gap-2 cursor-pointer text-xs font-bold uppercase">
                      <input
                        type="checkbox"
                        checked={editModal.rotatePinOnPhoneChange}
                        onChange={(e) => setEditModal({ ...editModal, rotatePinOnPhoneChange: e.target.checked })}
                        className="w-4 h-4 mt-0.5 accent-brand-navy border-2 border-brand-navy"
                      />
                      <span>Automatically rotate POS PIN & dispatch to new phone on phone change</span>
                    </label>
                    <p className="text-[11px] opacity-75 mt-1 ml-6">
                      Security safeguard (GAP 24): When a contact phone changes, revokes existing credentials and provisions a fresh PIN.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={editModal.submitting}
                      className="flex-1 bg-brand-navy text-brand-off-white border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-accent hover:text-brand-navy transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {editModal.submitting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" /> Save Changes
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={editModal.submitting}
                      onClick={() => setEditModal((prev) => ({ ...prev, open: false }))}
                      className="bg-transparent border-2 border-brand-navy font-bold uppercase px-4 py-3 hover:bg-brand-navy/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Vendor Intelligence & Audit Drawer */}
        <VendorDetailDrawer
          vendorId={selectedDrawerVendorId}
          isOpen={selectedDrawerVendorId !== null}
          onClose={() => setSelectedDrawerVendorId(null)}
          onSettlementRecorded={() => loadVendors()}
        />
      </div>
    </div>
  );
}
