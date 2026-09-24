"use client";

import React, { useState, useEffect } from "react";
import { ShoppingCart, Plus, Minus, CreditCard, Banknote, Users } from "lucide-react";
import { HapticFeedback } from "@/components/ui/haptic-feedback";

export default function VendorSellPage() {
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);
  
  // Split payment state
  const [cashAmount, setCashAmount] = useState("");
  const [mpesaAmount, setMpesaAmount] = useState("");
  const [tabAmount, setTabAmount] = useState("");
  const [tabId, setTabId] = useState("");
  const [tabs, setTabs] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/vendor/items")
      .then(res => res.json())
      .then(data => { setItems(data.filter((i: any) => i.is_available)); setLoading(false); });
    
    fetch("/api/vendor/tabs")
      .then(res => res.json())
      .then(data => { setTabs(data.filter((t: any) => t.status === 'open')); });
  }, []);

  const addToCart = (item: any) => {
    HapticFeedback.trigger("confirmation");
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: number, delta: number) => {
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

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    const splitPayments = [];
    if (Number(cashAmount) > 0) splitPayments.push({ method: "cash", amount: Number(cashAmount) });
    if (Number(mpesaAmount) > 0) splitPayments.push({ method: "mpesa", amount: Number(mpesaAmount) });
    if (Number(tabAmount) > 0 && tabId) splitPayments.push({ method: "tab", amount: Number(tabAmount), tab_id: Number(tabId) });

    const totalPaid = splitPayments.reduce((s, p) => s + p.amount, 0);
    if (totalPaid < total) {
      alert("Insufficient payment amounts!");
      return;
    }

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
      if (res.ok) {
        HapticFeedback.trigger("success");
        setCart([]);
        setShowCheckout(false);
        setCashAmount(""); setMpesaAmount(""); setTabAmount(""); setTabId("");
      } else {
        HapticFeedback.trigger("error");
        alert("Checkout failed");
      }
    } catch (e) {
      HapticFeedback.trigger("error");
    }
  };

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-brand-off-white">
      {/* Items Grid */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {loading ? (
          <div className="animate-pulse font-bold uppercase text-brand-navy">Loading Menu...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 pb-32 md:pb-0">
            {items.map(item => (
              <button 
                key={item.id}
                onClick={() => addToCart(item)}
                className="flex flex-col items-start p-4 border-4 border-brand-navy bg-white hover:bg-brand-accent/20 active:scale-[0.98] transition-all shadow-(--shadow-brut-sm) text-left h-32 justify-between"
              >
                <span className="font-display text-lg leading-tight uppercase line-clamp-2">{item.name}</span>
                <span className="font-mono font-bold text-lg text-brand-accent bg-brand-navy px-2 py-1 shadow-(--shadow-brut-xs)">
                  KES {Number(item.price).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart Panel */}
      <div className="w-full md:w-80 lg:w-96 bg-white border-l-4 border-brand-navy flex flex-col h-[50vh] md:h-full fixed md:relative bottom-16 md:bottom-0 z-40 border-t-4 md:border-t-0 shadow-(--shadow-brut-xl-strong) md:shadow-none">
        <div className="p-4 border-b-4 border-brand-navy bg-brand-accent text-brand-navy font-display text-xl uppercase flex justify-between items-center">
          <span className="flex items-center gap-2"><ShoppingCart className="w-6 h-6"/> Ticket</span>
          <span className="font-mono bg-white px-2 py-0.5 border-2 border-brand-navy">{cart.length}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('/noise.png')]">
          {cart.map(item => (
            <div key={item.id} className="flex flex-col border-b-2 border-dashed border-brand-navy/30 pb-2">
              <div className="flex justify-between font-bold uppercase text-sm mb-2">
                <span>{item.name}</span>
                <span>KES {(item.price * item.quantity).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs opacity-60">KES {Number(item.price).toLocaleString()} ea</span>
                <div className="flex items-center gap-3 bg-brand-navy text-brand-off-white p-1">
                  <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:text-brand-accent"><Minus className="w-4 h-4"/></button>
                  <span className="font-mono font-bold w-6 text-center">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:text-brand-accent"><Plus className="w-4 h-4"/></button>
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
            onClick={() => setShowCheckout(true)}
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
            
            <div className="space-y-6 flex-1">
              <div className="border-4 border-brand-navy p-4 bg-white relative">
                <Banknote className="absolute -top-4 -left-4 w-8 h-8 bg-brand-accent border-2 border-brand-navy p-1 text-brand-navy" />
                <label className="block text-sm font-bold uppercase mb-2 ml-4">Cash Amount</label>
                <input type="number" placeholder="0" value={cashAmount} onChange={e => setCashAmount(e.target.value)} className="w-full text-2xl font-mono p-3 border-2 border-brand-navy bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none" />
              </div>

              <div className="border-4 border-brand-navy p-4 bg-white relative">
                <CreditCard className="absolute -top-4 -left-4 w-8 h-8 bg-[#25D366] border-2 border-brand-navy p-1 text-brand-navy" />
                <label className="block text-sm font-bold uppercase mb-2 ml-4">M-Pesa Amount</label>
                <input type="number" placeholder="0" value={mpesaAmount} onChange={e => setMpesaAmount(e.target.value)} className="w-full text-2xl font-mono p-3 border-2 border-brand-navy bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none" />
              </div>

              <div className="border-4 border-brand-navy p-4 bg-white relative">
                <Users className="absolute -top-4 -left-4 w-8 h-8 bg-brand-navy border-2 border-brand-navy p-1 text-brand-off-white" />
                <label className="block text-sm font-bold uppercase mb-2 ml-4">Staff Tab Amount</label>
                <div className="flex gap-2">
                  <select value={tabId} onChange={e => setTabId(e.target.value)} className="flex-1 border-2 border-brand-navy p-3 bg-brand-off-white font-mono text-sm focus:ring-4 focus:ring-brand-accent outline-none">
                    <option value="">Select Tab...</option>
                    {tabs.map(t => <option key={t.id} value={t.id}>{t.customer_name} (KES {t.credit_limit - t.balance} left)</option>)}
                  </select>
                  <input type="number" placeholder="0" value={tabAmount} onChange={e => setTabAmount(e.target.value)} className="w-32 text-xl font-mono p-3 border-2 border-brand-navy bg-brand-off-white focus:ring-4 focus:ring-brand-accent outline-none" />
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button onClick={() => setShowCheckout(false)} className="flex-1 bg-transparent border-4 border-brand-navy font-bold uppercase p-4 hover:bg-brand-navy/10 text-xl transition-colors">Cancel</button>
              <button onClick={handleCheckout} className="flex-1 bg-brand-navy text-brand-accent border-4 border-brand-navy font-display uppercase p-4 hover:bg-brand-accent hover:text-brand-navy text-2xl transition-colors">Complete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
