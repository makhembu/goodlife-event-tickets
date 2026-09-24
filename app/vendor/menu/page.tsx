"use client";

import { useState } from 'react';
import { HapticFeedback } from '@/components/ui/haptic-feedback';

interface CatalogItem {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  status: 'ACTIVE' | 'OUT OF STOCK' | 'LOW STOCK';
  alertThreshold: number;
  modifiers: string;
}

const INITIAL_CATALOG: CatalogItem[] = [
  { id: '1', name: 'MANGO POWER CRUSH', price: 300, category: 'Drinks', stock: 24, status: 'ACTIVE', alertThreshold: 5, modifiers: 'Large (+50), Extra Ginger (+20)' },
  { id: '2', name: 'PASSION MINT BLASTER', price: 250, category: 'Drinks', stock: 3, status: 'LOW STOCK', alertThreshold: 5, modifiers: 'None' },
];

export default function VendorMenuPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>(INITIAL_CATALOG);
  const categories = ['Drinks', 'Food Combos', 'Shisha', 'Extras'];

  const adjustStock = (id: string, delta: number) => {
    HapticFeedback.trigger('confirmation');
    setCatalog(prev => prev.map(item => {
      if (item.id === id) {
        const newStock = Math.max(0, item.stock + delta);
        let newStatus = item.status;
        if (newStock === 0) newStatus = 'OUT OF STOCK';
        else if (newStock <= item.alertThreshold) newStatus = 'LOW STOCK';
        else newStatus = 'ACTIVE';
        return { ...item, stock: newStock, status: newStatus as any };
      }
      return item;
    }));
  };

  const toggleStatus = (id: string) => {
    HapticFeedback.trigger('confirmation');
    setCatalog(prev => prev.map(item => {
      if (item.id === id) {
        const newStock = item.stock > 0 ? 0 : 10; // dummy logic to toggle
        return { 
          ...item, 
          stock: newStock,
          status: newStock === 0 ? 'OUT OF STOCK' : 'ACTIVE' 
        };
      }
      return item;
    }));
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 bg-brand-bg overflow-y-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl">STALL CATALOG</h1>
          <div className="text-caption font-bold text-brand-navy-light uppercase">Stall: Jaba Juice | Event: GOODLIFE XP</div>
        </div>
        <button className="px-6 py-3 bg-brand-accent text-brand-black border-4 border-brand-black font-bold uppercase active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_0px_#16181D] transition-transform">
          + Add New Item
        </button>
      </div>

      <div className="mb-6 flex overflow-x-auto gap-2 custom-scrollbar pb-2">
        <div className="font-bold uppercase text-footnote flex items-center mr-2 text-brand-navy-light">Categories:</div>
        {categories.map(cat => (
          <button key={cat} className="px-3 py-1 bg-brand-off-white border-2 border-brand-black font-bold text-caption uppercase hover:bg-brand-black hover:text-white transition-colors">
            {cat}
          </button>
        ))}
        <button className="px-3 py-1 bg-brand-bg border-2 border-dashed border-brand-navy-light font-bold text-caption uppercase text-brand-navy-light hover:text-brand-black hover:border-brand-black transition-colors">
          + New Category
        </button>
      </div>

      <div className="font-display text-2xl mb-4 text-brand-black">CURRENT CATALOG ITEMS</div>

      <div className="flex flex-col gap-4">
        {catalog.map(item => (
          <div key={item.id} className="bg-brand-off-white border-4 border-brand-black p-4 md:p-6 shadow-[4px_4px_0px_0px_#16181D]">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-4 border-b-2 border-brand-bg pb-4">
              <div className="font-bold text-body md:text-lg uppercase">
                {item.name} <span className="text-brand-navy-light px-2">·</span> KES {item.price} <span className="text-brand-navy-light px-2">·</span> {item.category}
              </div>
              <div>
                {item.status === 'ACTIVE' && <span className="bg-brand-success-bg text-brand-success font-bold text-caption px-3 py-1 border border-brand-success uppercase">Active</span>}
                {item.status === 'LOW STOCK' && <span className="bg-brand-warning-bg text-brand-warning font-bold text-caption px-3 py-1 border border-brand-warning uppercase">Low Stock ⚠️</span>}
                {item.status === 'OUT OF STOCK' && <span className="bg-brand-danger-bg text-brand-danger font-bold text-caption px-3 py-1 border border-brand-danger uppercase">Sold Out ⛔</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <div className="text-caption font-bold text-brand-navy-light uppercase mb-2">Stock Count</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => adjustStock(item.id, -10)} className="px-3 py-2 bg-brand-bg border-2 border-brand-black font-bold text-footnote hover:bg-brand-black hover:text-white">- 10</button>
                  <button onClick={() => adjustStock(item.id, -1)} className="px-3 py-2 bg-brand-bg border-2 border-brand-black font-bold text-footnote hover:bg-brand-black hover:text-white">- 1</button>
                  <div className="px-4 py-2 bg-white border-2 border-brand-black font-bold text-body min-w-[120px] text-center">
                    {item.stock} in stock
                  </div>
                  <button onClick={() => adjustStock(item.id, 1)} className="px-3 py-2 bg-brand-bg border-2 border-brand-black font-bold text-footnote hover:bg-brand-black hover:text-white">+ 1</button>
                  <button onClick={() => adjustStock(item.id, 10)} className="px-3 py-2 bg-brand-bg border-2 border-brand-black font-bold text-footnote hover:bg-brand-black hover:text-white">+ 10</button>
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <div className="text-caption font-bold text-brand-navy-light uppercase mb-1">Alert Threshold</div>
                <div className="font-bold text-footnote mb-2">{item.alertThreshold} items</div>
                <div className="text-caption font-bold text-brand-navy-light uppercase mb-1">Modifiers</div>
                <div className="font-bold text-footnote">{item.modifiers}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="px-4 py-2 bg-brand-navy-light text-brand-off-white border-2 border-brand-black font-bold text-caption uppercase hover:bg-brand-black transition-colors">
                Edit Details
              </button>
              <button 
                onClick={() => toggleStatus(item.id)}
                className="px-4 py-2 bg-brand-bg text-brand-black border-2 border-brand-black font-bold text-caption uppercase hover:bg-brand-black hover:text-white transition-colors"
              >
                Toggle Out of Stock
              </button>
              <button className="px-4 py-2 bg-brand-danger-bg text-brand-danger border-2 border-brand-danger font-bold text-caption uppercase hover:bg-brand-danger hover:text-white transition-colors ml-auto">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
