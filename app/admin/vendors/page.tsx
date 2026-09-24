"use client";

import React, { useState, useEffect } from "react";
import { Store, Plus, Key, CheckCircle, Flame } from "lucide-react";
import Link from "next/link";

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ name: "", contact_name: "", contact_phone: "" });

  useEffect(() => {
    fetch("/api/admin/vendors")
      .then((res) => res.json())
      .then((data) => {
        setVendors(data);
        setLoading(false);
      });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowAddModal(false);
        const data = await fetch("/api/admin/vendors").then(r => r.json());
        setVendors(data);
      }
    } catch (err) {}
  };

  return (
    <div className="w-full min-h-screen bg-brand-off-white text-brand-navy p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b-4 border-brand-navy pb-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-brand-navy hover:bg-brand-accent p-2 border-2 border-brand-navy transition-colors">
              &larr; Back
            </Link>
            <h1 className="text-3xl font-display uppercase flex items-center gap-2"><Store className="w-8 h-8"/> Vendors</h1>
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className="border-2 border-brand-navy bg-brand-accent px-4 py-2 font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white flex items-center gap-2 shadow-(--shadow-brut-sm)"
          >
            <Plus className="w-4 h-4" /> Add Vendor
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xl font-bold uppercase animate-pulse">Loading Vendors...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vendors.map((v) => (
              <div key={v.id} className="border-4 border-brand-navy bg-white p-4 shadow-(--shadow-brut-md)">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-display text-xl uppercase leading-tight">{v.name}</h3>
                  <span className="text-xs bg-brand-navy text-brand-accent px-2 py-1 uppercase font-bold">{v.status || "Active"}</span>
                </div>
                <div className="text-sm space-y-1 mb-4">
                  <p><span className="opacity-50">Contact:</span> {v.contact_name}</p>
                  <p><span className="opacity-50">Phone:</span> {v.contact_phone}</p>
                </div>
                <div className="pt-4 border-t-2 border-brand-navy border-dashed">
                  <p className="text-xs font-bold uppercase opacity-50 mb-2">Operators</p>
                  {v.vendor_operators?.map((op: any) => (
                    <div key={op.id} className="flex justify-between items-center text-sm py-1">
                      <span>{op.name} ({op.role})</span>
                      <span className="font-mono bg-brand-accent/20 px-1 border border-brand-navy/20">PIN: {op.pin}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

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
                <div className="flex gap-4 pt-4">
                  <button type="submit" className="flex-1 bg-brand-navy text-brand-off-white border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-accent hover:text-brand-navy transition-colors">Create</button>
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-transparent border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-navy/10 transition-colors">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
